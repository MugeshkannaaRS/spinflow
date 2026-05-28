export const fmtNumber = (n: unknown, decimals = 0): string => {
  const num = Number(n ?? 0)
  if (isNaN(num)) return '0'
  return num.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

export const fmtCurrency = (n: unknown): string => {
  const num = Number(n ?? 0)
  if (isNaN(num)) return '₹0'
  if (num >= 10000000) return `₹${fmtNumber(num / 10000000, 2)} Cr`
  if (num >= 100000) return `₹${fmtNumber(num / 100000, 2)} L`
  return `₹${fmtNumber(num)}`
}

export const fmtPercent = (n: unknown): string => {
  return `${fmtNumber(n, 1)}%`
}
