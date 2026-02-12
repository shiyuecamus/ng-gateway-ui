# Modbus Benchmark

This page provides benchmark results for the Modbus protocol on `ng-gateway`. The tests aim to evaluate the gateway's throughput, latency, and resource consumption under various workloads.

## Test Environment

<!-- TODO: Supplement with test environment details -->
- **Hardware**: (e.g., Apple M1 Pro, 32GB RAM)
- **OS**: (e.g., macOS 14.2)
- **Rust Version**: (e.g., 1.75.0)
- **Modbus Simulator**: (e.g., Modbus Slave / Diagslave)

## Test Tool

The tests are performed using the `ng-gateway-bench` tool, which includes multiple built-in test scenarios to simulate different device and data point loads.

### Run Command

```bash
# Ensure Modbus simulator is running
# Replace <YOUR_MODBUS_HOST> with actual address
# Recommended to run each scenario for at least 60 seconds to get stable Grafana screenshots
cargo run --release --bin ng-gateway-bench -- --protocol modbus --modbus-host 127.0.0.1 --duration-secs 60 --scenario <SCENARIO_ID>
```

## Test Scenarios & Results

### Scenario 1: Basic Collection
*   **Config**: 1 Channel, 10 Devices, 1000 Points/Device, 1000ms Period (Total 10k pts)
*   **Command**: `cargo run --release --bin ng-gateway-bench -- --protocol modbus --scenario 1 --duration-secs 60`

#### Metrics
| Memory (Peak RSS) | CPU (Avg) | Network Bandwidth |
|---|---|---|
| (TBD) | (TBD) | (TBD) |

#### Resource Monitor Screenshot
<!-- TODO: Insert Grafana (CPU/Memory/Network) screenshot for Scenario 1 -->
<!-- ![Scenario 1 Resource Usage](/images/benchmark/modbus/scenario-1.png) -->

---

### Scenario 2: Medium Scale Collection
*   **Config**: 5 Channels, 10 Devices, 1000 Points/Device, 1000ms Period (Total 50k pts)
*   **Command**: `cargo run --release --bin ng-gateway-bench -- --protocol modbus --scenario 2 --duration-secs 60`

#### Metrics
| Memory (Peak RSS) | CPU (Avg) | Network Bandwidth |
|---|---|---|
| (TBD) | (TBD) | (TBD) |

#### Resource Monitor Screenshot
<!-- TODO: Insert Grafana (CPU/Memory/Network) screenshot for Scenario 2 -->
<!-- ![Scenario 2 Resource Usage](/images/benchmark/modbus/scenario-2.png) -->

---

### Scenario 3: Large Scale Collection
*   **Config**: 10 Channels, 10 Devices, 1000 Points/Device, 1000ms Period (Total 100k pts)
*   **Command**: `cargo run --release --bin ng-gateway-bench -- --protocol modbus --scenario 3 --duration-secs 120`
*   **Note**: This is a high load scenario, recommended to run longer (120s) to observe stability.

#### Metrics
| Memory (Peak RSS) | CPU (Avg) | Network Bandwidth |
|---|---|---|
| (TBD) | (TBD) | (TBD) |

#### Resource Monitor Screenshot
<!-- TODO: Insert Grafana (CPU/Memory/Network) screenshot for Scenario 3 -->
<!-- ![Scenario 3 Resource Usage](/images/benchmark/modbus/scenario-3.png) -->

---

### Scenario 4: High Frequency (Single Channel)
*   **Config**: 1 Channel, 1 Device, 1000 Points/Device, **100ms** Period (Total 1k pts)
*   **Command**: `cargo run --release --bin ng-gateway-bench -- --protocol modbus --scenario 4 --duration-secs 60`

#### Metrics
| Memory (Peak RSS) | CPU (Avg) | Network Bandwidth |
|---|---|---|
| (TBD) | (TBD) | (TBD) |

#### Resource Monitor Screenshot
<!-- TODO: Insert Grafana (CPU/Memory/Network) screenshot for Scenario 4 -->
<!-- ![Scenario 4 Resource Usage](/images/benchmark/modbus/scenario-4.png) -->

---

### Scenario 5: High Frequency (Multi Channel)
*   **Config**: 5 Channels, 1 Device, 1000 Points/Device, **100ms** Period (Total 5k pts)
*   **Command**: `cargo run --release --bin ng-gateway-bench -- --protocol modbus --scenario 5 --duration-secs 60`

#### Metrics
| Memory (Peak RSS) | CPU (Avg) | Network Bandwidth |
|---|---|---|
| (TBD) | (TBD) | (TBD) |

#### Resource Monitor Screenshot
<!-- TODO: Insert Grafana (CPU/Memory/Network) screenshot for Scenario 5 -->
<!-- ![Scenario 5 Resource Usage](/images/benchmark/modbus/scenario-5.png) -->

---

### Scenario 6: High Frequency (Large Scale)
*   **Config**: 10 Channels, 1 Device, 1000 Points/Device, **100ms** Period (Total 10k pts)
*   **Command**: `cargo run --release --bin ng-gateway-bench -- --protocol modbus --scenario 6 --duration-secs 60`

#### Metrics
| Memory (Peak RSS) | CPU (Avg) | Network Bandwidth |
|---|---|---|
| (TBD) | (TBD) | (TBD) |

#### Resource Monitor Screenshot
<!-- TODO: Insert Grafana (CPU/Memory/Network) screenshot for Scenario 6 -->
<!-- ![Scenario 6 Resource Usage](/images/benchmark/modbus/scenario-6.png) -->

---

### Scenario 7: Mixed Workload (Collection + Downlink)
*   **Config**: 10 Channels, 10 Devices, 1000 Points/Device, 1000ms Period (Total 100k pts) + Random Downlink
*   **Command**: `cargo run --release --bin ng-gateway-bench -- --protocol modbus --scenario 7 --duration-secs 60`

#### Metrics (Collection)
| Memory (Peak RSS) | CPU (Avg) | Network Bandwidth |
|---|---|---|
| (TBD) | (TBD) | (TBD) |

#### Metrics (Downlink)
| Success/Fail | Min Latency | Max Latency | Avg Latency |
|---|---|---|---|
| (TBD) | (TBD) ms | (TBD) ms | (TBD) ms |

#### Resource Monitor Screenshot
<!-- TODO: Insert Grafana (CPU/Memory/Network) screenshot for Scenario 7 -->
<!-- ![Scenario 7 Resource Usage](/images/benchmark/modbus/scenario-7.png) -->

## Summary

| Scenario | Protocol | Channels | Devices/Channel | Points/Device | Frequency | Total Points | Type | Memory (Peak RSS) | CPU (Avg) | Bandwidth |
|---:|---|---:|---:|---:|---|---:|---|---|---|---|
| 1 | modbus | 1 | 10 | 1000 | 1000 ms | 10000 | Float32 | (TBD) | (TBD) | (TBD) |
| 2 | modbus | 5 | 10 | 1000 | 1000 ms | 50000 | Float32 | (TBD) | (TBD) | (TBD) |
| 3 | modbus | 10 | 10 | 1000 | 1000 ms | 100000 | Float32 | (TBD) | (TBD) | (TBD) |
| 4 | modbus | 1 | 1 | 1000 | 100 ms | 1000 | Float32 | (TBD) | (TBD) | (TBD) |
| 5 | modbus | 5 | 1 | 1000 | 100 ms | 5000 | Float32 | (TBD) | (TBD) | (TBD) |
| 6 | modbus | 10 | 1 | 1000 | 100 ms | 10000 | Float32 | (TBD) | (TBD) | (TBD) |
| 7 | modbus | 10 | 10 | 1000 | 1000 ms | 100000 | Float32 | (TBD) | (TBD) | (TBD) |
