import { useEffect, useState } from 'react'
import {
    EN_GB_LOCAL_DATE_OPTIONS,
    EN_GB_LOCAL_DATE_TIME_OPTIONS,
    EN_GB_UTC_DATE_OPTIONS,
    EN_GB_UTC_DATE_TIME_OPTIONS,
} from '../lib/date'

/**
 * Renders an ISO timestamp as `en-GB` text. Server-rendered output uses the
 * UTC variant; the client swaps to local time after hydration to avoid SSR
 * mismatches.
 */
export function HydratedDateText({
    value,
    dateOnly = false,
    emptyText = '-',
}: {
    value: string | null | undefined
    dateOnly?: boolean
    emptyText?: string
}) {
    const [isHydrated, setIsHydrated] = useState(false)

    useEffect(() => {
        setIsHydrated(true)
    }, [])

    if (!value) return <>{emptyText}</>

    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return <>{emptyText}</>

    if (dateOnly) {
        const dateOptions = isHydrated ? EN_GB_LOCAL_DATE_OPTIONS : EN_GB_UTC_DATE_OPTIONS
        return <>{parsed.toLocaleDateString('en-GB', dateOptions)}</>
    }

    const dateTimeOptions = isHydrated
        ? EN_GB_LOCAL_DATE_TIME_OPTIONS
        : EN_GB_UTC_DATE_TIME_OPTIONS

    return <>{parsed.toLocaleString('en-GB', dateTimeOptions)}</>
}
