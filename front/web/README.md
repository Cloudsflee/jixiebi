# Web 控制面板 (front/web)

这是当前阶段的最小联调页面：

- 连接 `front/gateway` �?WebSocket�?- 控制 4 个关节（默认主动控制为 J1/J2/J3/J5（J4 为派生，J6/J7 跟随 J5））�?- 查询位置、电压和温度�?- 显示网关/MCU 回包日志�?- 3D 场景加载 `front/models/raw` 下的 STL，并按关节分组显示�?- Three.js 依赖已本地化�?`front/web/vendor/three`，不依赖外网 CDN�?
## 联动机制（已启用�?
- 拖动滑块：模型即时旋转，并在短延时后自动下发 `move` 指令给舵机�?- 连接网关后：页面会周期性查询舵机位置（`query`），回读位置会反写到模型�?  - 轮询默认�?J1 当前 ID 开始；只有成功回读过的位置 ID 才会持续轮询，减�?`ERR,NO_POS` 噪声�?- 点击“发送”后：会在动作时间后自动补一次位置查询，减少模型与实机偏差�?
## 舵机 ID 调整

- 页面每一行的第二个输入框就是舵机 ID，可临时修改后直接发送�?- 若要永久修改默认值，请编�?[`joints.json`](/D:/04_projects/国创-数字孪生机械�?STM32/front/web/joints.json) 中的 `servoId`�?
## 启动方式

请用静态服务器启动，且**根目录建议是 `front/`**（否则网页可能找不到 `../models/raw`）�?
推荐命令�?
```bash
cd front
python -m http.server 8090
```

然后浏览器访问：`http://127.0.0.1:8090/web/`

## 结构映射配置

- 模型分组与关节参数在 [`joints.json`](/D:/04_projects/国创-数字孪生机械�?STM32/front/web/joints.json)�?- 可调整：
  - `parts[].target/files`：结构件属于哪个关节组�?  - `joints[].servoId`：关节对应舵�?ID�?  - `joints[].axis/minDeg/maxDeg/invert`：关节旋转方向与范围�?  - `joints[].servoMapPoints`：理论角�?>PWM/位置映射表（分段线性）�?  - `joints[].backlash`：回差补偿参数（forward/reverse/switch）�?  - `physicalKinematics`：闭链机构图纸参数（推荐 `space=robot_local`）�?
## 真实虚实结合参数（关键）

- 不再依赖网格自动猜测孔位�?- 请直接从 CAD 图纸录入 `physicalKinematics`�?  - `joints.j2/j3.pivot`：驱动轴中心（CAD 坐标）�?  - `joints.j2/j3.activeLinkLength`：连杆有效长度�?  - `endEffector.yellowHoleLocal/greenHoleLocal`：末端件两个孔在末端局部坐标中的位置�?- 填完后将 `physicalKinematics.enabled` 设为 `true`，前端会启用闭链数学求解�?
## STL 路径说明

- 页面优先尝试�?`../models/raw` 读取 STL�?- 为兼容“直接在 `front/web` 起服务”的场景，已支持并可读取 `front/web/raw`�?- 如果你更新了 `front/models/raw`，可同步一份到 `front/web/raw`�?
```bash
copy front\models\raw\*.STL front\web\raw\
```

## Demo IK + Pseudo FEA (Fast visual mode)

This mode is for fast demos when you only need visually consistent motion and stress feedback.

- UI entry: `Joint Runtime Panel` -> `Demo IK+FEA` block.
- Core modules (decoupled):
  - `front/web/modules/demo_kinematics.js`
  - `front/web/modules/demo_fea.js`
- Config sections in `joints.json`:
  - `demoKinematics`
  - `demoFea`
  - `demoRuntime`

Notes:
- `Solve IK` drives J1~J4 using the demo IK model (independent from physical closed-chain solver).
- `Run FEA` applies pseudo stress coloring and small visual deformation to mesh groups.
- This is intentionally non-physical and intended for rapid virtual presentation.

## Path Override (2026-05-15)

- `front/web` now loads STL from `./raw/` only.
- This avoids accidentally reading legacy files from `front/models/raw` and causing missing or misaligned parts.
- Rebuild command: `node front/web/tools/rebuild_model_from_suarmt.js`.

