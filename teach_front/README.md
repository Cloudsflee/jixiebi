# teach_front（教学展示前端）

`teach_front` 保留原有教学演示能力（关节示教、IK、伪 FEA），并已完成与 `SuArmT` 的结构同步。

## 当前结构重点

- `teach_front/web/suarmt/`
  - 与 `SuArmT/` 同步的原始结构快照（`config/launch/meshes/urdf`）
- `teach_front/web/models/raw/`
  - 前端运行时实际加载的 STL（已更新为 `suarmt_global_*.STL`）
- `teach_front/web/joints.json`
  - 已按 `SuArmT.urdf` 重建层级与轴系（保持 4 关节教学交互）

## 与 front 的同步策略

统一使用 `front/web/tools` 下脚本进行模型同步：

```bash
node front/web/tools/sync_suarmt_structure.js
node front/web/tools/rebuild_model_from_suarmt.js
```

上面命令会同时更新 `front` 和 `teach_front`，避免两套前端结构漂移。

## 启动方式

```bash
python -m http.server 8091 --bind 0.0.0.0 --directory "d:\04_projects\国创-数字孪生机械臂\STM32\teach_front"
```

访问：

```text
http://127.0.0.1:8091/web/index.html
```

