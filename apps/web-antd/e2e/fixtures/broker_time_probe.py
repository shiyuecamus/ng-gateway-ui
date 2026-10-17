"""Read real broker records with independently implemented, pinned clients."""

import argparse
import importlib.metadata
import json
import logging
import sys
import time
import uuid


def samples(value):
    """Locate canonical samples without depending on a particular output framing."""
    if isinstance(value, dict):
        if "pointId" in value and "sourceTimeStatus" in value:
            yield value
        else:
            for child in value.values():
                yield from samples(child)
    elif isinstance(value, list):
        for child in value:
            yield from samples(child)


def main():
    """Bound the consumer lifetime, record count, bytes and transport buffers."""
    parser = argparse.ArgumentParser()
    parser.add_argument("broker", choices=("kafka", "pulsar"))
    parser.add_argument("url")
    parser.add_argument("freshness", choices=("current", "stale"))
    parser.add_argument("topics", nargs="+")
    args = parser.parse_args()
    deadline = time.monotonic() + 45
    records = []
    matched = set()
    byte_count = 0

    def record(topic, payload, properties, key, timestamp, **extra):
        nonlocal byte_count
        byte_count += len(payload)
        if len(records) >= 512 or byte_count > 2 * 1024 * 1024:
            raise RuntimeError("Independent consumer exceeded its evidence budget")
        body = json.loads(payload)
        records.append(dict(topic=topic, body=body, properties=properties,
                            key=key, brokerTimeMs=timestamp,
                            observedAtMs=time.time_ns() // 1_000_000, **extra))
        if any(sample.get("freshness") == args.freshness
               and sample.get("pointKey") == "steady-value"
               for sample in samples(body)):
            matched.add(topic)

    if args.broker == "kafka":
        from kafka import KafkaConsumer, TopicPartition

        consumer = KafkaConsumer(
            bootstrap_servers=args.url, group_id=None, enable_auto_commit=False,
            auto_offset_reset="earliest", api_version_auto_timeout_ms=10_000,
            request_timeout_ms=15_000, fetch_max_bytes=1024 * 1024,
            max_partition_fetch_bytes=256 * 1024, max_poll_records=64,
            client_id="ng-independent-time-probe",
        )
        try:
            partitions = []
            for topic in args.topics:
                ids = consumer.partitions_for_topic(topic)
                while not ids and time.monotonic() < deadline:
                    time.sleep(0.2)
                    ids = consumer.partitions_for_topic(topic)
                if not ids:
                    raise RuntimeError("Missing native producer topic: " + topic)
                partitions.extend(TopicPartition(topic, number) for number in ids)
            consumer.assign(partitions)
            consumer.seek_to_beginning(*partitions)
            while len(matched) != len(args.topics) and time.monotonic() < deadline:
                for batch in consumer.poll(timeout_ms=500).values():
                    for message in batch:
                        record(message.topic, message.value,
                               {key: value.decode("utf-8") for key, value in message.headers},
                               message.key.decode("utf-8"), message.timestamp,
                               timestampType=message.timestamp_type,
                               partition=message.partition, offset=message.offset)
        finally:
            consumer.close(timeout_ms=5000)
        version = importlib.metadata.version("kafka-python")
    else:
        import pulsar

        logging.basicConfig(stream=sys.stderr, level=logging.WARNING)
        client = pulsar.Client(args.url, operation_timeout_seconds=10,
                               connection_timeout_ms=5000, io_threads=1,
                               logger=logging.getLogger("ng.time.pulsar"))
        try:
            consumer = client.subscribe(
                args.topics, subscription_name="ng-time-" + uuid.uuid4().hex,
                initial_position=pulsar.InitialPosition.Earliest,
                receiver_queue_size=64,
            )
            while len(matched) != len(args.topics) and time.monotonic() < deadline:
                try:
                    message = consumer.receive(timeout_millis=500)
                except pulsar.Timeout:
                    continue
                record(message.topic_name(), message.data(), message.properties(),
                       message.partition_key(), message.event_timestamp(),
                       publishTimeMs=message.publish_timestamp(),
                       messageId=str(message.message_id()))
                consumer.acknowledge(message)
            consumer.close()
        finally:
            client.close()
        version = importlib.metadata.version("pulsar-client")

    result = dict(broker=args.broker, clientVersion=version, records=records,
                  matchedTopics=sorted(matched), expectedTopics=sorted(args.topics))
    json.dump(result, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")
    if matched != set(args.topics):
        raise RuntimeError("Not every topic delivered " + args.freshness)


if __name__ == "__main__":
    main()
