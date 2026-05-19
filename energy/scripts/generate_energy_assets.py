#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Generate simulated energy-consumption datasets and competition-ready figures.

Outputs:
- data/time_series.csv
- data/run_kpis.csv
- data/summary_kpis.csv
- data/stage_energy_summary.csv
- data/joint_energy_summary.csv
- figures/*.png + *.svg
- README.md / TALK_TRACK.md
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Tuple

import matplotlib
import numpy as np
import pandas as pd

# Use non-interactive backend for headless environments.
matplotlib.use("Agg")
import matplotlib.pyplot as plt

CARBON_FACTOR_KG_PER_KWH = 0.524  # configurable grid emission factor
SERIES_ORDER = [
    "本机-优化前",
    "本机-优化后",
    "同类机械臂A",
    "同类机械臂B",
]

STAGES: List[Tuple[str, int]] = [
    ("待机准备", 70),
    ("抓取接近", 130),
    ("负载搬运", 180),
    ("精准放置", 120),
    ("回零复位", 80),
]

JOINTS = ["J1", "J2", "J3", "J4"]


@dataclass
class ModelProfile:
    name: str
    base_current_a: float
    motion_gain_a: float
    load_gain_a: float
    voltage_nominal_v: float
    efficiency: float
    thermal_drift: float
    spike_prob: float
    control_smooth: float


PROFILES: Dict[str, ModelProfile] = {
    "本机-优化前": ModelProfile(
        name="本机-优化前",
        base_current_a=1.05,
        motion_gain_a=1.85,
        load_gain_a=1.05,
        voltage_nominal_v=11.8,
        efficiency=0.78,
        thermal_drift=0.22,
        spike_prob=0.018,
        control_smooth=0.82,
    ),
    "本机-优化后": ModelProfile(
        name="本机-优化后",
        base_current_a=0.86,
        motion_gain_a=1.45,
        load_gain_a=0.84,
        voltage_nominal_v=11.9,
        efficiency=0.87,
        thermal_drift=0.13,
        spike_prob=0.010,
        control_smooth=0.92,
    ),
    "同类机械臂A": ModelProfile(
        name="同类机械臂A",
        base_current_a=1.00,
        motion_gain_a=1.75,
        load_gain_a=0.98,
        voltage_nominal_v=11.7,
        efficiency=0.80,
        thermal_drift=0.18,
        spike_prob=0.016,
        control_smooth=0.85,
    ),
    "同类机械臂B": ModelProfile(
        name="同类机械臂B",
        base_current_a=1.10,
        motion_gain_a=1.92,
        load_gain_a=1.10,
        voltage_nominal_v=11.6,
        efficiency=0.76,
        thermal_drift=0.24,
        spike_prob=0.020,
        control_smooth=0.79,
    ),
}


def ensure_dirs(root: Path) -> Dict[str, Path]:
    data_dir = root / "data"
    fig_dir = root / "figures"
    scripts_dir = root / "scripts"
    data_dir.mkdir(parents=True, exist_ok=True)
    fig_dir.mkdir(parents=True, exist_ok=True)
    scripts_dir.mkdir(parents=True, exist_ok=True)
    return {"root": root, "data": data_dir, "fig": fig_dir, "scripts": scripts_dir}


def apply_style(style: str) -> None:
    plt.rcParams.update(plt.rcParamsDefault)
    if style == "paper":
        plt.style.use("seaborn-v0_8-whitegrid")
    elif style == "dark":
        plt.style.use("dark_background")
    else:
        plt.style.use("seaborn-v0_8")

    plt.rcParams["figure.dpi"] = 150
    plt.rcParams["savefig.dpi"] = 220
    plt.rcParams["font.sans-serif"] = [
        "Microsoft YaHei UI",
        "Microsoft YaHei",
        "SimHei",
        "SimSun",
        "Noto Sans CJK SC",
        "Arial Unicode MS",
        "DejaVu Sans",
    ]
    plt.rcParams["font.family"] = "sans-serif"
    plt.rcParams["axes.unicode_minus"] = False
    plt.rcParams["axes.grid"] = True
    plt.rcParams["grid.alpha"] = 0.2 if style == "dark" else 0.25
    plt.rcParams["grid.linestyle"] = "--"
    plt.rcParams["legend.frameon"] = True


def stage_frame(duration_s: int) -> pd.DataFrame:
    raw = pd.DataFrame(STAGES, columns=["stage", "base_seconds"])
    base_total = int(raw["base_seconds"].sum())
    scaled = (raw["base_seconds"] / base_total * duration_s).round().astype(int)
    diff = duration_s - int(scaled.sum())
    if diff != 0:
        scaled.iloc[-1] += diff
    raw["seconds"] = scaled
    raw["start_s"] = raw["seconds"].cumsum().shift(fill_value=0)
    raw["end_s"] = raw["start_s"] + raw["seconds"]
    return raw


def stage_modulators(
    stage_name: str, t_local: np.ndarray
) -> Tuple[np.ndarray, np.ndarray]:
    # returns motion_factor, load_factor curves
    if stage_name == "待机准备":
        motion = 0.18 + 0.04 * np.sin(t_local / 6.0)
        load = 0.10 + 0.03 * np.cos(t_local / 8.0)
    elif stage_name == "抓取接近":
        motion = 0.55 + 0.20 * np.sin(t_local / 5.0 + 0.4)
        load = 0.28 + 0.12 * np.sin(t_local / 13.0)
    elif stage_name == "负载搬运":
        motion = 0.72 + 0.22 * np.sin(t_local / 4.8)
        load = 0.72 + 0.15 * np.sin(t_local / 6.8 + 1.2)
    elif stage_name == "精准放置":
        motion = 0.46 + 0.18 * np.sin(t_local / 4.2 + 0.8)
        load = 0.38 + 0.10 * np.cos(t_local / 7.4)
    else:  # 回零复位
        motion = 0.50 + 0.12 * np.sin(t_local / 4.4)
        load = 0.22 + 0.09 * np.sin(t_local / 10.5 + 1.0)
    return np.clip(motion, 0.02, 1.2), np.clip(load, 0.02, 1.2)


def synthesize_for_model(
    profile: ModelProfile,
    run_id: int,
    duration_s: int,
    time_index: pd.DatetimeIndex,
    rng: np.random.Generator,
) -> pd.DataFrame:
    stage_df = stage_frame(duration_s)
    records: List[pd.DataFrame] = []
    temp_c_base = 31.0 + rng.normal(0, 0.2)

    for _, row in stage_df.iterrows():
        stage = str(row["stage"])
        start_s = int(row["start_s"])
        end_s = int(row["end_s"])
        n = max(1, end_s - start_s)
        local_t = np.arange(n, dtype=float)

        motion, load = stage_modulators(stage, local_t)
        # joint speed/load composition
        j1_speed = 0.35 + 0.50 * motion + 0.07 * np.sin(local_t / 3.4)
        j2_speed = 0.32 + 0.65 * motion + 0.11 * np.sin(local_t / 4.1 + 1.2)
        j3_speed = 0.25 + 0.58 * motion + 0.08 * np.sin(local_t / 3.8 + 2.1)
        j4_speed = 0.15 + 0.40 * motion + 0.06 * np.sin(local_t / 2.7 + 0.6)
        speed = np.vstack([j1_speed, j2_speed, j3_speed, j4_speed]).T

        j1_load = 0.20 + 0.40 * load + 0.05 * np.sin(local_t / 8.5)
        j2_load = 0.23 + 0.58 * load + 0.08 * np.sin(local_t / 9.5 + 0.6)
        j3_load = 0.17 + 0.50 * load + 0.06 * np.sin(local_t / 7.8 + 1.0)
        j4_load = 0.10 + 0.28 * load + 0.05 * np.sin(local_t / 6.0 + 1.8)
        load_arr = np.vstack([j1_load, j2_load, j3_load, j4_load]).T

        speed = np.clip(speed, 0.02, 1.6)
        load_arr = np.clip(load_arr, 0.02, 1.6)

        speed_scalar = speed.mean(axis=1)
        load_scalar = load_arr.mean(axis=1)

        temp_delta = (
            0.0065 * (0.8 + load_scalar)
            - 0.0026 * profile.control_smooth
            + rng.normal(0, 0.014, size=n)
        )
        temp_c_arr = np.clip(temp_c_base + np.cumsum(temp_delta), 28.0, 61.0)
        temp_c_base = float(temp_c_arr[-1])

        voltage = (
            profile.voltage_nominal_v
            - 0.25 * load_scalar
            - 0.10 * speed_scalar
            + rng.normal(0, 0.05, size=n)
        )
        voltage = np.clip(voltage, 10.9, 12.5)

        thermal_penalty = 1.0 + profile.thermal_drift * np.clip(
            (temp_c_arr - 33.0) / 25.0, 0.0, 1.0
        )

        base_current = (
            profile.base_current_a
            + profile.motion_gain_a * speed_scalar
            + profile.load_gain_a * load_scalar
        )
        noise = rng.normal(0, 0.09 + 0.05 * load_scalar, size=n)
        current = np.clip(base_current * thermal_penalty + noise, 0.10, None)

        spikes = rng.random(n) < profile.spike_prob
        current += spikes * rng.uniform(0.45, 1.05, size=n)
        current = np.clip(current, 0.1, 6.2)

        power = np.clip(voltage * current / max(profile.efficiency, 0.55), 2.0, 86.0)

        # distribute total power to joints (normalized contribution)
        joint_mix = speed * 0.58 + load_arr * 0.42
        joint_mix = np.clip(joint_mix, 1e-4, None)
        joint_mix = joint_mix / joint_mix.sum(axis=1, keepdims=True)
        joint_power = power.reshape(-1, 1) * joint_mix

        frame = pd.DataFrame(
            {
                "timestamp": time_index[start_s:end_s],
                "run_id": run_id,
                "series": profile.name,
                "stage": stage,
                "joint_load_index": load_scalar,
                "joint_speed_index": speed_scalar,
                "supply_voltage_v": voltage,
                "current_a": current,
                "power_w": power,
                "temperature_c": temp_c_arr,
                "spike_flag": spikes.astype(int),
                "J1_power_w": joint_power[:, 0],
                "J2_power_w": joint_power[:, 1],
                "J3_power_w": joint_power[:, 2],
                "J4_power_w": joint_power[:, 3],
            }
        )
        records.append(frame)

    df = pd.concat(records, ignore_index=True)
    df["energy_wh_step"] = df["power_w"] / 3600.0
    df["cumulative_energy_wh"] = df["energy_wh_step"].cumsum()
    df["estimated_carbon_kg"] = (
        df["cumulative_energy_wh"] / 1000.0 * CARBON_FACTOR_KG_PER_KWH
    )
    df["unit_task_energy_wh"] = df["cumulative_energy_wh"] / max(1, run_id)
    return df


def generate_dataset(seed: int, duration_s: int, runs: int) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    all_rows: List[pd.DataFrame] = []

    for run_id in range(1, runs + 1):
        start_time = pd.Timestamp("2026-05-01 09:00:00") + pd.Timedelta(
            minutes=(run_id - 1) * 18
        )
        time_index = pd.date_range(start_time, periods=duration_s, freq="1s")
        for name in SERIES_ORDER:
            model_seed = rng.integers(1, 10_000_000)
            model_rng = np.random.default_rng(int(model_seed))
            all_rows.append(
                synthesize_for_model(
                    profile=PROFILES[name],
                    run_id=run_id,
                    duration_s=duration_s,
                    time_index=time_index,
                    rng=model_rng,
                )
            )
    df = pd.concat(all_rows, ignore_index=True)
    return df


def build_kpis(
    df: pd.DataFrame,
) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    run_kpis = df.groupby(["series", "run_id"], as_index=False).agg(
        total_energy_wh=("energy_wh_step", "sum"),
        mean_power_w=("power_w", "mean"),
        peak_power_w=("power_w", "max"),
        power_std_w=("power_w", "std"),
        spike_count=("spike_flag", "sum"),
        avg_voltage_v=("supply_voltage_v", "mean"),
        avg_current_a=("current_a", "mean"),
        avg_temp_c=("temperature_c", "mean"),
    )
    run_kpis["power_cv"] = run_kpis["power_std_w"] / run_kpis["mean_power_w"].replace(
        0, np.nan
    )
    run_kpis["unit_task_energy_wh"] = run_kpis["total_energy_wh"]
    run_kpis["estimated_carbon_kg"] = (
        run_kpis["total_energy_wh"] / 1000.0 * CARBON_FACTOR_KG_PER_KWH
    )

    summary = run_kpis.groupby("series", as_index=False).agg(
        total_energy_wh=("total_energy_wh", "mean"),
        peak_power_w=("peak_power_w", "mean"),
        mean_power_w=("mean_power_w", "mean"),
        power_cv=("power_cv", "mean"),
        spike_count=("spike_count", "mean"),
        unit_task_energy_wh=("unit_task_energy_wh", "mean"),
        estimated_carbon_kg=("estimated_carbon_kg", "mean"),
    )

    baseline = summary.loc[summary["series"] == "本机-优化前"].iloc[0]
    summary["energy_saving_rate_pct"] = (
        (baseline["total_energy_wh"] - summary["total_energy_wh"])
        / baseline["total_energy_wh"]
        * 100.0
    )
    summary["carbon_reduction_rate_pct"] = (
        (baseline["estimated_carbon_kg"] - summary["estimated_carbon_kg"])
        / baseline["estimated_carbon_kg"]
        * 100.0
    )

    stage_energy = df.groupby(["series", "stage"], as_index=False).agg(
        stage_energy_wh=("energy_wh_step", "sum")
    )
    joint_energy = (
        df.assign(
            J1_energy_wh=df["J1_power_w"] / 3600.0,
            J2_energy_wh=df["J2_power_w"] / 3600.0,
            J3_energy_wh=df["J3_power_w"] / 3600.0,
            J4_energy_wh=df["J4_power_w"] / 3600.0,
        )
        .groupby("series", as_index=False)[
            ["J1_energy_wh", "J2_energy_wh", "J3_energy_wh", "J4_energy_wh"]
        ]
        .sum()
        .melt(id_vars="series", var_name="joint", value_name="joint_energy_wh")
    )
    joint_energy["joint"] = joint_energy["joint"].str.replace(
        "_energy_wh", "", regex=False
    )

    summary = summary.set_index("series").loc[SERIES_ORDER].reset_index()
    run_kpis = run_kpis.set_index("series").loc[SERIES_ORDER].reset_index()
    stage_energy["stage"] = pd.Categorical(
        stage_energy["stage"], [s for s, _ in STAGES], ordered=True
    )
    stage_energy = stage_energy.sort_values(["series", "stage"], kind="stable")
    joint_energy["joint"] = pd.Categorical(joint_energy["joint"], JOINTS, ordered=True)
    joint_energy = joint_energy.sort_values(["series", "joint"], kind="stable")

    return run_kpis, summary, stage_energy, joint_energy


def save_df(df: pd.DataFrame, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(path, index=False, encoding="utf-8-sig")


def palette() -> Dict[str, str]:
    return {
        "本机-优化前": "#D55E00",
        "本机-优化后": "#009E73",
        "同类机械臂A": "#0072B2",
        "同类机械臂B": "#CC79A7",
    }


def fig_save(fig: plt.Figure, fig_dir: Path, name: str) -> None:
    png = fig_dir / f"{name}.png"
    svg = fig_dir / f"{name}.svg"
    fig.savefig(png, bbox_inches="tight")
    fig.savefig(svg, bbox_inches="tight")
    plt.close(fig)


def plot_time_series(df: pd.DataFrame, fig_dir: Path) -> None:
    color_map = palette()
    # Use one representative run for clear timeline.
    run_id = int(df["run_id"].min())
    run_df = df[df["run_id"] == run_id].copy()
    run_df["sec"] = run_df.groupby("series").cumcount()

    fig, axes = plt.subplots(3, 1, figsize=(13, 10), sharex=True)
    for series in SERIES_ORDER:
        sub = run_df[run_df["series"] == series]
        axes[0].plot(
            sub["sec"],
            sub["power_w"],
            label=series,
            color=color_map[series],
            linewidth=1.35,
        )
        axes[1].plot(
            sub["sec"],
            sub["current_a"],
            label=series,
            color=color_map[series],
            linewidth=1.2,
        )
        axes[2].plot(
            sub["sec"],
            sub["cumulative_energy_wh"],
            label=series,
            color=color_map[series],
            linewidth=1.45,
        )
    axes[0].set_title("功率/电流/累计能耗时序对比（单次任务）")
    axes[0].set_ylabel("功率 (W)")
    axes[1].set_ylabel("电流 (A)")
    axes[2].set_ylabel("累计能耗 (Wh)")
    axes[2].set_xlabel("时间 (s)")
    axes[0].legend(ncol=2, fontsize=9)
    fig_save(fig, fig_dir, "01_时序对比_功率电流累计能耗")


def plot_power_distribution(df: pd.DataFrame, fig_dir: Path) -> None:
    color_map = palette()
    fig, ax = plt.subplots(figsize=(12, 6))
    grouped = [df.loc[df["series"] == s, "power_w"].values for s in SERIES_ORDER]
    bp = ax.boxplot(
        grouped, patch_artist=True, tick_labels=SERIES_ORDER, showfliers=True
    )
    for patch, s in zip(bp["boxes"], SERIES_ORDER):
        patch.set_facecolor(color_map[s])
        patch.set_alpha(0.35)
    ax.set_title("功率分布箱线图（多轮任务）")
    ax.set_ylabel("功率 (W)")
    ax.grid(True, axis="y", alpha=0.25)
    fig_save(fig, fig_dir, "02_功率分布箱线图")

    fig2, ax2 = plt.subplots(figsize=(12, 6))
    for series in SERIES_ORDER:
        vals = df.loc[df["series"] == series, "power_w"].values
        kde = pd.Series(vals).rolling(20, min_periods=1).mean().dropna()
        ax2.hist(
            vals,
            bins=55,
            density=True,
            alpha=0.25,
            color=color_map[series],
            label=f"{series}-直方",
        )
        ax2.plot(
            np.sort(kde.values),
            np.linspace(0, 0.2, len(kde)),
            color=color_map[series],
            linewidth=1.35,
            label=f"{series}-趋势",
        )
    ax2.set_title("功率分布与趋势（直方 + 密度趋势）")
    ax2.set_xlabel("功率 (W)")
    ax2.set_ylabel("相对密度")
    ax2.legend(ncol=2, fontsize=8)
    fig_save(fig2, fig_dir, "03_功率分布趋势")


def plot_stage_energy(stage_energy: pd.DataFrame, fig_dir: Path) -> None:
    color_map = palette()
    pivot = stage_energy.pivot(
        index="series", columns="stage", values="stage_energy_wh"
    ).loc[SERIES_ORDER]
    fig, ax = plt.subplots(figsize=(12, 7))
    bottom = np.zeros(len(pivot))
    stage_names = [s for s, _ in STAGES]
    stage_colors = ["#5B8FF9", "#61DDAA", "#F6BD16", "#7262FD", "#78D3F8"]
    for stg, c in zip(stage_names, stage_colors):
        vals = pivot[stg].values
        ax.bar(
            pivot.index,
            vals,
            bottom=bottom,
            label=stg,
            color=c,
            alpha=0.85,
            edgecolor="white",
        )
        bottom += vals
    ax.set_title("各任务阶段能耗堆叠对比")
    ax.set_ylabel("阶段能耗 (Wh)")
    ax.legend(title="阶段", ncol=3, fontsize=9)
    fig_save(fig, fig_dir, "04_任务阶段能耗堆叠图")

    fig2, ax2 = plt.subplots(figsize=(12, 6))
    for series in SERIES_ORDER:
        sub = stage_energy[stage_energy["series"] == series]
        ax2.plot(
            sub["stage"].astype(str),
            sub["stage_energy_wh"],
            marker="o",
            linewidth=2.0,
            color=color_map[series],
            label=series,
        )
    ax2.set_title("阶段能耗曲线对比")
    ax2.set_ylabel("阶段能耗 (Wh)")
    ax2.legend(ncol=2, fontsize=9)
    fig_save(fig2, fig_dir, "05_阶段能耗曲线对比")


def plot_joint_energy(joint_energy: pd.DataFrame, fig_dir: Path) -> None:
    color_map = palette()
    fig, ax = plt.subplots(figsize=(12, 6))
    width = 0.18
    x = np.arange(len(JOINTS))
    for i, series in enumerate(SERIES_ORDER):
        sub = joint_energy[joint_energy["series"] == series].sort_values("joint")
        ax.bar(
            x + (i - 1.5) * width,
            sub["joint_energy_wh"].values,
            width=width,
            label=series,
            color=color_map[series],
            alpha=0.86,
        )
    ax.set_xticks(x)
    ax.set_xticklabels(JOINTS)
    ax.set_title("关节能耗贡献对比")
    ax.set_ylabel("关节能耗 (Wh)")
    ax.legend(ncol=2, fontsize=9)
    fig_save(fig, fig_dir, "06_关节能耗贡献对比")


def plot_efficiency(summary: pd.DataFrame, fig_dir: Path) -> None:
    color_map = palette()
    fig, ax1 = plt.subplots(figsize=(12, 6))
    x = np.arange(len(SERIES_ORDER))
    vals = summary.set_index("series").loc[SERIES_ORDER]["unit_task_energy_wh"].values
    bars = ax1.bar(
        x,
        vals,
        color=[color_map[s] for s in SERIES_ORDER],
        alpha=0.82,
        label="单位任务能耗",
    )
    ax1.set_ylabel("单位任务能耗 (Wh)")
    ax1.set_xticks(x)
    ax1.set_xticklabels(SERIES_ORDER)
    ax1.set_title("单位任务能耗与节能/降碳率")

    ax2 = ax1.twinx()
    sub = summary.set_index("series").loc[SERIES_ORDER]
    ax2.plot(
        x,
        sub["energy_saving_rate_pct"].values,
        color="#F39C12",
        marker="o",
        linewidth=2.0,
        label="节能率",
    )
    ax2.plot(
        x,
        sub["carbon_reduction_rate_pct"].values,
        color="#16A085",
        marker="s",
        linewidth=2.0,
        label="降碳率",
    )
    ax2.set_ylabel("比例 (%)")

    lines, labels = [], []
    for axis in [ax1, ax2]:
        l, lb = axis.get_legend_handles_labels()
        lines.extend(l)
        labels.extend(lb)
    ax1.legend(lines, labels, loc="upper right")

    for rect, v in zip(bars, vals):
        ax1.text(
            rect.get_x() + rect.get_width() / 2,
            rect.get_height() + 0.1,
            f"{v:.2f}",
            ha="center",
            va="bottom",
            fontsize=9,
        )
    fig_save(fig, fig_dir, "07_单位任务能耗_节能率_降碳率")


def plot_stability(summary: pd.DataFrame, fig_dir: Path) -> None:
    sub = summary.set_index("series").loc[SERIES_ORDER]
    fig, axes = plt.subplots(1, 2, figsize=(13, 5.3))
    axes[0].bar(
        sub.index,
        sub["spike_count"],
        color=["#e76f51", "#2a9d8f", "#457b9d", "#b565a7"],
        alpha=0.88,
    )
    axes[0].set_title("峰值尖峰次数（均值）")
    axes[0].set_ylabel("次数 / 任务")
    axes[0].tick_params(axis="x", rotation=15)

    axes[1].bar(
        sub.index,
        sub["power_cv"] * 100.0,
        color=["#e76f51", "#2a9d8f", "#457b9d", "#b565a7"],
        alpha=0.88,
    )
    axes[1].set_title("功率波动率（CV）")
    axes[1].set_ylabel("CV (%)")
    axes[1].tick_params(axis="x", rotation=15)
    fig.suptitle("稳定性指标对比")
    fig_save(fig, fig_dir, "08_稳定性对比_尖峰与波动率")


def plot_carbon(summary: pd.DataFrame, fig_dir: Path) -> None:
    sub = summary.set_index("series").loc[SERIES_ORDER]
    fig, ax = plt.subplots(figsize=(11, 5.6))
    bars = ax.bar(
        sub.index,
        sub["estimated_carbon_kg"] * 1000.0,
        color=["#d35454", "#27ae60", "#3d7ea6", "#9b59b6"],
        alpha=0.85,
    )
    ax.set_title("单任务估算碳排对比")
    ax.set_ylabel("估算碳排 (gCO2e)")
    ax.tick_params(axis="x", rotation=15)
    for rect in bars:
        h = rect.get_height()
        ax.text(
            rect.get_x() + rect.get_width() / 2,
            h + 0.6,
            f"{h:.1f}",
            ha="center",
            va="bottom",
            fontsize=9,
        )
    fig_save(fig, fig_dir, "09_碳排估算对比")


def generate_figures(
    df: pd.DataFrame,
    summary: pd.DataFrame,
    stage_energy: pd.DataFrame,
    joint_energy: pd.DataFrame,
    fig_dir: Path,
) -> None:
    plot_time_series(df, fig_dir)
    plot_power_distribution(df, fig_dir)
    plot_stage_energy(stage_energy, fig_dir)
    plot_joint_energy(joint_energy, fig_dir)
    plot_efficiency(summary, fig_dir)
    plot_stability(summary, fig_dir)
    plot_carbon(summary, fig_dir)


def write_readme(root: Path, args: argparse.Namespace) -> None:
    text = f"""# Energy 可视化素材包（节能减排）

本目录用于生成并保存“机械臂节能减排”比赛展示素材，数据为**仿真生成**，但遵循工程约束（阶段切换、负载波动、热漂移、噪声和偶发尖峰），用于答辩展示与方案对比。

## 目录结构

- `scripts/generate_energy_assets.py`：一键生成脚本
- `data/`：CSV 数据与KPI表
- `figures/`：PNG/SVG 图表
- `TALK_TRACK.md`：每张图的答辩结论话术

## 运行命令

```bash
python energy/scripts/generate_energy_assets.py --seed {args.seed} --duration {args.duration} --runs {args.runs} --output energy --style {args.style}
```

## 说明

1. 数据口径：1Hz时序，多轮任务，包含本机优化前后和同类基线A/B。
2. 单位：功率 `W`，电流 `A`，能耗 `Wh`，碳排按 `{CARBON_FACTOR_KG_PER_KWH} kgCO2/kWh` 估算。
3. 用途：比赛展示、报告插图、答辩支撑；不作为实测认证报告。
"""
    (root / "README.md").write_text(text, encoding="utf-8")


def write_talk_track(root: Path) -> None:
    text = """# 图表答辩话术（可直接使用）

1. `01_时序对比_功率电流累计能耗`  
结论：优化后曲线整体下移，峰值更少，累计能耗斜率更低，体现了全过程节能。

2. `02_功率分布箱线图`  
结论：优化后中位数与上四分位明显下降，且离群尖峰减少，说明平均能耗和极端工况都得到改善。

3. `03_功率分布趋势`  
结论：优化后高功率区间的概率密度显著降低，运行更集中在高效区。

4. `04_任务阶段能耗堆叠图`  
结论：节能收益主要来自“负载搬运”和“精准放置”阶段，说明优化命中了高耗能环节。

5. `05_阶段能耗曲线对比`  
结论：在全部关键阶段中，优化后均低于优化前，节能不是局部现象而是系统性改进。

6. `06_关节能耗贡献对比`  
结论：高贡献关节（如J2/J3）下降更明显，符合动力链优化预期。

7. `07_单位任务能耗_节能率_降碳率`  
结论：单位任务能耗下降与降碳率同步，说明“节能”直接转化为“减排”。

8. `08_稳定性对比_尖峰与波动率`  
结论：优化后尖峰次数和波动率双降，体现控制策略更平稳、更可靠。

9. `09_碳排估算对比`  
结论：同等任务下碳排显著下降，具备明确的节能减排比赛表达价值。
"""
    (root / "TALK_TRACK.md").write_text(text, encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate energy dataset and visual assets."
    )
    parser.add_argument(
        "--seed", type=int, default=20260518, help="Random seed for reproducibility."
    )
    parser.add_argument(
        "--duration",
        type=int,
        default=600,
        help="Seconds per task run (recommended 480~720).",
    )
    parser.add_argument(
        "--runs", type=int, default=8, help="Number of runs per series."
    )
    parser.add_argument(
        "--output", type=str, default="energy", help="Output root directory."
    )
    parser.add_argument(
        "--style",
        type=str,
        choices=["paper", "default", "dark"],
        default="paper",
        help="Matplotlib visual style.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    output_root = Path(args.output).resolve()
    paths = ensure_dirs(output_root)
    apply_style(args.style)

    df = generate_dataset(seed=args.seed, duration_s=args.duration, runs=args.runs)
    run_kpis, summary, stage_energy, joint_energy = build_kpis(df)

    save_df(df, paths["data"] / "time_series.csv")
    save_df(run_kpis, paths["data"] / "run_kpis.csv")
    save_df(summary, paths["data"] / "summary_kpis.csv")
    save_df(stage_energy, paths["data"] / "stage_energy_summary.csv")
    save_df(joint_energy, paths["data"] / "joint_energy_summary.csv")

    generate_figures(df, summary, stage_energy, joint_energy, paths["fig"])
    write_readme(paths["root"], args)
    write_talk_track(paths["root"])

    print(f"[OK] Generated data and figures under: {paths['root']}")
    print(f"[OK] time_series rows: {len(df)}")
    print(
        f"[OK] figures count: {len(list(paths['fig'].glob('*.png')))} png + {len(list(paths['fig'].glob('*.svg')))} svg"
    )


if __name__ == "__main__":
    main()
