import type { PmRow } from '../../data/pm.api'

// Shared date helpers live in `src/lib/date`. Re-exported here so existing
// imports from '../pm/format' resolve unchanged.
export { getDefaultDateFromMonthsAgo } from '../../lib/date'

/**
 * PM-specific: convert a value to YYYY-MM-DD using UTC components (so the
 * displayed date matches the stored ISO date regardless of viewer timezone).
 * Other features may use a local-time variant — keep this one PM-scoped.
 */
export function toDateInputValue(value: string | Date): string {
    const date = typeof value === 'string' ? new Date(value) : value
    if (Number.isNaN(date.getTime())) return ''

    const year = date.getUTCFullYear()
    const month = String(date.getUTCMonth() + 1).padStart(2, '0')
    const day = String(date.getUTCDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

export function getSuggestedStartDate(source: PmRow | null): string {
    if (!source?.startAt || !source.intervalMonths) {
        return ''
    }

    const base = new Date(source.startAt)
    if (Number.isNaN(base.getTime())) {
        return ''
    }

    base.setUTCMonth(base.getUTCMonth() + source.intervalMonths)
    return toDateInputValue(base)
}
