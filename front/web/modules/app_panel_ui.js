export function createNumberInput(value, min, max, step = 1) {
  const input = document.createElement("input");
  input.type = "number";
  input.value = String(value);
  input.step = String(step);
  if (min !== null && min !== undefined) input.min = String(min);
  if (max !== null && max !== undefined) input.max = String(max);
  return input;
}

export function createSelectInput(options, value) {
  const select = document.createElement("select");
  for (const opt of options) {
    const option = document.createElement("option");
    option.value = opt.value;
    option.textContent = opt.label;
    if (opt.value === value) option.selected = true;
    select.appendChild(option);
  }
  return select;
}

export function createControlField(labelText, inputEl) {
  const field = document.createElement("label");
  field.className = "control-field";

  const label = document.createElement("span");
  label.className = "field-label";
  label.textContent = labelText;

  field.append(label, inputEl);
  return field;
}

export function setControlFieldLabels(container, labels = []) {
  if (!container || !Array.isArray(labels)) return;
  const fieldLabels = container.querySelectorAll(".control-field > .field-label");
  labels.forEach((labelText, idx) => {
    if (!fieldLabels[idx]) return;
    fieldLabels[idx].textContent = labelText;
  });
}

export function replaceMojibakeInDom(root) {
  if (!root || typeof root.querySelectorAll !== "function") return;
  const hardMap = new Map();

  const looksBad = (s) => {
    if (!s || typeof s !== "string") return false;
    if (s.includes("?")) return true;
    const tokens = ["?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?"];
    let hit = 0;
    for (const t of tokens) {
      if (s.includes(t)) hit += 1;
      if (hit >= 2) return true;
    }
    return false;
  };

  const fix = (s) => {
    if (typeof s !== "string" || !s) return s;
    let out = s;
    for (const [bad, good] of hardMap.entries()) {
      if (out.includes(bad)) out = out.split(bad).join(good);
    }
    if (!looksBad(out)) return out;

    if (/joints\.json/i.test(out)) return "joints.json ??";
    const ascii = out.replace(/[^\x20-\x7E]/g, " ").replace(/\s+/g, " ").trim();
    if (ascii.length >= 2) return ascii;

    return "??";
  };

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const v = node.nodeValue || "";
    const nv = fix(v);
    if (nv !== v) node.nodeValue = nv;
    node = walker.nextNode();
  }

  root.querySelectorAll("[title], [placeholder], [aria-label]").forEach((el) => {
    ["title", "placeholder", "aria-label"].forEach((attr) => {
      if (!el.hasAttribute(attr)) return;
      const oldVal = el.getAttribute(attr) || "";
      const newVal = fix(oldVal);
      if (newVal !== oldVal) el.setAttribute(attr, newVal);
    });
  });
}

export function createChip(text, extraClass = "") {
  const chip = document.createElement("span");
  chip.className = extraClass ? `chip ${extraClass}` : "chip";
  chip.textContent = text;
  return chip;
}

export function createPanelSection(titleText, hintText, contentList = [], options = {}) {
  const collapsible = options && options.collapsible === true;
  const section = collapsible ? document.createElement("details") : document.createElement("section");
  section.className = `panel-section${collapsible ? " is-collapsible" : ""}`;

  if (collapsible) {
    section.open = options.open !== false;
    const summary = document.createElement("summary");
    summary.className = "panel-section-title";
    summary.textContent = titleText;
    section.appendChild(summary);
  } else {
    const title = document.createElement("h3");
    title.className = "panel-section-title";
    title.textContent = titleText;
    section.appendChild(title);
  }

  if (hintText) {
    const hint = document.createElement("p");
    hint.className = "panel-section-hint";
    hint.textContent = hintText;
    section.appendChild(hint);
  }

  contentList.forEach((item) => {
    if (!item) return;
    section.appendChild(item);
  });

  return section;
}
