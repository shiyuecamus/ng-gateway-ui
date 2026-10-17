"""Read gateway clock evidence through an independent FreeOpcUa client."""

import asyncio
import json
import sys
import time

from asyncua import Client, ua


async def probe():
    endpoint, namespace, path, freshness = sys.argv[1:]
    deadline = time.monotonic() + 20
    last_error = None
    while time.monotonic() < deadline:
        try:
            async with Client(endpoint, timeout=2) as client:
                index = await client.get_namespace_index(namespace)
                point = client.get_node(ua.NodeId(path, index))
                metadata = client.get_node(ua.NodeId(path + "/SampleMetadata", index))
                facts = json.loads(await metadata.read_value())
                if facts["freshness"] != freshness:
                    raise ValueError("Gateway has not published the expected freshness yet")
                parameters = ua.ReadParameters()
                parameters.TimestampsToReturn = ua.TimestampsToReturn.Both
                requested = ua.ReadValueId()
                requested.NodeId = point.nodeid
                requested.AttributeId = ua.AttributeIds.Value
                parameters.NodesToRead = [requested]
                value = (await client.uaclient.read(parameters))[0]
                print(json.dumps({
                    "sourceTimestamp": value.SourceTimestamp.isoformat() if value.SourceTimestamp else None,
                    "serverTimestamp": value.ServerTimestamp.isoformat() if value.ServerTimestamp else None,
                    "status": value.StatusCode.value,
                    "metadata": facts,
                }))
                return
        except (OSError, asyncio.TimeoutError, ValueError, ua.UaError) as error:
            last_error = error
            await asyncio.sleep(0.2)
    raise RuntimeError("Independent OPC UA time probe did not obtain a coherent sample") from last_error


asyncio.run(probe())
