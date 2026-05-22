/**
 * Shared date helpers used across feature modules.
 *
 * Domain date columns in the database are stored as ISO 8601 strings in SQLite
 * TEXT columns (see ARCHITECTURE.md §"Date Handling Convention").
 *
 * Display formatting standardised on en-GB with `month: 'short'` so dates
 * render as e.g. `22 May 2026 08:30` (UTC) or `22 May 2026 09:30` (local).
 */

export const EN_GB_UTC_DATE_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
}

export const EN_GB_LOCAL_DATE_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
}

export const EN_GB_UTC_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
}

export const EN_GB_LOCAL_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
}

/** Returns an ISO YYYY-MM-DD string for `monthsAgo` months before today. */
export function getDefaultDateFromMonthsAgo(monthsAgo: number): string {
    const date = new Date()
    date.setMonth(date.getMonth() - monthsAgo)
    return date.toISOString().slice(0, 10)
}

/** Convenience: 6 months ago as YYYY-MM-DD. Used as a default `dateFrom`. */
export const getDefaultDateFrom = (): string => getDefaultDateFromMonthsAgo(6)

/**
 * Convert an ISO timestamp to the value format expected by
 * `<input type="datetime-local">` (uses local time, no timezone suffix).
 */
export function toLocalDatetime(iso: string): string {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** True iff `value` parses to a valid Date. */
export const hasValidTimestamp = (value: string | null | undefined): boolean => {
    if (!value) return false
    return !Number.isNaN(new Date(value).getTime())
}

/**
 * Format an ISO timestamp for table display. SSR renders the UTC variant; the
 * client swaps to the local-time variant once hydrated to avoid hydration
 * mismatches.
 */
export const formatDateTimeForDisplay = (
    value: string | null | undefined,
    isHydrated: boolean,
): string | null => {
    if (!value) return null
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return null
    return parsed.toLocaleString(
        'en-GB',
        isHydrated ? EN_GB_LOCAL_DATE_TIME_OPTIONS : EN_GB_UTC_DATE_TIME_OPTIONS,
    )
}
