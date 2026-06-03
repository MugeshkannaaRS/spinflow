// ─── Core number formatters ────────────────────────────────────────────────────

/** Indian-locale number, e.g. 1,23,456 */
export const fmtNumber = (n: unknown, decimals = 0): string => {
  const num = Number(n ?? 0)
  if (isNaN(num)) return '0'
  return num.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

/** Alias used in dashboard: fmt(1234) → "1,234" */
export const fmt = fmtNumber

/** ₹ with Cr / L abbreviation for large numbers */
export const fmtCurrency = (n: unknown): string => {
  const num = Number(n ?? 0)
  if (isNaN(num)) return '₹0'
  if (num >= 10000000) return `₹${fmtNumber(num / 10000000, 2)} Cr`
  if (num >= 100000)   return `₹${fmtNumber(num / 100000, 2)} L`
  return `₹${fmtNumber(num)}`
}

/** 1 decimal percent, e.g. "4.2%" */
export const fmtPercent = (n: unknown): string => `${fmtNumber(n, 1)}%`

/** Alias */
export const fmtPct = (n: unknown, decimals = 1): string =>
  `${Number(n ?? 0).toFixed(decimals)}%`

/** "02 Jun 2025" */
export const fmtDate = (d: string | Date | null | undefined): string => {
  if (!d) return '—'
  const dt = typeof d === 'string' ? new Date(d) : d
  if (isNaN(dt.getTime())) return String(d)
  return dt.toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

/** "02 Jun 2025, 14:30" */
export const fmtDateTime = (d: string | Date | null | undefined): string => {
  if (!d) return '—'
  const dt = typeof d === 'string' ? new Date(d) : d
  if (isNaN(dt.getTime())) return String(d)
  return dt.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}
