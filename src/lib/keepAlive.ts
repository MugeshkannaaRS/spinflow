const PING_INTERVAL = 90 * 1000;
const PING_URL = "https://spinflow.onrender.com/api/health";

function ping() {
  fetch(PING_URL, { method: "GET", cache: "no-store" }).catch(() => {});
}

export function startKeepAlive() {
  ping();
  const intervalId = setInterval(ping, PING_INTERVAL);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) ping();
  });

  return intervalId;
}

export function stopKeepAlive(intervalId: ReturnType<typeof setInterval>) {
  clearInterval(intervalId);
}
