# jixiebi｜从固件到数字孪生的机械臂控制链路

这是一个面向自制机械臂的软硬件一体化工程：底层以 STM32F103 驱动总线舵机，上层以
Node.js 网关承接浏览器控制，`front/web` 与 `SuArmT` 提供 3D 数字孪生和结构校验。
它把控制器、通信协议、执行器、网页工具和构建链路放在同一条可复现路径中，适合作为
具身智能与嵌入式系统工程能力的完整证据。

## 项目亮点

- **纵向打通软硬件链路**：从 `USER/` 固件、串口文本协议到 WebSocket 控制页，覆盖
  指令生成、传输、执行和状态回传。
- **协议边界可替换**：网关将浏览器 JSON 映射为 MCU 文本命令，网页、网关和固件可
  分层回环验证，减少硬件未接入时的排障成本。
- **真实硬件约束优先**：以总线舵机的协议、电气和供电前提为设计基线，避免把原配
  PWM 舵机假设混入最终控制链路。
- **工程数据与模型一致性**：URDF、STL、关节配置和 Three.js 场景通过结构同步工具
  对齐，数字孪生用于联调和回归，而不是独立的展示页面。
- **可复现构建与归档边界**：GCC + Makefile 是唯一默认固件流程，构建产物、缓存和
  压缩包与源代码分离，便于复核和发布。

## 工程目标

- 驱动自制 3D 打印机械臂的动力执行部分。
- 使用总线舵机协议完成位置、时间、电压和状态交互。
- 通过蓝牙或 CH340 串口连接控制器与上位机。
- 用网页控制和 URDF/Three.js 数字孪生降低硬件联调成本。

## 系统架构

```text
Three.js / teaching page
          │ WebSocket JSON
          ▼
front/gateway (Node.js)
          │ serial text protocol
          ▼
STM32F103 firmware (USER + CORE)
          │ Bluetooth / UART
          ▼
bus servos → mechanical arm
```

硬件链路图见 [`docs/hardware-chain.svg`](docs/hardware-chain.svg)。网页端和固件端通过
清晰的协议边界联调，任何一层都可以用 Mock/回环数据单独排查。

## 硬件约束

1. 控制器：开源 6 路舵机控制器，资料位于 `doc/`。
2. 主控：STM32F103，固件入口在 `USER/main.c`，启动文件和链接脚本在 `gcc/`。
3. 执行器：使用教程中描述的总线舵机，不沿用控制器原配 PWM 舵机假设。
4. 上位机：蓝牙模块或 CH340 串口；串口参数由现场硬件决定。

总线舵机方案是当前实现边界。更换舵机类型时，需要同时重新核对电气连接、协议帧、
供电、电压读取和动作时间参数。

## 目录导航

| 路径 | 作用 |
|---|---|
| `USER/` | 应用调度、蓝牙、串口消息、总线舵机和动作控制 |
| `CORE/` | Cortex-M3 启动与核心支持代码 |
| `STM32F10x_FWLib/` | STM32 外设库 |
| `gcc/` | GCC Makefile、linker、startup 和构建输出目录 |
| `front/gateway/` | WebSocket ↔ 串口 Node.js 网关 |
| `front/web/` | Three.js 数字孪生、滑杆控制、日志与配置页面 |
| `teach_front/` | 教学/演示页面与动作引导 |
| `SuArmT/` | URDF、STL 网格和 ROS 结构文件 |
| `doc/` | 控制器说明、开发教程、硬件键位和实验资料 |
| `energy/` | 能耗分析脚本、CSV 汇总和报告材料 |

更详细的 canonical 目录、归档边界和复现命令见
[`docs/PROJECT_LAYOUT.md`](docs/PROJECT_LAYOUT.md)。

## 固件构建

项目统一使用 GCC + Makefile，不维护 Keil/MDK 作为默认构建路径：

```powershell
make -f gcc/Makefile all
make -f gcc/Makefile clean
```

成功构建会生成 `gcc/build/OpenArmSTM32_gcc.elf/.hex/.bin`；这些文件属于本地构建产物，
已被 `.gitignore` 排除。烧录需要连接真实 CH340 设备，并显式指定端口：

```powershell
make -f gcc/Makefile flash FLASH_PORT=COM5 FLASH_BAUD=115200
```

## 网关与网页联调

安装并启动串口网关：

```powershell
cd front/gateway
npm ci
npm start
```

默认使用 `COM5 @ 9600`，WebSocket 端口为 `8787`，可通过环境变量覆盖：

```powershell
$env:SERIAL_PORT = 'COM5'
$env:SERIAL_BAUD = '9600'
$env:WS_PORT = '8787'
npm start
```

网页到网关的消息示例：

```json
{"type":"move","id":1,"pos":500,"time":300}
{"type":"query","id":1}
{"type":"vin","id":1}
{"type":"ping"}
```

网关向 STM32 转换为 `M,<id>,<pos>,<time_ms>`、`Q,<id>`、`V,<id>` 和 `PING`；回包
包括 `OK`、`ERR,<code>`、`P,<id>,<pos>` 和 `V,<id>,<mv>`。完整字段见
[`front/gateway/README.md`](front/gateway/README.md)。

## 数字孪生与结构同步

`front/web` 使用 Three.js 加载 STL/URDF 资源，支持关节滑杆、位置/电压查询、日志和
动作配置。`front` 与 `teach_front` 的 SuArmT 结构快照可用以下命令同步或重建：

```powershell
node front/web/tools/sync_suarmt_structure.js
node front/web/tools/rebuild_model_from_suarmt.js
```

结构同步优先保证关节名称、网格文件和 URDF 拓扑一致，再进行页面交互调整。

## 验证与清理

```powershell
python tools/check_clean_tree.py
make -f gcc/Makefile all
make -f gcc/Makefile clean
```

`check_clean_tree.py` 会报告临时 Node 缓存、Python 字节码和编译输出。CAD 源文件、视频
帧和压缩包属于资料归档候选，不参与固件或网页构建；发布快照只保留可复现源文件和说明。

## 已知边界

- 没有接入真实控制器时，网页验证消息格式和本地渲染；真实舵机动作需要接入控制器实测。
- 供电、电平、串口号和舵机 ID 依赖现场硬件，烧录命令不会在 CI 中自动执行。
- 总线舵机与原配 PWM 舵机的协议和电气假设不同，改硬件时必须重新验证整条链路。

## 作品集证据

- 硬件链路图：[`docs/hardware-chain.svg`](docs/hardware-chain.svg)
- 架构与复现边界：[`docs/PROJECT_LAYOUT.md`](docs/PROJECT_LAYOUT.md)
- 工程化审查：[`ENGINEERING_REVIEW.md`](ENGINEERING_REVIEW.md)
