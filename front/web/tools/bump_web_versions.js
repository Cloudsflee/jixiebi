"use strict";

const fs = require("fs");
const path = require("path");

function pad2(n) {
  return String(n).padStart(2, "0");
}

function makeStamp(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = pad2(date.getUTCMonth() + 1);
  const d = pad2(date.getUTCDate());
  const hh = pad2(date.getUTCHours());
  const mm = pad2(date.getUTCMinutes());
  const ss = pad2(date.getUTCSeconds());
  return `${y}${m}${d}-${hh}${mm}${ss}`;
}

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function write(filePath, content) {
  fs.writeFileSync(filePath, content, "utf8");
}

function replaceWithCheck(content, regex, replacer, label, filePath) {
  if (!regex.test(content)) {
    throw new Error(`Pattern not found for ${label} in ${filePath}`);
  }
  return content.replace(regex, replacer);
}

function updateFrontIndex(filePath, stamp) {
  let content = read(filePath);
  content = replaceWithCheck(
    content,
    /(<link\s+rel="stylesheet"\s+href="\.\/styles\.css\?v=)[^"]+("\s*\/>)/,
    `$1${stamp}$2`,
    "front index css version",
    filePath
  );
  content = replaceWithCheck(
    content,
    /(check \/web\/app\.js\?v=)[^"]+"/,
    `$1${stamp}"`,
    "front index fallback message version",
    filePath
  );
  content = replaceWithCheck(
    content,
    /(s\.src\s*=\s*"\.\/app\.js\?v=)[^"]+(";\s*)/,
    `$1${stamp}$2`,
    "front index app module version",
    filePath
  );
  write(filePath, content);
}

function updateFrontApp(filePath, stamp) {
  let content = read(filePath);
  content = replaceWithCheck(
    content,
    /(from "\.\/vendor\/three\/three\.module\.js\?v=)[^"]+(";\s*)/,
    `$1${stamp}$2`,
    "front app three.module import version",
    filePath
  );
  content = replaceWithCheck(
    content,
    /(from "\.\/vendor\/three\/jsm\/controls\/OrbitControls\.js\?v=)[^"]+(";\s*)/,
    `$1${stamp}$2`,
    "front app OrbitControls import version",
    filePath
  );
  content = replaceWithCheck(
    content,
    /(from "\.\/vendor\/three\/jsm\/loaders\/STLLoader\.js\?v=)[^"]+(";\s*)/,
    `$1${stamp}$2`,
    "front app STLLoader import version",
    filePath
  );
  content = replaceWithCheck(
    content,
    /(from "\.\/modules\/demo_kinematics\.js\?v=)[^"]+(";\s*)/,
    `$1${stamp}$2`,
    "front app demo_kinematics import version",
    filePath
  );
  content = replaceWithCheck(
    content,
    /(from "\.\/modules\/demo_fea\.js\?v=)[^"]+(";\s*)/,
    `$1${stamp}$2`,
    "front app demo_fea import version",
    filePath
  );
  content = replaceWithCheck(
    content,
    /(window\.__APP_MODULE_STAMP__\s*=\s*")[^"]+(";\s*)/,
    `$1${stamp}$2`,
    "front app module stamp",
    filePath
  );
  content = replaceWithCheck(
    content,
    /(const UI_BUILD_STAMP = ")[^"]+(";\s*)/,
    `$1${stamp}$2`,
    "front app build stamp",
    filePath
  );
  write(filePath, content);
}

function updateTeachIndex(filePath, stamp) {
  let content = read(filePath);
  content = replaceWithCheck(
    content,
    /(<link\s+rel="stylesheet"\s+href="\.\/styles\.css\?v=)[^"]+("\s*\/>)/,
    `$1${stamp}$2`,
    "teach index css version",
    filePath
  );
  content = replaceWithCheck(
    content,
    /(<script\s+type="module"\s+src="\.\/app\.js\?v=)[^"]+("\s*><\/script>)/,
    `$1${stamp}$2`,
    "teach index app module version",
    filePath
  );
  write(filePath, content);
}

function updateTeachApp(filePath, stamp) {
  let content = read(filePath);
  content = replaceWithCheck(
    content,
    /(const url = `\.\/joints\.json\?v=)[^`]+(`;)/,
    `$1${stamp}$2`,
    "teach app joints fetch version",
    filePath
  );
  write(filePath, content);
}

function run() {
  const projectRoot = path.resolve(__dirname, "..", "..", "..");
  const stamp = makeStamp();

  const files = {
    frontIndex: path.join(projectRoot, "front", "web", "index.html"),
    frontApp: path.join(projectRoot, "front", "web", "app.js"),
    teachIndex: path.join(projectRoot, "teach_front", "web", "index.html"),
    teachApp: path.join(projectRoot, "teach_front", "web", "app.js")
  };

  updateFrontIndex(files.frontIndex, stamp);
  updateFrontApp(files.frontApp, stamp);
  updateTeachIndex(files.teachIndex, stamp);
  updateTeachApp(files.teachApp, stamp);

  console.log("Web version bump completed.");
  console.log(`- stamp: ${stamp}`);
  Object.entries(files).forEach(([key, filePath]) => {
    console.log(`- updated ${key}: ${filePath}`);
  });
}

if (require.main === module) {
  try {
    run();
  } catch (error) {
    console.error(`bump_web_versions failed: ${String(error?.stack || error)}`);
    process.exit(1);
  }
}

