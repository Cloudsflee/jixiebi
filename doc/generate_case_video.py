from __future__ import annotations

import glob
import os
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parent.parent
FRAME_DIR = ROOT / "doc" / "video_frames_debug"
OUT_VIDEO = ROOT / "doc" / "节能减排案例视频-项目版.mp4"

VIDEO_W = 1920
VIDEO_H = 1080
FPS = 15
TRANSITION_SEC = 0.8


def find_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = []
    win_font_dir = Path(os.environ.get("WINDIR", r"C:\Windows")) / "Fonts"
    if bold:
        candidates.extend(
            [
                win_font_dir / "msyhbd.ttc",
                win_font_dir / "simhei.ttf",
            ]
        )
    candidates.extend(
        [
            win_font_dir / "msyh.ttc",
            win_font_dir / "simsun.ttc",
            win_font_dir / "simhei.ttf",
            win_font_dir / "arialuni.ttf",
        ]
    )
    for path in candidates:
        if path.exists():
            try:
                return ImageFont.truetype(str(path), size=size)
            except Exception:
                continue
    return ImageFont.load_default()


def wrap_lines(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont, max_width: int) -> list[str]:
    lines: list[str] = []
    current = ""
    for ch in text:
        candidate = current + ch
        width = draw.textlength(candidate, font=font)
        if width <= max_width or not current:
            current = candidate
            continue
        lines.append(current)
        current = ch
    if current:
        lines.append(current)
    return lines


def build_slides(image_paths: list[Path]) -> list[dict]:
    picks = [0, 1, 4, 7, 10, 12, 14, 17, 19, 21]
    picked_images = [image_paths[min(i, len(image_paths) - 1)] for i in picks]
    durations = [16, 18, 18, 18, 18, 18, 18, 20, 20, 16]

    titles = [
        "数字孪生机械臂：节能减排案例",
        "痛点：传统调试的隐性浪费",
        "方案：Web + Gateway + STM32 闭环",
        "能力：3D同步与参数可追溯",
        "关键：轴线/轴心校准避免乱飞",
        "配置：Write selected J 直接回写",
        "稳定：装配锁定与层级约束",
        "演示：正逆解 + 伪有限元",
        "节能收益（演示工况估算）",
        "结论：让调试更快、更稳、更低碳",
    ]

    bullet_blocks = [
        [
            "基于当前项目真实材料自动生成案例视频",
            "覆盖：固件、网关、前端、模型、参数、演示算法",
            "目标：减少试错、降低空转、提升迭代效率",
        ],
        [
            "反复试动作 -> 空转能耗持续累积",
            "参数不一致 -> 返工次数增加",
            "机械与模型不对齐 -> 调试周期拉长",
        ],
        [
            "前端下发动作与查询，网关做串口桥接",
            "STM32执行总线舵机控制并回传状态",
            "形成“控制-回读-校正”的闭环联调",
        ],
        [
            "STL装配体分组加载，关节层级驱动",
            "joints.json统一管理轴向、限位、映射",
            "每次调参可沉淀为可复用配置",
        ],
        [
            "支持点选生成“外->内”轴线",
            "支持固定线位置，避免观察漂移",
            "支持轴心沿轴线滑动，提升校准效率",
        ],
        [
            "网关支持config_read/config_write",
            "Write selected J可直写joints.json",
            "从“手工记录”转向“配置可追溯”",
        ],
        [
            "assemblyLock优先保证演示稳定",
            "motionLocks约束关键关节轴向",
            "先稳定，再逐步提高机构真实性",
        ],
        [
            "演示级IK：目标位姿直接驱动关节",
            "演示级Pseudo FEA：应力热度可视化",
            "将风险前移到低成本虚拟调试阶段",
        ],
        [
            "无效动作次数：预计下降约30%~50%",
            "无效通电时长：预计下降约25%~40%",
            "注：为当前演示工况估算，非量产定值",
        ],
        [
            "节能减排不只靠硬件，更靠调试方法",
            "数字孪生让每次迭代更有数据依据",
            "下一步：引入真实CAD参数与长期实测统计",
        ],
    ]

    slides = []
    for i in range(len(titles)):
        slides.append(
            {
                "title": titles[i],
                "bullets": bullet_blocks[i],
                "duration": durations[i],
                "image": picked_images[i],
            }
        )
    return slides


def prepare_bg(path: Path) -> Image.Image:
    src = Image.open(path).convert("RGB")
    return ImageOps.fit(src, (2400, 1350), method=Image.Resampling.LANCZOS)


def render_slide_frame(
    slide: dict,
    frame_idx: int,
    total_frames: int,
    slide_idx: int,
    title_font: ImageFont.ImageFont,
    body_font: ImageFont.ImageFont,
    note_font: ImageFont.ImageFont,
) -> Image.Image:
    progress = 0 if total_frames <= 1 else frame_idx / (total_frames - 1)
    bg = slide["_bg"]
    sw, sh = bg.size

    zoom = 1.0 + 0.08 * progress
    cw = int(VIDEO_W / zoom)
    ch = int(VIDEO_H / zoom)
    cw = max(960, min(cw, sw))
    ch = max(540, min(ch, sh))

    ox = int((sw - cw) * (0.5 + 0.22 * np.sin(progress * np.pi * 2 + slide_idx * 0.7)))
    oy = int((sh - ch) * (0.5 + 0.16 * np.cos(progress * np.pi * 2 + slide_idx * 0.5)))
    ox = max(0, min(sw - cw, ox))
    oy = max(0, min(sh - ch, oy))

    frame = bg.crop((ox, oy, ox + cw, oy + ch)).resize((VIDEO_W, VIDEO_H), Image.Resampling.LANCZOS).convert("RGBA")

    overlay = Image.new("RGBA", (VIDEO_W, VIDEO_H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    draw.rounded_rectangle((80, 70, VIDEO_W - 80, 300), radius=28, fill=(0, 0, 0, 138))
    draw.rounded_rectangle((80, VIDEO_H - 400, VIDEO_W - 80, VIDEO_H - 80), radius=28, fill=(0, 0, 0, 148))
    draw.rounded_rectangle((80, VIDEO_H - 74, VIDEO_W - 80, VIDEO_H - 34), radius=18, fill=(0, 0, 0, 120))
    frame = Image.alpha_composite(frame, overlay)

    draw = ImageDraw.Draw(frame)
    draw.text((120, 115), slide["title"], font=title_font, fill=(255, 255, 255, 255))
    draw.text((120, 210), "项目材料自动生成 | 数字孪生机械臂案例视频", font=note_font, fill=(190, 235, 255, 255))

    y = VIDEO_H - 360
    for bullet in slide["bullets"]:
        text = f"• {bullet}"
        draw.text((130, y), text, font=body_font, fill=(244, 244, 244, 255))
        y += 86

    progress_w = int((VIDEO_W - 180) * progress)
    draw.rounded_rectangle((90, VIDEO_H - 66, VIDEO_W - 90, VIDEO_H - 42), radius=10, fill=(75, 75, 75, 220))
    draw.rounded_rectangle((90, VIDEO_H - 66, 90 + progress_w, VIDEO_H - 42), radius=10, fill=(70, 206, 255, 240))
    draw.text((VIDEO_W - 530, VIDEO_H - 102), "注：节能数据为演示工况估算", font=note_font, fill=(250, 220, 120, 255))
    return frame.convert("RGB")


def main() -> None:
    image_paths = [Path(p) for p in sorted(glob.glob(str(FRAME_DIR / "*.png")))]
    if not image_paths:
        raise RuntimeError(f"no png found in {FRAME_DIR}")

    slides = build_slides(image_paths)
    for slide in slides:
        slide["_bg"] = ImageOps.fit(Image.open(slide["image"]).convert("RGB"), (2400, 1350), method=Image.Resampling.LANCZOS)

    title_font = find_font(58, bold=True)
    body_font = find_font(42, bold=False)
    note_font = find_font(30, bold=False)

    OUT_VIDEO.parent.mkdir(parents=True, exist_ok=True)
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(str(OUT_VIDEO), fourcc, FPS, (VIDEO_W, VIDEO_H))
    if not writer.isOpened():
        raise RuntimeError("failed to open video writer")

    transition_frames = max(1, int(TRANSITION_SEC * FPS))
    prev_last_frame = None
    total_sec = 0

    for idx, slide in enumerate(slides):
        frame_count = int(slide["duration"] * FPS)
        total_sec += slide["duration"]
        for f in range(frame_count):
            frame_img = render_slide_frame(slide, f, frame_count, idx, title_font, body_font, note_font)

            if prev_last_frame is not None and f < transition_frames:
                alpha = f / transition_frames
                frame_np = np.asarray(frame_img, dtype=np.uint8)
                mixed = cv2.addWeighted(prev_last_frame, 1.0 - alpha, frame_np, alpha, 0.0)
            else:
                mixed = np.asarray(frame_img, dtype=np.uint8)

            writer.write(cv2.cvtColor(mixed, cv2.COLOR_RGB2BGR))

        prev_last_frame = np.asarray(
            render_slide_frame(slide, frame_count - 1, frame_count, idx, title_font, body_font, note_font),
            dtype=np.uint8,
        )

    writer.release()
    print(f"Generated: {OUT_VIDEO}")
    print(f"Duration: ~{total_sec} sec")


if __name__ == "__main__":
    main()
