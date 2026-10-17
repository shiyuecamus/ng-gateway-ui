"""Independent FreeOpcUa server with explicit subscription admission faults."""

import asyncio
import json
import signal
import sys

import asyncua
from asyncua import Server, ua
from asyncua.server.internal_session import InternalSession
from asyncua.server.binary_server_asyncio import OPCUAProtocol
from asyncua.server.uaprocessor import UaProcessor


async def main():
    if asyncua.__version__ != "1.1.5":
        raise RuntimeError("This peer requires the pinned asyncua 1.1.5 environment")
    port, mode = sys.argv[1:]
    if mode == "readWindow":
        original_received = OPCUAProtocol.data_received

        def received(protocol, data):
            original_received(protocol, data)
            print(json.dumps({"event": "receiveQueue", "size": protocol.messages.qsize()}), flush=True)

        OPCUAProtocol.data_received = received
    if mode == "uncorrelated":
        original_send = UaProcessor.send_response

        def send(processor, requesthandle, seqhdr, response, msgtype=ua.MessageType.SecureMessage):
            if isinstance(response, ua.ReadResponse):
                requesthandle = (requesthandle + 1) & 0xffffffff
                print(json.dumps({"event": "uncorrelatedReadHeader"}), flush=True)
            return original_send(processor, requesthandle, seqhdr, response, msgtype)

        UaProcessor.send_response = send
    if mode in ["healthy", "polling"]:
        original_process = UaProcessor._process_message

        async def process(processor, typeid, requesthdr, seqhdr, body):
            result = await original_process(processor, typeid, requesthdr, seqhdr, body)
            if typeid == ua.NodeId(ua.ObjectIds.PublishRequest_Encoding_DefaultBinary):
                print(json.dumps({"event": "publishQueue", "connection": id(processor),
                                  "queued": len(processor._publish_requests)}), flush=True)
            return result

        UaProcessor._process_message = process
    stopped = asyncio.Event()
    reindex = asyncio.Event()
    subscription_fault = asyncio.Event()
    asyncio.get_running_loop().add_signal_handler(signal.SIGUSR1, reindex.set)
    asyncio.get_running_loop().add_signal_handler(signal.SIGUSR2, subscription_fault.set)
    for sig in [signal.SIGTERM, signal.SIGINT]:
        asyncio.get_running_loop().add_signal_handler(sig, stopped.set)
    values = {"First": 7, "Second": 7}
    types = {"First": ua.VariantType.Int32, "Second": ua.VariantType.Int32}
    if mode in ["readWindow", "tooManyOperations"]:
        for index in range(16):
            values[f"Wide{index}"] = index
            types[f"Wide{index}"] = ua.VariantType.Int32
    if mode in ["healthy", "polling"]:
        values.update({"Exact": 9007199254740993, "Unsigned": 18446744073709551615,
                       "Extended": "170141183460469231731687303715884105727"})
        types.update({"Exact": ua.VariantType.Int64, "Unsigned": ua.VariantType.UInt64,
                      "Extended": ua.VariantType.String})
    original_read = InternalSession.read
    original_write = InternalSession.write

    async def read(session, params):
        names = [item.NodeId.to_string() for item in params.NodesToRead
                 if item.NodeId.Identifier in values]
        if session.external and names:
            print(json.dumps({"event": "readValues", "nodes": names}), flush=True)
            if mode == "readWindow":
                await asyncio.sleep(0.12)
            if mode == "tooManyOperations" and len(names) > 2:
                raise ua.UaStatusCodeError(ua.StatusCodes.BadTooManyOperations)
        return await original_read(session, params)

    async def write(session, params):
        names = [item.NodeId.to_string() for item in params.NodesToWrite
                 if item.NodeId.Identifier in values]
        if session.external and names:
            print(json.dumps({"event": "writeValues", "nodes": names}), flush=True)
        return await original_write(session, params)

    # Trace the actual external service boundary, preserving the library handlers.
    InternalSession.read = read
    InternalSession.write = write
    reordered = False
    while not stopped.is_set():
        server = Server()
        await server.init()
        server.set_endpoint(f"opc.tcp://127.0.0.1:{port}/")
        server.set_security_policy([ua.SecurityPolicyType.NoSecurity])
        if reordered:
            other = await server.register_namespace("urn:ng:a4:different-device")
            await server.nodes.objects.add_variable(
                ua.NodeId("First", other), "Different physical device", ua.Variant(999, ua.VariantType.Int32)
            )
        namespace = await server.register_namespace("urn:ng:a4:physical-device")
        nodes = {}
        for name, value in values.items():
            if mode == "rejected" and name == "Second":
                continue
            node = await server.nodes.objects.add_variable(
                ua.NodeId(name, namespace), name, ua.Variant(value, types[name])
            )
            if name != "Second":
                await node.set_writable()
            nodes[name] = node
        if mode == "capacity":
            await server.get_node(ua.ObjectIds.Server_ServerCapabilities_MaxMonitoredItems).write_value(
                ua.Variant(1, ua.VariantType.UInt32)
            )
        if mode == "readWindow":
            await server.get_node(ua.ObjectIds.Server_ServerCapabilities_OperationLimits_MaxNodesPerRead).write_value(
                ua.Variant(1, ua.VariantType.UInt32)
            )
        if mode in ["healthy", "polling"]:
            for identifier, value in [
                (ua.ObjectIds.Server_ServerCapabilities_MaxSubscriptionsPerSession, 5),
                (ua.ObjectIds.Server_ServerCapabilities_MaxMonitoredItemsPerSubscription, 1),
                (ua.ObjectIds.Server_ServerCapabilities_OperationLimits_MaxMonitoredItemsPerCall, 1),
            ]:
                await server.get_node(identifier).write_value(ua.Variant(value, ua.VariantType.UInt32))
        service = server.iserver.subscription_service
        original_create = service.create_monitored_items

        async def create(params):
            print(json.dumps({"event": "createItems", "nodes": [
                item.ItemToMonitor.NodeId.to_string() for item in params.ItemsToCreate
            ]}), flush=True)
            if mode == "delayed":
                await asyncio.sleep(5)
            results = await original_create(params)
            print(json.dumps({"event": "createdItems", "statuses": [
                result.StatusCode.value for result in results
            ]}), flush=True)
            return results

        # The ordinary library owns the codec, session, subscription and data.
        # Only the selected delayed-response fault wraps its service call.
        service.create_monitored_items = create
        async with server:
            print(json.dumps({"event": "ready", "library": asyncua.__version__,
                              "namespace": namespace, "mode": mode}), flush=True)
            while not stopped.is_set() and not reindex.is_set():
                tasks = [asyncio.create_task(event.wait())
                         for event in [stopped, reindex, subscription_fault]]
                try:
                    await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
                    if subscription_fault.is_set():
                        subscription_fault.clear()
                        active = list(service.subscriptions.values())
                        if not active:
                            raise RuntimeError("No native subscription is available for the status fault")
                        await active[-1].enqueue_statuschange(ua.StatusCode(ua.StatusCodes.BadTimeout))
                        print(json.dumps({"event": "subscriptionStatusFault"}), flush=True)
                finally:
                    for task in tasks:
                        task.cancel()
                    await asyncio.gather(*tasks, return_exceptions=True)
            values.update({name: await node.read_value() for name, node in nodes.items()})
            # Close the owned listener before joining processors, so a reconnecting
            # client cannot replenish BinaryServer.stop's closing-task queue.
            if server.bserver is None or server.bserver._server is None:
                raise RuntimeError("The owned OPC UA listener is unavailable")
            server.bserver._server.close()
            await server.bserver._server.wait_closed()
        reordered = True
        reindex.clear()


asyncio.run(main())
