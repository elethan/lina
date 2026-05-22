export function toYmd(value: string | null): string {
    if (!value) return '—'

    const ymd = value.match(/^(\d{4}-\d{2}-\d{2})/)
    if (ymd) return ymd[1]

    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return value
    return parsed.toISOString().slice(0, 10)
}

export function toDateInputValue(value: string | null): string {
    if (!value) return ''
    return toYmd(value)
}

export function statusBadge(status: string) {
    const normalized = status.trim().toLowerCase()

    if (normalized === 'de-commissioned' || normalized === 'decommissioned') {
        return 'inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 border border-gray-200'
    }

    if (normalized === 'down') {
        return 'inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200'
    }

    // Treat Clinical and legacy Operational as healthy status.
    return 'inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200'
}
