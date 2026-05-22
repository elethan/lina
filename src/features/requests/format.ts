import type { MachineClinicalStatus } from './types'

// Shared date helpers live in `src/lib/date`. Re-exported here so existing
// imports from '../requests/format' resolve unchanged. Prefer importing from
// `src/lib/date` directly in new code.
export {
    EN_GB_LOCAL_DATE_TIME_OPTIONS,
    EN_GB_UTC_DATE_TIME_OPTIONS,
    formatDateTimeForDisplay,
    getDefaultDateFrom,
    hasValidTimestamp,
} from '../../lib/date'

export const parseOptionalNumber = (value: unknown): number | undefined => {
    if (value === undefined || value === null || value === '') return undefined
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
}

export const normalizeMachineClinicalStatus = (
    status: string | null | undefined,
): MachineClinicalStatus => {
    if (!status) return 'Clinical'
    return status.toLowerCase() === 'down' ? 'Down' : 'Clinical'
}
