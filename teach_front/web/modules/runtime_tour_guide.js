import {
  advanceFeaTourToComputeRuntime,
  prepareKinematicsTourFromLessonRuntime,
  runFeaTeachingSequenceRuntime,
  runKinematicsTeachingSequenceRuntime
} from "./runtime_kinematics_fea.js";
import { toFiniteNumber } from "./app_math.js";

export const TOUR_COMPLETED_KEY = "teach_front_tour_completed_v1";

function nudgeJointForTour(app, jointName, deltaDeg) {
  const name = String(jointName || "");
  if (!name || !app.jointDefs?.has?.(name)) {
    return;
  }
  const def = app.jointDefs.get(name);
  const current = Number(app.jointAngles[name] || def?.defaultDeg || 0);
  const next = Math.min(def.maxDeg, Math.max(def.minDeg, current + Number(deltaDeg || 0)));
  app.setJointAngle(name, next, { mode: "教学引导", syncUi: true });
}

const PHASE_LABELS = {
  intro: "入门",
  control: "阶段 01 · 控制示教",
  kinematics: "阶段 02 · 正逆解",
  fea: "阶段 03 · 有限元",
  complete: "完成"
};

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

const TOUR_VIEW_MARGIN = 12;
const TOUR_TARGET_GAP = 14;

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function rectsOverlap(a, b, pad = 0) {
  return !(
    a.right + pad <= b.left
    || a.left - pad >= b.right
    || a.bottom + pad <= b.top
    || a.top - pad >= b.bottom
  );
}

function measureTourCard(cardEl) {
  const width = Math.min(440, Math.max(280, window.innerWidth - 32));
  cardEl.style.width = `${width}px`;
  const height = Math.max(cardEl.scrollHeight, cardEl.offsetHeight, 140);
  return { width, height };
}

function buildPlacementOrder(preferred) {
  const p = preferred === "top" || preferred === "left" || preferred === "right" ? preferred : "bottom";
  const all = ["bottom", "top", "right", "left"];
  return [p, ...all.filter((x) => x !== p)];
}

function candidateForPlacement(placement, target, cardW, cardH) {
  const cx = target.left + target.width / 2;
  const cy = target.top + target.height / 2;
  if (placement === "top") {
    return {
      placement,
      left: cx - cardW / 2,
      top: target.top - TOUR_TARGET_GAP,
      transform: "translateY(-100%)"
    };
  }
  if (placement === "left") {
    return {
      placement,
      left: target.left - TOUR_TARGET_GAP,
      top: cy,
      transform: "translate(-100%, -50%)"
    };
  }
  if (placement === "right") {
    return {
      placement,
      left: target.right + TOUR_TARGET_GAP,
      top: cy,
      transform: "translateY(-50%)"
    };
  }
  return {
    placement: "bottom",
    left: cx - cardW / 2,
    top: target.bottom + TOUR_TARGET_GAP,
    transform: "none"
  };
}

function cardBoxFromAnchor(candidate, cardW, cardH) {
  const { left, top, transform } = candidate;
  let x = left;
  let y = top;
  if (transform === "translateY(-100%)") {
    y = top - cardH;
  } else if (transform === "translate(-100%, -50%)") {
    x = left - cardW;
    y = top - cardH / 2;
  } else if (transform === "translateY(-50%)") {
    y = top - cardH / 2;
  }
  return { left: x, top: y, right: x + cardW, bottom: y + cardH };
}

function clampBoxToViewport(box, vw, vh) {
  let { left, top, right, bottom } = box;
  let dx = 0;
  let dy = 0;
  if (left < TOUR_VIEW_MARGIN) {
    dx += TOUR_VIEW_MARGIN - left;
  }
  if (right > vw - TOUR_VIEW_MARGIN) {
    dx += (vw - TOUR_VIEW_MARGIN) - right;
  }
  if (top < TOUR_VIEW_MARGIN) {
    dy += TOUR_VIEW_MARGIN - top;
  }
  if (bottom > vh - TOUR_VIEW_MARGIN) {
    dy += (vh - TOUR_VIEW_MARGIN) - bottom;
  }
  return {
    left: left + dx,
    top: top + dy,
    right: right + dx,
    bottom: bottom + dy
  };
}

function scoreCardBox(box, target, vw, vh, largeTarget) {
  if (
    box.left < TOUR_VIEW_MARGIN - 1
    || box.top < TOUR_VIEW_MARGIN - 1
    || box.right > vw - TOUR_VIEW_MARGIN + 1
    || box.bottom > vh - TOUR_VIEW_MARGIN + 1
  ) {
    return -1e6;
  }

  let score = 1000;
  if (!largeTarget && rectsOverlap(box, target, 10)) {
    score -= 700;
  }
  if (largeTarget) {
    const below = box.top >= target.bottom + 4;
    const beside = box.right <= target.left - 4 || box.left >= target.right + 4;
    if (below || beside) {
      score += 120;
    } else {
      score -= 400;
    }
  }
  const dist = Math.hypot(
    (box.left + box.right) / 2 - (target.left + target.right) / 2,
    (box.top + box.bottom) / 2 - (target.top + target.bottom) / 2
  );
  score -= dist * 0.04;
  return score;
}

function pickCardPosition(target, preferred, cardW, cardH) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const largeTarget = target.width > vw * 0.42 || target.height > vh * 0.38;
  const order = buildPlacementOrder(largeTarget ? "bottom" : preferred);

  let bestBox = null;
  let bestScore = -Infinity;
  for (const p of order) {
    const raw = candidateForPlacement(p, target, cardW, cardH);
    const box = clampBoxToViewport(cardBoxFromAnchor(raw, cardW, cardH), vw, vh);
    const s = scoreCardBox(box, target, vw, vh, largeTarget);
    if (s > bestScore) {
      bestScore = s;
      bestBox = box;
    }
  }

  if (bestBox && bestScore > -1e5) {
    return bestBox;
  }

  const fallbackW = cardW;
  const fallbackH = cardH;
  return clampBoxToViewport({
    left: (vw - fallbackW) / 2,
    top: vh - TOUR_VIEW_MARGIN - fallbackH,
    right: (vw + fallbackW) / 2,
    bottom: vh - TOUR_VIEW_MARGIN
  }, vw, vh);
}

function applyCenterCardPosition(cardEl, cardW, cardH) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  applyCardBox(cardEl, {
    left: (vw - cardW) / 2,
    top: (vh - cardH) / 2,
    right: (vw + cardW) / 2,
    bottom: (vh + cardH) / 2
  }, cardW);
}

function applyCardBox(cardEl, box, cardW) {
  Object.assign(cardEl.style, {
    position: "fixed",
    left: `${box.left}px`,
    top: `${box.top}px`,
    width: `${cardW}px`,
    transform: "none",
    bottom: "auto",
    right: "auto",
    visibility: "visible"
  });
}

function buildActionRegistry(app) {
  return {
    nudgeJ2: () => nudgeJointForTour(app, "J2", 8),
    applyLesson0: () => app.applyLesson(0, true),
    applyLesson1: () => app.applyLesson(1, true),
    prepareKinL3: () => prepareKinematicsTourFromLessonRuntime(app, 2, { toFiniteNumber }),
    kinFlowToSolve: () => runKinematicsTeachingSequenceRuntime(app),
    solveIk: () => app.solveIkFromUi(),
    reverseCheck: () => app.reverseCheck(),
    feaL4: () => runFeaTeachingSequenceRuntime(app, 3),
    feaToCompute: () => advanceFeaTourToComputeRuntime(app),
    runFea: () => app.runFea()
  };
}

function captureTourSnapshot(app) {
  const jointAngles = {};
  for (const [name, val] of Object.entries(app.jointAngles || {})) {
    if (Number.isFinite(Number(val))) {
      jointAngles[name] = Number(val);
    }
  }
  return {
    stage: app.currentStage,
    jointAngles,
    kinMode: app.kinMode,
    ikTarget: {
      x: Number(app.dom.ikX?.value),
      y: Number(app.dom.ikY?.value),
      z: Number(app.dom.ikZ?.value)
    },
    feaLoad: Number(app.fea?.load),
    feaExaggeration: Number(app.fea?.exaggeration),
    lessonIndex: app.currentLessonIndex
  };
}

function restoreTourSnapshot(app, snapshot) {
  if (!snapshot) {
    return;
  }
  if (snapshot.stage) {
    app.setTeachingStage(snapshot.stage);
  }
  if (snapshot.kinMode) {
    app.setKinematicsMode(snapshot.kinMode);
  }
  if (snapshot.ikTarget) {
    if (app.dom.ikX) app.dom.ikX.value = String(snapshot.ikTarget.x ?? 0);
    if (app.dom.ikY) app.dom.ikY.value = String(snapshot.ikTarget.y ?? 0);
    if (app.dom.ikZ) app.dom.ikZ.value = String(snapshot.ikTarget.z ?? 0);
  }
  if (Number.isFinite(snapshot.feaLoad)) {
    app.fea.load = snapshot.feaLoad;
    if (app.dom.feaLoad) app.dom.feaLoad.value = String(snapshot.feaLoad);
  }
  if (Number.isFinite(snapshot.feaExaggeration)) {
    app.fea.exaggeration = snapshot.feaExaggeration;
    if (app.dom.feaExaggeration) app.dom.feaExaggeration.value = String(snapshot.feaExaggeration);
  }
  app.refreshFeaTexts();
  if (Number.isFinite(snapshot.lessonIndex)) {
    app.applyLesson(snapshot.lessonIndex, false);
  }
  const angles = snapshot.jointAngles || {};
  for (const [k, v] of Object.entries(angles)) {
    app.setJointAngle(String(k), Number(v), { syncUi: true, applyNow: false, updateKinematics: false });
  }
  app.applyJointAngles();
  app.updateEefReadout();
}

export class TourGuideRuntime {
  constructor(app) {
    this.app = app;
    this.root = null;
    this.steps = [];
    this.index = 0;
    this.active = false;
    this.snapshot = null;
    this.actions = buildActionRegistry(app);
    this.resizeHandler = () => this.reposition();
    this.keyHandler = (ev) => this.onKeyDown(ev);
  }

  async loadScript() {
    try {
      const res = await fetch("./tour_script.json?v=20260519-tour1");
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      this.steps = Array.isArray(data?.steps) ? data.steps : [];
      return data;
    } catch (err) {
      this.app.log(`Tour script load failed: ${err?.message || err}`);
      this.steps = [];
      return null;
    }
  }

  mount() {
    const host = document.getElementById("tourRoot");
    if (!host) {
      return;
    }
    host.innerHTML = `
      <div class="tour-welcome" data-tour-welcome hidden>
        <div class="tour-welcome-backdrop"></div>
        <div class="tour-welcome-card" role="dialog" aria-modal="true" aria-labelledby="tourWelcomeTitle">
          <p class="tour-welcome-kicker">首次使用</p>
          <h2 id="tourWelcomeTitle">欢迎使用机械臂教学辅助系统</h2>
          <p class="tour-welcome-body">约 3–5 分钟带您完整体验「控制示教、正逆解实验、有限元演示」三大功能。也可稍后在侧栏点击「教学引导」重新开始。</p>
          <div class="tour-welcome-actions">
            <button type="button" class="btn btn-strong" data-tour-welcome-start>开始教学引导</button>
            <button type="button" class="btn ghost-btn" data-tour-welcome-later>稍后再说</button>
          </div>
        </div>
      </div>
      <div class="tour-overlay" data-tour-overlay hidden>
        <div class="tour-spotlight-hole" data-tour-hole></div>
        <div class="tour-card" data-tour-card role="dialog" aria-modal="true" aria-live="polite">
          <div class="tour-card-accent" data-tour-accent></div>
          <div class="tour-card-head">
            <span class="tour-phase" data-tour-phase></span>
            <span class="tour-progress" data-tour-progress></span>
          </div>
          <h3 class="tour-title" data-tour-title></h3>
          <p class="tour-body" data-tour-body></p>
          <div class="tour-card-actions">
            <button type="button" class="btn ghost-btn" data-tour-skip>跳过引导</button>
            <button type="button" class="btn" data-tour-prev>上一步</button>
            <button type="button" class="btn btn-strong" data-tour-next>下一步</button>
          </div>
        </div>
      </div>
    `;

    this.root = host;
    this.welcomeEl = host.querySelector("[data-tour-welcome]");
    this.overlayEl = host.querySelector("[data-tour-overlay]");
    this.holeEl = host.querySelector("[data-tour-hole]");
    this.cardEl = host.querySelector("[data-tour-card]");
    this.phaseEl = host.querySelector("[data-tour-phase]");
    this.progressEl = host.querySelector("[data-tour-progress]");
    this.titleEl = host.querySelector("[data-tour-title]");
    this.bodyEl = host.querySelector("[data-tour-body]");
    this.accentEl = host.querySelector("[data-tour-accent]");
    this.btnPrev = host.querySelector("[data-tour-prev]");
    this.btnNext = host.querySelector("[data-tour-next]");
    this.btnSkip = host.querySelector("[data-tour-skip]");

    host.querySelector("[data-tour-welcome-start]")?.addEventListener("click", () => {
      this.hideWelcome();
      this.startTour({ fromWelcome: true });
    });
    host.querySelector("[data-tour-welcome-later]")?.addEventListener("click", () => this.hideWelcome());
    this.btnPrev?.addEventListener("click", () => this.prevStep());
    this.btnNext?.addEventListener("click", () => this.nextStep());
    this.btnSkip?.addEventListener("click", () => this.confirmStop());
  }

  isCompleted() {
    try {
      return localStorage.getItem(TOUR_COMPLETED_KEY) === "1";
    } catch (_err) {
      return false;
    }
  }

  markCompleted() {
    try {
      localStorage.setItem(TOUR_COMPLETED_KEY, "1");
    } catch (_err) {
      // ignore
    }
  }

  showWelcomeIfNeeded() {
    if (this.isCompleted() || !this.welcomeEl) {
      return;
    }
    this.welcomeEl.hidden = false;
    this.root.hidden = false;
    this.root.setAttribute("aria-hidden", "false");
  }

  hideWelcome() {
    if (this.welcomeEl) {
      this.welcomeEl.hidden = true;
    }
    if (!this.active) {
      this.root.hidden = true;
      this.root.setAttribute("aria-hidden", "true");
    }
  }

  async startTour({ fromWelcome = false } = {}) {
    if (!this.steps.length) {
      await this.loadScript();
    }
    if (!this.steps.length) {
      this.app.log("教学引导：步骤脚本为空，无法启动");
      return;
    }

    if (this.active) {
      await this.stopTour({ restoreState: false, silent: true });
    }

    this.snapshot = captureTourSnapshot(this.app);
    this.index = 0;
    this.active = true;
    this.app.tourSuppressUiSave = true;
    this.app.clearKinematicsDemoTimers();
    if (this.app.autoLessonTimer) {
      clearInterval(this.app.autoLessonTimer);
      this.app.autoLessonTimer = null;
    }

    this.root.hidden = false;
    this.root.setAttribute("aria-hidden", "false");
    this.hideWelcome();
    document.body.classList.add("is-tour-active");
    window.addEventListener("resize", this.resizeHandler);
    window.addEventListener("scroll", this.resizeHandler, true);
    document.addEventListener("keydown", this.keyHandler);

    if (this.app.dom.modeText) {
      this.app.dom.modeText.textContent = fromWelcome ? "教学引导中" : "教学引导（重新开始）";
    }

    await this.renderStep();
  }

  async stopTour({ restoreState = true, silent = false } = {}) {
    if (!this.active && silent) {
      return;
    }
    this.active = false;
    this.app.tourSuppressUiSave = false;
    document.body.classList.remove("is-tour-active");
    window.removeEventListener("resize", this.resizeHandler);
    window.removeEventListener("scroll", this.resizeHandler, true);
    document.removeEventListener("keydown", this.keyHandler);

    if (this.overlayEl) {
      this.overlayEl.hidden = true;
    }
    if (this.root) {
      this.root.hidden = true;
      this.root.setAttribute("aria-hidden", "true");
    }

    if (restoreState && this.snapshot) {
      restoreTourSnapshot(this.app, this.snapshot);
    }
    this.snapshot = null;

    if (!silent) {
      this.app.log("教学引导已结束");
    }
  }

  confirmStop() {
    const ok = window.confirm("确定要跳过教学引导吗？将恢复引导开始前的界面状态。");
    if (ok) {
      this.stopTour({ restoreState: true });
    }
  }

  onKeyDown(ev) {
    if (!this.active) {
      return;
    }
    if (ev.key === "Escape") {
      ev.preventDefault();
      this.confirmStop();
    } else if (ev.key === "ArrowRight" || ev.key === "Enter") {
      ev.preventDefault();
      this.nextStep();
    } else if (ev.key === "ArrowLeft") {
      ev.preventDefault();
      this.prevStep();
    }
  }

  getStep() {
    return this.steps[this.index] || null;
  }

  async prevStep() {
    if (this.index <= 0) {
      return;
    }
    this.index -= 1;
    await this.renderStep();
  }

  async nextStep() {
    const step = this.getStep();
    if (step?.isComplete) {
      this.markCompleted();
      await this.stopTour({ restoreState: false });
      return;
    }
    if (this.index >= this.steps.length - 1) {
      this.markCompleted();
      await this.stopTour({ restoreState: false });
      return;
    }
    this.index += 1;
    await this.renderStep();
  }

  async runStepAction(step) {
    const name = String(step?.action || "").trim();
    if (!name) {
      return;
    }
    const fn = this.actions[name];
    if (typeof fn !== "function") {
      this.app.log(`Tour action missing: ${name}`);
      return;
    }
    await delay(Number(step.actionDelay) || 0);
    fn();
    await delay(120);
  }

  async renderStep() {
    const step = this.getStep();
    if (!step) {
      return;
    }

    if (step.stage) {
      this.app.setTeachingStage(step.stage);
    }

    await this.runStepAction(step);

    if (this.overlayEl) {
      this.overlayEl.hidden = false;
    }

    const phase = step.phase || "intro";
    if (this.phaseEl) {
      this.phaseEl.textContent = PHASE_LABELS[phase] || phase;
    }
    if (this.progressEl) {
      this.progressEl.textContent = `第 ${this.index + 1} / ${this.steps.length} 步`;
    }
    if (this.titleEl) {
      this.titleEl.textContent = step.title || "";
    }
    if (this.bodyEl) {
      this.bodyEl.textContent = step.body || "";
    }
    if (this.accentEl) {
      this.accentEl.dataset.phase = phase;
    }
    const isFirst = this.index <= 0;
    const isLast = Boolean(step.isComplete) || this.index >= this.steps.length - 1;
    if (this.btnPrev) {
      this.btnPrev.disabled = isFirst;
    }
    if (this.btnNext) {
      this.btnNext.textContent = step.isComplete ? "我知道了" : isLast ? "完成" : "下一步";
    }

    await delay(50);
    this.reposition();
  }

  reposition() {
    const step = this.getStep();
    if (!step || !this.overlayEl || !this.cardEl) {
      return;
    }

    const { width: cardW, height: cardH } = measureTourCard(this.cardEl);
    const pad = 10;
    const targetSel = step.target ? String(step.target) : "";
    let rect = null;
    let targetEl = null;
    if (targetSel) {
      targetEl = document.querySelector(targetSel);
      if (targetEl) {
        rect = targetEl.getBoundingClientRect();
        if (rect.width < 2 && rect.height < 2) {
          rect = null;
        }
      }
    }

    if (!rect || step.placement === "center" || !step.target) {
      this.holeEl.style.display = "none";
      this.overlayEl.style.background = "rgba(8, 14, 26, 0.72)";
      applyCenterCardPosition(this.cardEl, cardW, cardH);
      return;
    }

    this.holeEl.style.display = "block";
    const x = Math.max(8, rect.left - pad);
    const y = Math.max(8, rect.top - pad);
    const w = Math.min(window.innerWidth - 16, rect.width + pad * 2);
    const h = Math.min(window.innerHeight - 16, rect.height + pad * 2);

    Object.assign(this.holeEl.style, {
      left: `${x}px`,
      top: `${y}px`,
      width: `${w}px`,
      height: `${h}px`
    });

    this.overlayEl.style.background = "transparent";

    const target = {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height
    };
    const box = pickCardPosition(target, step.placement || "bottom", cardW, cardH);
    applyCardBox(this.cardEl, box, cardW);

    try {
      targetEl?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    } catch (_err) {
      // ignore
    }
  }
}

export function initTourGuideRuntime(app) {
  const tour = new TourGuideRuntime(app);
  tour.mount();
  return tour;
}
