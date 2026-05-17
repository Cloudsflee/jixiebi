export function createGatewayBridge({ getWs, log }) {
  let gatewayRequestSeq = 0;
  const pendingGatewayRequests = new Map();

  function isWsOpen() {
    const ws = typeof getWs === "function" ? getWs() : null;
    return !!ws && ws.readyState === WebSocket.OPEN;
  }

  function send(payload, silentWhenClosed = false) {
    const ws = typeof getWs === "function" ? getWs() : null;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      if (!silentWhenClosed && typeof log === "function") {
        log("WS not connected, send skipped", payload);
      }
      return false;
    }

    ws.send(JSON.stringify(payload));
    return true;
  }

  function nextGatewayRequestId(prefix = "req") {
    gatewayRequestSeq += 1;
    return `${prefix}_${Date.now()}_${gatewayRequestSeq}`;
  }

  function clearPendingGatewayRequests(reason = "gateway request canceled") {
    pendingGatewayRequests.forEach((item) => {
      clearTimeout(item.timer);
      item.reject(new Error(reason));
    });
    pendingGatewayRequests.clear();
  }

  function consumeGatewayRequestReply(msg) {
    const requestId = String(msg?.requestId || "");
    if (!requestId) return false;

    const pending = pendingGatewayRequests.get(requestId);
    if (!pending) return false;

    clearTimeout(pending.timer);
    pendingGatewayRequests.delete(requestId);
    pending.resolve(msg);
    return true;
  }

  function sendGatewayRequest(type, payload = {}, timeoutMs = 5000) {
    if (!isWsOpen()) {
      return Promise.reject(new Error("WebSocket not connected"));
    }

    const requestId = nextGatewayRequestId(type);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingGatewayRequests.delete(requestId);
        reject(new Error(`${type} timeout`));
      }, Math.max(600, timeoutMs));

      pendingGatewayRequests.set(requestId, { resolve, reject, timer });

      const ok = send({ type, requestId, ...payload }, true);
      if (!ok) {
        clearTimeout(timer);
        pendingGatewayRequests.delete(requestId);
        reject(new Error("WebSocket send failed"));
      }
    });
  }

  return {
    isWsOpen,
    send,
    clearPendingGatewayRequests,
    consumeGatewayRequestReply,
    sendGatewayRequest
  };
}
