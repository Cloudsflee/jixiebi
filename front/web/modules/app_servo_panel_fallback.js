export function buildServoPanelFallback({ servoPanel, renderServoPanelSafely, jointStates, error }) {
  if (!servoPanel) return;
  servoPanel.innerHTML = "";

  const section = document.createElement("section");
  section.className = "panel-section";

  const title = document.createElement("h3");
  title.className = "panel-section-title";
  title.textContent = "Debug Panel Load Failed";
  const hint = document.createElement("p");
  hint.className = "panel-section-hint";
  hint.textContent = "Please refresh. If it still fails, check logs and report errors.";

  const retryBtn = document.createElement("button");
  retryBtn.textContent = "Reload Debug Panel";
  retryBtn.addEventListener("click", () => {
    renderServoPanelSafely(jointStates);
  });

  const detail = document.createElement("pre");
  detail.className = "demo-readout";
  detail.textContent = `Error Details: ${String(error || "unknown error")}`;
  section.append(title, hint, retryBtn, detail);
  servoPanel.append(section);
}
