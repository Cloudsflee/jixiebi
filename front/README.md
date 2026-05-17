# Front 目录说明

本目录用于存放本项目所有前端相关代码与资源，包括但不限于：

- Web 数字孪生页面
- 3D 模型与可视化资源
- 前端构建与运行脚本
- 前端文档

后续前端开发统一放在 `front/` 下进行。

当前已落地的子目录：

- `front/gateway`：Node.js 串口网关（WebSocket <-> CH340 串口）
- `front/web`：最小联调页面（4 轴滑杆、位置/电压查询、日志）
- `front/models`：STEP 拆解辅助与模型配置模板

## SuArmT 同步重构（结构优先）

当前 `front` 与 `teach_front` 已统一基于 `SuArmT` 进行结构同步，且不破坏两端主动交互能力。

- 结构快照目录：
  - `front/web/suarmt`
  - `teach_front/web/suarmt`
- 运行模型资源：
  - `front/web/raw/suarmt_global_*.STL`
  - `teach_front/web/models/raw/suarmt_global_*.STL`
- 一键同步命令（工作区根目录执行）：
  - `node front/web/tools/sync_suarmt_structure.js`
  - `node front/web/tools/rebuild_model_from_suarmt.js`
