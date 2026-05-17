# URDF Pipeline (SuArmT Only)

本目录仅保留 `SuArmT` 作为模型源。

## 关键产物

- `SuArmT.urdf` / `SuArmT.csv`
  - 来自 `SuArmT/urdf/` 的同步副本
- `suarmt_model.json`
  - 解析后的关节/连杆世界坐标信息
- `arm_from_joints.urdf`
  - 基于当前 `front/web/joints.json` 生成的运行态 URDF

## 重建命令（工作区根目录）

```bash
node front/web/tools/sync_suarmt_structure.js
node front/web/tools/rebuild_model_from_suarmt.js
node front/web/tools/generate_urdf_from_joints.js
```

## 脚本职责

1. `sync_suarmt_structure.js`
   - 同步 `SuArmT` 原始结构到：
     - `front/web/suarmt/`
     - `teach_front/web/suarmt/`
2. `rebuild_model_from_suarmt.js`
   - 解析 `SuArmT.urdf`
   - 生成运行 STL：
     - `front/web/raw/suarmt_global_*.STL`
     - `teach_front/web/models/raw/suarmt_global_*.STL`
   - 同步重写：
     - `front/web/joints.json`
     - `teach_front/web/joints.json`
3. `generate_urdf_from_joints.js`
   - 导出当前运行参数为 `arm_from_joints.urdf`

## 说明

- `front` 运行路径保持：`front/web/raw/`
- `teach_front` 运行路径保持：`teach_front/web/models/raw/`
- `suarmt/` 目录作为前端侧模型结构快照，便于追溯与对比。
