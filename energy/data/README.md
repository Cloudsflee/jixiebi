# data 目录说明

本目录保存节能减排图表所依赖的数据表（CSV，UTF-8 BOM）。  
核心原则：

- 数据为**仿真生成**，用于比赛展示与方案论证。
- 口径统一：`1 Hz` 采样，支持多轮任务统计。
- 对象统一：`本机-优化前`、`本机-优化后`、`同类机械臂A`、`同类机械臂B`。

---

## 1. 文件总览

### `time_series.csv`

- 粒度：秒级时序（每行 = 某对象在某次任务某一秒的状态）。
- 作用：用于绘制时序图、分布图、阶段图、关节贡献图的基础数据。

### `run_kpis.csv`

- 粒度：任务轮次级（每行 = 某对象在某一次 run 的汇总指标）。
- 作用：用于分析重复任务下稳定性和统计离散性。

### `summary_kpis.csv`

- 粒度：对象级（每行 = 某对象跨多轮 run 的均值结果）。
- 作用：用于最终结论（节能率、降碳率、单位任务能耗）。

### `stage_energy_summary.csv`

- 粒度：对象 + 阶段（每行 = 某对象某阶段总能耗）。
- 作用：用于阶段能耗堆叠图/阶段曲线。

### `joint_energy_summary.csv`

- 粒度：对象 + 关节（每行 = 某对象某关节总能耗）。
- 作用：用于关节贡献对比图。

---

## 2. 字段详细说明（重点）

## `time_series.csv` 字段


| 字段名                    | 类型       | 单位     | 含义          | 典型范围/备注                          |
| ---------------------- | -------- | ------ | ----------- | -------------------------------- |
| `timestamp`            | datetime | -      | 采样时间戳       | 1秒间隔                             |
| `run_id`               | int      | -      | 任务轮次编号      | 1...N                            |
| `series`               | str      | -      | 对象名称        | 本机-优化前/后/同类A/B                   |
| `stage`                | str      | -      | 任务阶段        | 待机准备/抓取接近/负载搬运/精准放置/回零复位         |
| `joint_load_index`     | float    | 无量纲    | 关节综合负载指数    | 约 0~1.6                          |
| `joint_speed_index`    | float    | 无量纲    | 关节综合速度指数    | 约 0~1.6                          |
| `supply_voltage_v`     | float    | V      | 供电电压        | 约 10.9~12.5                      |
| `current_a`            | float    | A      | 总电流         | 约 0.1~6.2                        |
| `power_w`              | float    | W      | 瞬时功率        | 约 2~86                           |
| `temperature_c`        | float    | °C     | 等效温度（用于热漂移） | 约 28~61                          |
| `spike_flag`           | int      | -      | 尖峰标记（0/1）   | 1=该秒出现瞬时尖峰                       |
| `J1_power_w`           | float    | W      | J1 分摊功率     | 与其余关节分摊和接近 `power_w`             |
| `J2_power_w`           | float    | W      | J2 分摊功率     | 同上                               |
| `J3_power_w`           | float    | W      | J3 分摊功率     | 同上                               |
| `J4_power_w`           | float    | W      | J4 分摊功率     | 同上                               |
| `energy_wh_step`       | float    | Wh     | 单步能耗（每秒）    | `power_w / 3600`                 |
| `cumulative_energy_wh` | float    | Wh     | 累计能耗        | 同一对象同一run内单调增加                   |
| `estimated_carbon_kg`  | float    | kgCO2e | 累计估算碳排      | `cumulative_energy_wh/1000*排放因子` |
| `unit_task_energy_wh`  | float    | Wh     | 单位任务能耗（过程量） | 在当前实现中用于过程参考                     |


说明：

1. `joint_load_index`、`joint_speed_index` 是归一化指标，用于体现工况变化，不是直接物理传感量。
2. `J1~J4_power_w` 由总功率按关节负载/速度加权分摊，用于关节贡献分析。
3. `estimated_carbon_kg` 使用固定排放因子（当前脚本为 `0.524 kgCO2/kWh`）。

---

## `run_kpis.csv` 字段


| 字段名                   | 类型    | 单位     | 含义      | 计算方式                         |
| --------------------- | ----- | ------ | ------- | ---------------------------- |
| `series`              | str   | -      | 对象名称    | 分组键                          |
| `run_id`              | int   | -      | 任务轮次    | 分组键                          |
| `total_energy_wh`     | float | Wh     | 该轮总能耗   | `sum(energy_wh_step)`        |
| `mean_power_w`        | float | W      | 平均功率    | `mean(power_w)`              |
| `peak_power_w`        | float | W      | 峰值功率    | `max(power_w)`               |
| `power_std_w`         | float | W      | 功率标准差   | `std(power_w)`               |
| `spike_count`         | int   | 次      | 尖峰次数    | `sum(spike_flag)`            |
| `avg_voltage_v`       | float | V      | 平均电压    | `mean(supply_voltage_v)`     |
| `avg_current_a`       | float | A      | 平均电流    | `mean(current_a)`            |
| `avg_temp_c`          | float | °C     | 平均温度    | `mean(temperature_c)`        |
| `power_cv`            | float | -      | 功率变异系数  | `power_std_w / mean_power_w` |
| `unit_task_energy_wh` | float | Wh/任务  | 单位任务能耗  | 当前等于 `total_energy_wh`       |
| `estimated_carbon_kg` | float | kgCO2e | 单任务估算碳排 | `total_energy_wh/1000*排放因子`  |


说明：

1. `power_cv` 越小，说明运行越稳定。
2. `spike_count` 越低，说明瞬时冲击越小。

---

## `summary_kpis.csv` 字段


| 字段名                         | 类型    | 单位        | 含义             | 计算方式                        |
| --------------------------- | ----- | --------- | -------------- | --------------------------- |
| `series`                    | str   | -         | 对象名称           | 分组键                         |
| `total_energy_wh`           | float | Wh/任务     | 跨轮次平均总能耗       | `mean(run.total_energy_wh)` |
| `peak_power_w`              | float | W         | 跨轮次平均峰值功率      | `mean(run.peak_power_w)`    |
| `mean_power_w`              | float | W         | 跨轮次平均功率        | `mean(run.mean_power_w)`    |
| `power_cv`                  | float | -         | 跨轮次平均功率变异系数    | `mean(run.power_cv)`        |
| `spike_count`               | float | 次/任务      | 跨轮次平均尖峰次数      | `mean(run.spike_count)`     |
| `unit_task_energy_wh`       | float | Wh/任务     | 单位任务能耗         | 同 `total_energy_wh` 口径      |
| `estimated_carbon_kg`       | float | kgCO2e/任务 | 单任务估算碳排        | `total_energy_wh/1000*排放因子` |
| `energy_saving_rate_pct`    | float | %         | 相对“本机-优化前”的节能率 | `(基线-本对象)/基线*100`           |
| `carbon_reduction_rate_pct` | float | %         | 相对“本机-优化前”的降碳率 | `(基线-本对象)/基线*100`           |


说明：

1. `energy_saving_rate_pct > 0` 表示节能，`< 0` 表示更耗能。
2. 当前模型中 `carbon_reduction_rate_pct` 与节能率同向变化。

---

## `stage_energy_summary.csv` 字段


| 字段名               | 类型    | 单位  | 含义          |
| ----------------- | ----- | --- | ----------- |
| `series`          | str   | -   | 对象名称        |
| `stage`           | str   | -   | 任务阶段        |
| `stage_energy_wh` | float | Wh  | 该对象在该阶段的总能耗 |


用途：

- 判断节能收益主要来自哪个阶段（例如负载搬运阶段）。

---

## `joint_energy_summary.csv` 字段


| 字段名               | 类型    | 单位  | 含义          |
| ----------------- | ----- | --- | ----------- |
| `series`          | str   | -   | 对象名称        |
| `joint`           | str   | -   | 关节编号（J1~J4） |
| `joint_energy_wh` | float | Wh  | 该对象该关节总能耗   |


用途：

- 判断关键耗能关节，并验证优化是否命中关键动力链。

---

## 3. 推荐使用方式

1. 报告结论优先引用 `summary_kpis.csv`。
2. 证明“统计稳定性”时引用 `run_kpis.csv` 的 `power_cv` 和 `spike_count`。
3. 讲机理时使用 `stage_energy_summary.csv` 和 `joint_energy_summary.csv`。
4. 若要二次分析（如异常检测/聚类），从 `time_series.csv` 开始。

---

## 4. 注意事项

1. 数据为仿真，不用于替代第三方实测认证。
2. 参数由脚本 `energy/scripts/generate_energy_assets.py` 生成，可通过 `--seed --duration --runs` 重现或扩展。
3. 若后续接入实测数据，建议保持字段名与单位不变，便于图表脚本复用。

