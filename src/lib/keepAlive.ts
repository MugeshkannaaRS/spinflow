const PING_INTERVAL = 2 * 60 * 1000

export function startKeepAlive() {
  const base = import.meta.env.VITE_API_BASE_URL || "https://spinflow.onrender.com"

  const ping = async () => {
    try {
      await fetch(`${base}/api/health`, { method: "GET", cache: "no-store" })
    } catch {
      // silent — don't surface keep-alive errors to user
    }
  }

  ping()
  return setInterval(ping, PING_INTERVAL)
}

export function stopKeepAlive(intervalId: ReturnType<typeof setInterval>) {
  clearInterval(intervalId)
}
