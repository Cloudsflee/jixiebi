export function buildAutoPresetName() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `preset-${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

export function normalizePresetName(name) {
  const text = String(name || "").trim();
  if (!text) return "";
  return text.replace(/\s+/g, " ").slice(0, 48);
}

export function readPresetList(storageKey, schemaVersion, { storage = localStorage, onError = null } = {}) {
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item) => item && typeof item === "object" && typeof item.name === "string")
      .map((item) => ({
        version: Number(item.version || schemaVersion),
        name: normalizePresetName(item.name),
        updatedAt: String(item.updatedAt || ""),
        global: item.global && typeof item.global === "object" ? item.global : {},
        joints: Array.isArray(item.joints) ? item.joints : []
      }))
      .filter((item) => item.name);
  } catch {
    if (typeof onError === "function") onError("Failed to read preset storage, reset to empty.");
    return [];
  }
}

export function writePresetList(storageKey, list, { storage = localStorage, onError = null } = {}) {
  try {
    storage.setItem(storageKey, JSON.stringify(list));
    return true;
  } catch (error) {
    if (typeof onError === "function") {
      onError("Preset save failed", { error: String(error) });
    }
    return false;
  }
}

export function serializeConfig(config) {
  return `${JSON.stringify(config, null, 2)}\n`;
}

export function downloadConfigFile(text, fileName = "joints.json") {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function supportsFileSystemAccess() {
  return typeof window !== "undefined" && typeof window.showOpenFilePicker === "function";
}

export async function readJointConfigFromFileHandle(handle, { onError = null } = {}) {
  if (!handle) return null;

  try {
    const file = await handle.getFile();
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.joints)) {
      throw new Error("bound joints.json missing joints[]");
    }
    return parsed;
  } catch (error) {
    if (typeof onError === "function") {
      onError("Read bound joints.json failed, fallback to runtime cache.", { error: String(error) });
    }
    return null;
  }
}

export async function writeConfigToFileOrDownload(
  config,
  {
    preferFileName = "joints.json",
    fileHandle = null,
    promptForFileHandle = true,
    ensureFileHandle = null
  } = {}
) {
  const text = serializeConfig(config);

  if (supportsFileSystemAccess() && typeof ensureFileHandle === "function") {
    const handle = fileHandle || await ensureFileHandle({ promptIfMissing: promptForFileHandle });
    if (handle) {
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
      return { method: "file" };
    }
  }

  downloadConfigFile(text, preferFileName);
  return { method: "download" };
}
