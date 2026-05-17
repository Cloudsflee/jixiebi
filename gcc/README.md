# GCC + Makefile 构建说明（STM32F103）

本目录提供 `OpenArmSTM32` 的 GCC 构建与串口烧录流程，适配当前项目的 CH340 + 串口 Bootloader 开发方式。

## 1. 环境要求

1. 已安装 `arm-none-eabi-gcc` 工具链，并且 `make` 可用。
2. 已安装 STM32 下载工具：
   - `D:/01_env/STM32_prom/bin/STM32_Programmer_CLI.exe`
3. 开发板可通过 CH340 识别为串口（例如 `COM5`）。
4. 板子进入系统 Bootloader 下载模式（BOOT 配置正确后复位）。

## 2. 常用命令

在项目根目录执行：

```bash
make -f gcc/Makefile all
```

生成文件位于 `gcc/build/`：
- `OpenArmSTM32_gcc.elf`
- `OpenArmSTM32_gcc.hex`
- `OpenArmSTM32_gcc.bin`

清理构建产物：

```bash
make -f gcc/Makefile clean
```

通过串口烧录（默认 `COM5`、`115200`）：

```bash
make -f gcc/Makefile flash
```

指定端口和波特率：

```bash
make -f gcc/Makefile flash FLASH_PORT=COM5 FLASH_BAUD=115200
```

## 3. 常见问题

1. 提示串口打不开
   - 确认串口号是否正确（设备管理器查看）。
   - 关闭可能占用串口的软件（串口助手、上位机等）。

2. 连接到设备失败
   - 检查板子是否进入 Bootloader 模式（BOOT 引脚配置 + 复位）。
   - 再次执行烧录命令。

3. `arm-none-eabi-gcc` 或 `make` 找不到
   - 检查工具链安装与 PATH。
   - 可在终端用 `arm-none-eabi-gcc --version`、`make --version` 先验证。

4. 构建有 `_write/_read` 相关 warning
   - 这是 `nosys` 场景下常见告警，通常不影响当前固件功能。

