export function createPollingController({
  stopPositionPolling,
  setPollCursor,
  isWsOpen,
  getJointStatesLength,
  buildPollIdList,
  setPollTimer,
  getPollCursor,
  sendQueryById,
  send,
  getPositionPollIntervalMs,
  getPollTimer
}) {
  const startPositionPolling = () => {
    stopPositionPolling();
    setPollCursor(0);

    const timer = setInterval(() => {
      if (!isWsOpen() || getJointStatesLength() === 0) return;

      const pollIds = buildPollIdList();
      if (pollIds.length === 0) return;

      const cursor = getPollCursor();
      const id = pollIds[cursor % pollIds.length];
      setPollCursor(cursor + 1);
      sendQueryById(id, true);

      const nextCursor = getPollCursor();
      if (nextCursor % (Math.max(1, pollIds.length) * 6) === 0) {
        send({ type: "vin", id: pollIds[0] }, true);
        send({ type: "temp", id: pollIds[0] }, true);
      }
    }, getPositionPollIntervalMs());
    setPollTimer(timer);
  };

  const stopPolling = () => {
    const timer = getPollTimer();
    if (timer) {
      clearInterval(timer);
      setPollTimer(null);
    }
  };

  const restartPositionPolling = () => {
    if (isWsOpen()) {
      startPositionPolling();
    }
  };

  return {
    startPositionPolling,
    stopPositionPolling: stopPolling,
    restartPositionPolling
  };
}
