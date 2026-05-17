export async function writeJointConfigAction({
  selectedOnly = false,
  hasSelectedJoint = false,
  collectWriteTargetStates,
  isWsOpen,
  readJointConfigViaGateway,
  writeJointConfigViaGateway,
  buildRuntimeJointConfig,
  cloneConfig,
  applyMotionLocksFromConfig,
  supportsFileSystemAccess,
  ensureJointConfigFileHandle,
  readJointConfigFromFileHandle,
  writeConfigToFileOrDownload,
  getJointConfigFileHandle,
  setJointConfigFileHandle,
  loadedJointConfig,
  fallbackConfig,
  setLoadedJointConfig,
  log
}) {
  if (selectedOnly && !hasSelectedJoint) {
    log("No selected joint for write operation.");
    return;
  }

  try {
    const targetStates = collectWriteTargetStates({ selectedOnly });

    if (isWsOpen()) {
      try {
        const gatewayConfig = await readJointConfigViaGateway();
        const config = buildRuntimeJointConfig({
          selectedOnly,
          baseConfig: gatewayConfig,
          targetStates
        });
        await writeJointConfigViaGateway(config);
        setLoadedJointConfig(cloneConfig(config));
        applyMotionLocksFromConfig(config);
        log(
          selectedOnly
            ? "Selected joint written to joints.json (gateway direct write)."
            : "All joints written to joints.json (gateway direct write)."
        );
        return;
      } catch (gatewayError) {
        log("Gateway direct write failed, fallback to browser file write.", { error: String(gatewayError) });
      }
    }

    const handle = supportsFileSystemAccess()
      ? await ensureJointConfigFileHandle({ promptIfMissing: true })
      : null;
    const activeHandle = handle || getJointConfigFileHandle();
    if (handle) {
      setJointConfigFileHandle(handle);
    }

    const fileConfig = await readJointConfigFromFileHandle(activeHandle);
    const config = buildRuntimeJointConfig({
      selectedOnly,
      baseConfig: fileConfig || loadedJointConfig || fallbackConfig,
      targetStates
    });
    const result = await writeConfigToFileOrDownload(config, {
      preferFileName: "joints.json",
      fileHandle: activeHandle,
      promptForFileHandle: false
    });
    setLoadedJointConfig(cloneConfig(config));
    applyMotionLocksFromConfig(config);

    if (result.method === "file") {
      log(selectedOnly ? "Selected joint written to joints.json" : "All joints written to joints.json");
    } else {
      log("Direct file write unavailable, exported as joints.json download.");
    }
  } catch (error) {
    log("Write joints.json failed", { error: String(error) });
  }
}
