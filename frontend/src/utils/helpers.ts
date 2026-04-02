import { format, parseISO, isValid } from 'date-fns'

export function formatCurrency(amount?: number | null, currency = 'USD'): string {
  if (amount == null) return '—'
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

export function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '—'
  try {
    const d = parseISO(dateStr)
    if (isValid(d)) return format(d, 'MMM d, yyyy')
  } catch {}
  return dateStr
}

export function formatDateShort(dateStr?: string | null): string {
  if (!dateStr) return '—'
  try {
    const d = parseISO(dateStr)
    if (isValid(d)) return format(d, 'MMM yyyy')
  } catch {}
  return dateStr
}

export function confidenceColor(score?: number | null): string {
  if (!score) return '#6a6a88'
  if (score >= 0.85) return '#00d4aa'
  if (score >= 0.65) return '#c8f135'
  if (score >= 0.45) return '#fbbf24'
  return '#ff6b6b'
}

export function confidenceLabel(score?: number | null): string {
  if (!score) return 'Unknown'
  if (score >= 0.85) return 'High'
  if (score >= 0.65) return 'Medium'
  if (score >= 0.45) return 'Low'
  return 'Very Low'
}

export function statusBadgeClass(status: string): string {
  switch (status) {
    case 'done': return 'badge-green'
    case 'processing': return 'badge-blue'
    case 'pending': return 'badge-yellow'
    case 'error': return 'badge-red'
    default: return 'badge'
  }
}

export function truncate(str?: string | null, len = 30): string {
  if (!str) return '—'
  return str.length > len ? str.slice(0, len) + '…' : str
}

export function formatFileSize(bytes?: number | null): string {
  if (!bytes) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let size = bytes
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024
    i++
  }
  return `${size.toFixed(1)} ${units[i]}`
}

export function currencySymbol(code?: string | null): string {
  const map: Record<string, string> = {
    USD: '$', EUR: '€', GBP: '£', INR: '₹', JPY: '¥',
    CAD: 'CA$', AUD: 'A$', SGD: 'S$', AED: 'AED',
  }
  return map[code || 'USD'] || (code || '$')
}
