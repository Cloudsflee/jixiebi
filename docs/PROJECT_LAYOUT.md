# 机械臂项目主目录与复现边界

`github/jixiebi` 是本轮作品集使用的 canonical 快照。代码链路按下面四层理解：

| 层 | 目录 | 责任 |
|---|---|---|
| 控制器 | `USER/` + `CORE/` | STM32F103、总线舵机协议、蓝牙和动作调度 |
| 构建 | `gcc/` | GCC + Makefile、linker 与 startup |
| 网关 | `front/gateway/` | 浏览器控制页和串口/网关适配 |
| 数字孪生 | `front/web/`、`SuArmT/` | Three.js、URDF、STL 模型和教学页面 |

`装配体.STEP` 是可选 CAD 源文件；压缩包、Node 缓存、编译输出和视频帧属于发布前
归档候选，不参与 GCC 或网页构建。硬件链路图见 `docs/hardware-chain.svg`。

## 复现命令

```powershell
make -f gcc/Makefile all
make -f gcc/Makefile clean
cd front/gateway
npm ci
npm test --if-present
```

烧录需要现场的 CH340 串口和 `FLASH_PORT`，不会在 CI 中自动执行：
`make -f gcc/Makefile flash FLASH_PORT=COM5 FLASH_BAUD=115200`。
