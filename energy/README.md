# Energy 可视化素材包（节能减排）

本目录用于生成并保存“机械臂节能减排”比赛展示素材，数据为**仿真生成**，但遵循工程约束（阶段切换、负载波动、热漂移、噪声和偶发尖峰），用于答辩展示、论文插图与方案对比。

## 目录结构

- `scripts/generate_energy_assets.py`：一键生成脚本
- `scripts/plot_style_journal.py`：顶刊风格版式（Nature/IEEE 常见规范）
- `data/`：CSV 数据与 KPI 表
- `figures/`：PNG（300 dpi）/ SVG / PDF 图表
- `TALK_TRACK.md`：每张图的答辩结论话术

## 运行命令

```bash
pip install -r energy/requirements.txt
python energy/scripts/generate_energy_assets.py --seed 20260518 --duration 600 --runs 8 --output energy --style journal
```

## 图表规范（journal 风格）

- 单栏 ~85 mm / 双栏 ~180 mm；子图标注 (a)(b)(c)
- 多轮任务：**mean ± SEM**（箱线图叠加 run 级散点）
- 功率分布：**KDE + ECDF**（非伪密度折线）
- 导出：PNG 300 dpi、SVG、PDF（`pdf.fonttype=42` 便于中文嵌入）

## 说明

1. 数据口径：1 Hz 时序，多轮任务，包含本机优化前后和同类基线 A/B。
2. 单位：功率 `W`，电流 `A`，能耗 `Wh`，碳排按 `0.524 kgCO2/kWh` 估算。
3. 用途：比赛展示、报告插图、答辩支撑；不作为实测认证报告。
