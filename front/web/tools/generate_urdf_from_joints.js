"use strict";

const fs = require("fs");
const path = require("path");

const CHAIN_TARGETS = ["base", "j1", "j2", "j3", "j4"];
const MM_TO_M = 0.001;

function defaultParentTargetForTarget(target) {
  const key = String(target || "").trim().toLowerCase();
  const idx = CHAIN_TARGETS.indexOf(key);
  if (idx <= 0) return "base";
  return CHAIN_TARGETS[idx - 1];
}

function toFiniteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toVec3(value, fallback = [0, 0, 0]) {
  if (!Array.isArray(value) || value.length < 3) return [...fallback];
  return [
    toFiniteNumber(value[0], fallback[0]),
    toFiniteNumber(value[1], fallback[1]),
    toFiniteNumber(value[2], fallback[2])
  ];
}

function addVec3(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function subVec3(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function formatVec3(vec, scale = 1) {
  return vec.map((v) => (v * scale).toFixed(6)).join(" ");
}

function degToRad(value) {
  return (Math.PI / 180) * toFiniteNumber(value, 0);
}

function axisVector(axisText) {
  const axis = String(axisText || "z").trim().toLowerCase();
  if (axis === "x") return [1, 0, 0];
  if (axis === "y") return [0, 1, 0];
  return [0, 0, 1];
}

function escapeXml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function buildUrdf(config, manifest = null) {
  const parts = Array.isArray(config.parts) ? config.parts : [];
  const joints = Array.isArray(config.joints) ? config.joints : [];

  const partsByTarget = new Map();
  for (const part of parts) {
    if (!part || typeof part !== "object") continue;
    const target = String(part.target || "").trim().toLowerCase();
    if (!target) continue;
    if (!partsByTarget.has(target)) partsByTarget.set(target, []);
    partsByTarget.get(target).push(part);
  }

  const jointByTarget = new Map();
  for (const joint of joints) {
    if (!joint || typeof joint !== "object") continue;
    const target = String(joint.target || "").trim().toLowerCase();
    if (!target) continue;
    jointByTarget.set(target, joint);
  }

  const framePivotMm = {
    base: [0, 0, 0]
  };

  for (const target of CHAIN_TARGETS) {
    if (target === "base") continue;
    const joint = jointByTarget.get(target);
    const pivot = toVec3(joint?.pivot, [0, 0, 0]);
    const adjust = toVec3(joint?.pivotAdjust, [0, 0, 0]);
    framePivotMm[target] = addVec3(pivot, adjust);
  }

  const lines = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<!--');
  lines.push("  Auto-generated from front/web/joints.json");
  if (manifest && Array.isArray(manifest.sldasmFiles) && manifest.sldasmFiles.length > 0) {
    lines.push(`  Source SLDASM: ${manifest.sldasmFiles.join(" | ")}`);
  }
  lines.push("  Notes:");
  lines.push("  1) This URDF uses current demo chain base->j1->j2->j3->j4.");
  lines.push("  2) STL coordinates are assumed to be assembly-global (mm), so link visual origins are auto-offset.");
  lines.push("  3) STL mesh scale is set to 0.001 (mm -> m).");
  lines.push("-->");
  lines.push('<robot name="digital_twin_arm">');
  lines.push("");

  for (const target of CHAIN_TARGETS) {
    const linkName = `link_${target}`;
    const linkFrameMm = framePivotMm[target] || [0, 0, 0];
    const visualOffsetMm = target === "base" ? [0, 0, 0] : [-linkFrameMm[0], -linkFrameMm[1], -linkFrameMm[2]];
    const targetParts = partsByTarget.get(target) || [];

    lines.push(`  <link name="${escapeXml(linkName)}">`);
    if (targetParts.length === 0) {
      lines.push("    <!-- no mesh part mapped for this link -->");
    }

    let visualCount = 0;
    for (const part of targetParts) {
      const files = Array.isArray(part.files) ? part.files : [];
      const colorHex = typeof part.color === "string" ? part.color.trim() : "";
      for (const file of files) {
        const meshFile = String(file || "").trim();
        if (!meshFile) continue;
        visualCount += 1;
        const color = /^#[0-9a-fA-F]{6}$/.test(colorHex) ? colorHex : "#8ba3b0";
        const meshUri = encodeURI(`../raw/${meshFile}`);
        lines.push(`    <visual name="visual_${visualCount}">`);
        lines.push(`      <origin xyz="${formatVec3(visualOffsetMm, MM_TO_M)}" rpy="0 0 0"/>`);
        lines.push("      <geometry>");
        lines.push(`        <mesh filename="${escapeXml(meshUri)}" scale="0.001 0.001 0.001"/>`);
        lines.push("      </geometry>");
        lines.push(`      <material name="mat_${escapeXml(target)}_${visualCount}">`);
        lines.push(`        <color rgba="${hexToRgba(color)}"/>`);
        lines.push("      </material>");
        lines.push("    </visual>");
      }
    }
    lines.push("  </link>");
    lines.push("");
  }

  const jointTargets = CHAIN_TARGETS.filter((target) => target !== "base");
  for (let idx = 0; idx < jointTargets.length; idx += 1) {
    const childTarget = jointTargets[idx];
    const jointCfg = jointByTarget.get(childTarget) || {};
    const parentTargetRaw = String(
      jointCfg.parentTarget || defaultParentTargetForTarget(childTarget)
    ).trim().toLowerCase();
    const parentTarget = CHAIN_TARGETS.includes(parentTargetRaw)
      ? parentTargetRaw
      : defaultParentTargetForTarget(childTarget);

    const parentLink = `link_${parentTarget}`;
    const childLink = `link_${childTarget}`;
    const jointName = String(jointCfg.name || `J${idx + 1}`).trim() || `J${idx + 1}`;
    const axis = axisVector(jointCfg.axis);
    const parentFrame = framePivotMm[parentTarget] || [0, 0, 0];
    const childFrame = framePivotMm[childTarget] || [0, 0, 0];
    const jointOriginMm = subVec3(childFrame, parentFrame);

    const minRad = degToRad(jointCfg.minDeg);
    const maxRad = degToRad(jointCfg.maxDeg);
    const lower = Math.min(minRad, maxRad);
    const upper = Math.max(minRad, maxRad);

    lines.push(`  <joint name="${escapeXml(jointName)}" type="revolute">`);
    lines.push(`    <parent link="${escapeXml(parentLink)}"/>`);
    lines.push(`    <child link="${escapeXml(childLink)}"/>`);
    lines.push(`    <origin xyz="${formatVec3(jointOriginMm, MM_TO_M)}" rpy="0 0 0"/>`);
    lines.push(`    <axis xyz="${formatVec3(axis, 1)}"/>`);
    lines.push(`    <limit lower="${lower.toFixed(6)}" upper="${upper.toFixed(6)}" effort="10.0" velocity="3.0"/>`);
    lines.push("  </joint>");
    lines.push("");
  }

  lines.push("</robot>");
  lines.push("");
  return lines.join("\n");
}

function hexToRgba(hex) {
  const c = String(hex || "").replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(c)) return "0.55 0.65 0.72 1.0";
  const r = parseInt(c.slice(0, 2), 16) / 255;
  const g = parseInt(c.slice(2, 4), 16) / 255;
  const b = parseInt(c.slice(4, 6), 16) / 255;
  return `${r.toFixed(4)} ${g.toFixed(4)} ${b.toFixed(4)} 1.0`;
}

function main() {
  const projectWebRoot = path.resolve(__dirname, "..");
  const jointsPath = path.join(projectWebRoot, "joints.json");
  const manifestPath = path.join(projectWebRoot, "urdf", "sldasm_manifest.json");
  const outDir = path.join(projectWebRoot, "urdf");
  const outPath = path.join(outDir, "arm_from_joints.urdf");

  const config = readJson(jointsPath);
  const manifest = fs.existsSync(manifestPath) ? readJson(manifestPath) : null;
  const urdfText = buildUrdf(config, manifest);

  ensureDir(outDir);
  fs.writeFileSync(outPath, urdfText, "utf8");

  console.log(`URDF generated: ${outPath}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`Failed to generate URDF: ${String(error)}`);
    process.exit(1);
  }
}
