"use strict";

const fs = require("fs");
const path = require("path");

function listFiles(dirPath, extList) {
  if (!fs.existsSync(dirPath)) return [];
  const items = fs.readdirSync(dirPath, { withFileTypes: true });
  const out = [];
  for (const item of items) {
    if (item.isDirectory()) continue;
    const ext = path.extname(item.name).toLowerCase();
    if (!extList.includes(ext)) continue;
    out.push(item.name);
  }
  return out.sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function normalizeName(name) {
  let s = String(name || "");
  s = s.replace(/\.[^.]+$/, "");
  s = s.replace(/^装配体（整体）4\s*-\s*/i, "");
  s = s.replace(/-1$/i, "");
  s = s.replace(/[_\s()（）\[\]【】\-]/g, "");
  return s.toLowerCase();
}

function scoreMatch(partNorm, stlNorm) {
  if (!partNorm || !stlNorm) return 0;
  if (partNorm === stlNorm) return 100;
  if (stlNorm.startsWith(partNorm)) return 90;
  if (partNorm.startsWith(stlNorm)) return 80;
  if (stlNorm.includes(partNorm)) return 70;
  if (partNorm.includes(stlNorm)) return 60;
  return 0;
}

function buildManifest({ packDir, rawDir }) {
  const sldasmFiles = listFiles(packDir, [".sldasm"]);
  const sldprtFiles = listFiles(packDir, [".sldprt"]);
  const rawStlFiles = listFiles(rawDir, [".stl"]);

  const stlCatalog = rawStlFiles.map((name) => ({
    name,
    normalized: normalizeName(name)
  }));

  const partMappings = sldprtFiles.map((partName) => {
    const partNorm = normalizeName(partName);
    const candidates = stlCatalog
      .map((stl) => ({
        stl: stl.name,
        score: scoreMatch(partNorm, stl.normalized)
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.stl.localeCompare(b.stl, "zh-CN"));

    const bestScore = candidates.length > 0 ? candidates[0].score : 0;
    const bestMatches = candidates.filter((item) => item.score === bestScore).map((item) => item.stl);
    return {
      part: partName,
      normalized: partNorm,
      bestScore,
      stlCandidates: candidates.map((c) => c.stl),
      bestMatches
    };
  });

  const matchedStlSet = new Set();
  for (const row of partMappings) {
    for (const m of row.bestMatches) matchedStlSet.add(m);
  }

  const unmatchedSldprt = partMappings.filter((row) => row.bestScore <= 0).map((row) => row.part);
  const unmatchedRawStl = rawStlFiles.filter((stl) => !matchedStlSet.has(stl));

  return {
    generatedAt: new Date().toISOString(),
    source: {
      packDir,
      rawDir
    },
    summary: {
      sldasmCount: sldasmFiles.length,
      sldprtCount: sldprtFiles.length,
      rawStlCount: rawStlFiles.length,
      unmatchedSldprtCount: unmatchedSldprt.length,
      unmatchedRawStlCount: unmatchedRawStl.length
    },
    sldasmFiles,
    sldprtFiles,
    partMappings,
    unmatchedSldprt,
    unmatchedRawStl
  };
}

function toMarkdown(manifest) {
  const lines = [];
  lines.push("# SLDASM Pack Manifest");
  lines.push("");
  lines.push(`- Generated At: ${manifest.generatedAt}`);
  lines.push(`- Pack Dir: \`${manifest.source.packDir}\``);
  lines.push(`- Raw Dir: \`${manifest.source.rawDir}\``);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- SLDASM: ${manifest.summary.sldasmCount}`);
  lines.push(`- SLDPRT: ${manifest.summary.sldprtCount}`);
  lines.push(`- Raw STL: ${manifest.summary.rawStlCount}`);
  lines.push(`- Unmatched SLDPRT: ${manifest.summary.unmatchedSldprtCount}`);
  lines.push(`- Unmatched Raw STL: ${manifest.summary.unmatchedRawStlCount}`);
  lines.push("");
  lines.push("## Assemblies");
  lines.push("");
  for (const name of manifest.sldasmFiles) {
    lines.push(`- ${name}`);
  }
  lines.push("");
  lines.push("## Part to STL Mapping (Best Match)");
  lines.push("");
  for (const row of manifest.partMappings) {
    const best = row.bestMatches.length > 0 ? row.bestMatches.join(", ") : "(none)";
    lines.push(`- ${row.part} -> ${best} [score=${row.bestScore}]`);
  }
  lines.push("");
  if (manifest.unmatchedSldprt.length > 0) {
    lines.push("## Unmatched SLDPRT");
    lines.push("");
    for (const name of manifest.unmatchedSldprt) {
      lines.push(`- ${name}`);
    }
    lines.push("");
  }
  if (manifest.unmatchedRawStl.length > 0) {
    lines.push("## Unmatched Raw STL");
    lines.push("");
    for (const name of manifest.unmatchedRawStl) {
      lines.push(`- ${name}`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function main() {
  const webRoot = path.resolve(__dirname, "..");
  const workspaceRoot = path.resolve(webRoot, "..", "..");
  const packDir = path.join(workspaceRoot, "temp", "sldasm_pack");
  const rawDir = path.join(webRoot, "raw");
  const outDir = path.join(webRoot, "urdf");

  if (!fs.existsSync(packDir)) {
    throw new Error(`Pack dir not found: ${packDir}`);
  }

  const manifest = buildManifest({ packDir, rawDir });
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const jsonPath = path.join(outDir, "sldasm_manifest.json");
  const mdPath = path.join(outDir, "sldasm_manifest.md");

  fs.writeFileSync(jsonPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  fs.writeFileSync(mdPath, toMarkdown(manifest), "utf8");

  console.log(`Manifest generated: ${jsonPath}`);
  console.log(`Manifest report: ${mdPath}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`Failed to build SLDASM manifest: ${String(error)}`);
    process.exit(1);
  }
}
