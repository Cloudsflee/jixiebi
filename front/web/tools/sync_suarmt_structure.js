"use strict";

const fs = require("fs");
const path = require("path");

const COPY_DIRS = ["config", "launch", "meshes", "urdf"];
const COPY_FILES = [
  "CMakeLists.txt",
  "package.xml",
  "export.log",
  "SuArmT_URDF_人工修正清单(1).md"
];

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function copyFile(src, dst) {
  ensureDir(path.dirname(dst));
  fs.copyFileSync(src, dst);
}

function copyDirRecursive(srcDir, dstDir, counter) {
  ensureDir(dstDir);
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const src = path.join(srcDir, entry.name);
    const dst = path.join(dstDir, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(src, dst, counter);
    } else if (entry.isFile()) {
      copyFile(src, dst);
      counter.files += 1;
    }
  }
}

function syncOneTarget(sourceRoot, targetRoot) {
  const copied = { files: 0 };
  ensureDir(targetRoot);

  COPY_DIRS.forEach((dirName) => {
    const src = path.join(sourceRoot, dirName);
    if (!fs.existsSync(src)) return;
    const dst = path.join(targetRoot, dirName);
    copyDirRecursive(src, dst, copied);
  });

  COPY_FILES.forEach((fileName) => {
    const src = path.join(sourceRoot, fileName);
    if (!fs.existsSync(src)) return;
    const dst = path.join(targetRoot, fileName);
    copyFile(src, dst);
    copied.files += 1;
  });

  const manifest = {
    syncedAt: new Date().toISOString(),
    source: sourceRoot,
    copiedDirs: COPY_DIRS,
    copiedFiles: COPY_FILES,
    copiedFileCount: copied.files
  };
  fs.writeFileSync(path.join(targetRoot, "sync_manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

function run() {
  const projectRoot = path.resolve(__dirname, "..", "..", "..");
  const sourceRoot = path.join(projectRoot, "SuArmT");
  const frontTarget = path.join(projectRoot, "front", "web", "suarmt");
  const teachTarget = path.join(projectRoot, "teach_front", "web", "suarmt");

  if (!fs.existsSync(sourceRoot)) {
    throw new Error(`SuArmT source folder not found: ${sourceRoot}`);
  }

  const frontManifest = syncOneTarget(sourceRoot, frontTarget);
  const teachManifest = syncOneTarget(sourceRoot, teachTarget);

  console.log("SuArmT structure sync completed.");
  console.log(`- source: ${sourceRoot}`);
  console.log(`- front target: ${frontTarget} (files=${frontManifest.copiedFileCount})`);
  console.log(`- teach target: ${teachTarget} (files=${teachManifest.copiedFileCount})`);
}

if (require.main === module) {
  try {
    run();
  } catch (error) {
    console.error(`sync_suarmt_structure failed: ${String(error?.stack || error)}`);
    process.exit(1);
  }
}

