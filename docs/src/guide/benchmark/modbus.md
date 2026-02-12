# Modbus 性能基准测试

本页面提供了 Modbus 协议在 `ng-gateway` 上的性能基准测试结果。测试旨在评估网关在不同负载下的吞吐量、延迟和资源消耗。

## 测试环境

<!-- TODO: 补充测试环境详情 -->
- **硬件**: (例如: Apple M1 Pro, 32GB RAM)
- **操作系统**: (例如: macOS 14.2)
- **Rust 版本**: (例如: 1.75.0)
- **Modbus 模拟器**: (例如: Modbus Slave / Diagslave)

## 测试工具

测试使用 `ng-gateway-bench` 工具进行，该工具内置了多种测试场景，能够模拟不同的设备和点位负载。

### 运行命令

```bash
# 确保 Modbus 模拟器已启动
# 替换 <YOUR_MODBUS_HOST> 为实际地址
# 建议每个场景运行至少 60 秒以获取稳定的 Grafana 截图
cargo run --release --bin ng-gateway-bench -- --protocol modbus --modbus-host 127.0.0.1 --duration-secs 60 --scenario <SCENARIO_ID>
```

## 测试场景与结果详情

### 场景 1: 基础采集
*   **配置**: 1 通道, 10 设备, 1000 点位/设备, 1000ms 周期 (总计 10k 点)
*   **命令**: `cargo run --release --bin ng-gateway-bench -- --protocol modbus --scenario 1 --duration-secs 60`

#### 性能指标
| 内存使用(peak RSS) | CPU 使用(avg) | 网络带宽消耗 |
|---|---|---|
| (待补充) | (待补充) | (待补充) |

#### 资源监控截图
<!-- TODO: 插入 Scenario 1 运行期间的 Grafana (CPU/Memory/Network) 截图 -->
<!-- ![Scenario 1 Resource Usage](/images/benchmark/modbus/scenario-1.png) -->

---

### 场景 2: 中等规模采集
*   **配置**: 5 通道, 10 设备, 1000 点位/设备, 1000ms 周期 (总计 50k 点)
*   **命令**: `cargo run --release --bin ng-gateway-bench -- --protocol modbus --scenario 2 --duration-secs 60`

#### 性能指标
| 内存使用(peak RSS) | CPU 使用(avg) | 网络带宽消耗 |
|---|---|---|
| (待补充) | (待补充) | (待补充) |

#### 资源监控截图
<!-- TODO: 插入 Scenario 2 运行期间的 Grafana (CPU/Memory/Network) 截图 -->
<!-- ![Scenario 2 Resource Usage](/images/benchmark/modbus/scenario-2.png) -->

---

### 场景 3: 大规模采集
*   **配置**: 10 通道, 10 设备, 1000 点位/设备, 1000ms 周期 (总计 100k 点)
*   **命令**: `cargo run --release --bin ng-gateway-bench -- --protocol modbus --scenario 3 --duration-secs 120`
*   **注意**: 此场景负载较高，建议运行时间稍长(120s)以观察稳定性。

#### 性能指标
| 内存使用(peak RSS) | CPU 使用(avg) | 网络带宽消耗 |
|---|---|---|
| (待补充) | (待补充) | (待补充) |

#### 资源监控截图
<!-- TODO: 插入 Scenario 3 运行期间的 Grafana (CPU/Memory/Network) 截图 -->
<!-- ![Scenario 3 Resource Usage](/images/benchmark/modbus/scenario-3.png) -->

---

### 场景 4: 高频采集 (单通道)
*   **配置**: 1 通道, 1 设备, 1000 点位/设备, **100ms** 周期 (总计 1k 点)
*   **命令**: `cargo run --release --bin ng-gateway-bench -- --protocol modbus --scenario 4 --duration-secs 60`

#### 性能指标
| 内存使用(peak RSS) | CPU 使用(avg) | 网络带宽消耗 |
|---|---|---|
| (待补充) | (待补充) | (待补充) |

#### 资源监控截图
<!-- TODO: 插入 Scenario 4 运行期间的 Grafana (CPU/Memory/Network) 截图 -->
<!-- ![Scenario 4 Resource Usage](/images/benchmark/modbus/scenario-4.png) -->

---

### 场景 5: 高频采集 (多通道)
*   **配置**: 5 通道, 1 设备, 1000 点位/设备, **100ms** 周期 (总计 5k 点)
*   **命令**: `cargo run --release --bin ng-gateway-bench -- --protocol modbus --scenario 5 --duration-secs 60`

#### 性能指标
| 内存使用(peak RSS) | CPU 使用(avg) | 网络带宽消耗 |
|---|---|---|
| (待补充) | (待补充) | (待补充) |

#### 资源监控截图
<!-- TODO: 插入 Scenario 5 运行期间的 Grafana (CPU/Memory/Network) 截图 -->
<!-- ![Scenario 5 Resource Usage](/images/benchmark/modbus/scenario-5.png) -->

---

### 场景 6: 高频采集 (大规模)
*   **配置**: 10 通道, 1 设备, 1000 点位/设备, **100ms** 周期 (总计 10k 点)
*   **命令**: `cargo run --release --bin ng-gateway-bench -- --protocol modbus --scenario 6 --duration-secs 60`

#### 性能指标
| 内存使用(peak RSS) | CPU 使用(avg) | 网络带宽消耗 |
|---|---|---|
| (待补充) | (待补充) | (待补充) |

#### 资源监控截图
<!-- TODO: 插入 Scenario 6 运行期间的 Grafana (CPU/Memory/Network) 截图 -->
<!-- ![Scenario 6 Resource Usage](/images/benchmark/modbus/scenario-6.png) -->

---

### 场景 7: 混合负载 (采集+下发)
*   **配置**: 10 通道, 10 设备, 1000 点位/设备, 1000ms 周期 (总计 100k 点) + 随机下发
*   **命令**: `cargo run --release --bin ng-gateway-bench -- --protocol modbus --scenario 7 --duration-secs 60`

#### 性能指标 (采集)
| 内存使用(peak RSS) | CPU 使用(avg) | 网络带宽消耗 |
|---|---|---|
| (待补充) | (待补充) | (待补充) |

#### 性能指标 (下发)
| 成功/失败 | 最小延迟 | 最大延迟 | 平均延迟 |
|---|---|---|---|
| (待补充) | (待补充) ms | (待补充) ms | (待补充) ms |

#### 资源监控截图
<!-- TODO: 插入 Scenario 7 运行期间的 Grafana (CPU/Memory/Network) 截图 -->
<!-- ![Scenario 7 Resource Usage](/images/benchmark/modbus/scenario-7.png) -->

## 结果汇总

| 场景 | 协议 | Channel数量 | 每个Channel设备数 | 每个设备点位数 | 采集频率 | 总计点位 | 点位类型 | 内存使用(peak RSS) | CPU 使用(avg) | 网络带宽消耗 |
|---:|---|---:|---:|---:|---|---:|---|---|---|---|
| 1 | modbus | 1 | 10 | 1000 | 1000 ms | 10000 | Float32 | (待补充) | (待补充) | (待补充) |
| 2 | modbus | 5 | 10 | 1000 | 1000 ms | 50000 | Float32 | (待补充) | (待补充) | (待补充) |
| 3 | modbus | 10 | 10 | 1000 | 1000 ms | 100000 | Float32 | (待补充) | (待补充) | (待补充) |
| 4 | modbus | 1 | 1 | 1000 | 100 ms | 1000 | Float32 | (待补充) | (待补充) | (待补充) |
| 5 | modbus | 5 | 1 | 1000 | 100 ms | 5000 | Float32 | (待补充) | (待补充) | (待补充) |
| 6 | modbus | 10 | 1 | 1000 | 100 ms | 10000 | Float32 | (待补充) | (待补充) | (待补充) |
| 7 | modbus | 10 | 10 | 1000 | 1000 ms | 100000 | Float32 | (待补充) | (待补充) | (待补充) |
