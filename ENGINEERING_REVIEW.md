# 机械臂与总线舵机工程 · Engineering Review

本文件用于项目作品集与维护交接，记录当前工程证据和低风险优化边界。它不替代项目 README，也不虚构未完成的指标。

## 已确认的工程证据

STM32、总线舵机、GCC/Make、网页控制、联调资料。

## 本轮优化方向

确定 canonical 目录；清理 zip/temp；补 front/gateway 架构和复现构建。

## 验证入口

```text
python tools/check_clean_tree.py
make -f gcc/Makefile all
```

canonical 目录、构建边界和硬件链路见 `docs/PROJECT_LAYOUT.md` 与
`docs/hardware-chain.svg`。压缩包与临时目录在发布前归档，不参与 GCC/网页构建。

## 作品集写法

- 先写个人贡献和可复现入口，再写技术栈。
- 私有仓库补充脱敏截图或架构图；Fork 仓库标明个人贡献边界。
- 不把 fixture、构建产物或上游代码当作独立项目。
