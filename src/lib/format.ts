export function fmtDate(date: string | Date | null): string {
  if (date == null) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function fmtCurrency(amount: number | null): string {
  if (amount == null) return "—";
  return "₹" + amount.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

export function fmtPct(value: number | null, decimals = 1): string {
  if (value == null) return "—";
  return value.toFixed(decimals) + "%";
}

export function timeAgo(date: string | Date): string {
  const now = Date.now();
  const then = typeof date === "string" ? new Date(date).getTime() : date.getTime();
  const diffMs = now - then;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(months / 12);
  return `${years}y ago`;
}

export function fmtNumber(value: number | null): string {
  if (value == null) return "—";
  return value.toLocaleString("en-IN");
}
