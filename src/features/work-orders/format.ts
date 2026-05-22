// Shared date helpers live in `src/lib/date`. Re-exported here so existing
// imports from '../work-orders/format' resolve unchanged. Prefer importing
// from `src/lib/date` directly in new code.
export {
    EN_GB_LOCAL_DATE_OPTIONS,
    EN_GB_LOCAL_DATE_TIME_OPTIONS,
    EN_GB_UTC_DATE_OPTIONS,
    EN_GB_UTC_DATE_TIME_OPTIONS,
    getDefaultDateFrom,
    toLocalDatetime,
} from '../../lib/date'
