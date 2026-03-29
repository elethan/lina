import { useState, useEffect, useCallback, useRef } from 'react'

const HEADER_HEIGHT = 45 // px – thead row
const PAGINATION_HEIGHT = 44 // px – pagination bar + mt-3
const CONTAINER_PADDING = 32 // px – py-4 (16+16)
const TABLE_BORDER = 4 // px – rounded-xl border + shadow
const SAFETY_MARGIN = 4 // px – extra breathing room
const FALLBACK_ROW_HEIGHT = 70 // px – fallback if no rows rendered yet

const OVERHEAD = HEADER_HEIGHT + PAGINATION_HEIGHT + CONTAINER_PADDING + TABLE_BORDER + SAFETY_MARGIN

/**
 * Measures the available height for a table container and returns
 * the number of rows that fit without scrolling (min `minRows`).
 *
 * Dynamically measures the actual rendered row height from the DOM
 * rather than relying on a fixed constant.
 */
export function useDynamicPageSize(minRows = 3) {
    const containerRef = useRef<HTMLDivElement>(null)
    const [pageSize, setPageSize] = useState(20) // sensible SSR default

    const recalc = useCallback(() => {
        const el = containerRef.current
        if (!el) return

        const availableHeight = el.clientHeight

        // Measure actual row height from the first tbody row
        const firstRow = el.querySelector('tbody tr') as HTMLElement | null
        const rowHeight = firstRow ? firstRow.offsetHeight : FALLBACK_ROW_HEIGHT

        const usable = availableHeight - OVERHEAD
        const rows = Math.max(minRows, Math.floor(usable / rowHeight))
        setPageSize(rows)
    }, [minRows])

    useEffect(() => {
        const el = containerRef.current
        if (!el) return

        // Initial calculation (defer to allow first paint)
        requestAnimationFrame(() => recalc())

        // Re-calculate whenever the container resizes (e.g. window resize)
        const ro = new ResizeObserver(() => recalc())
        ro.observe(el)
        return () => ro.disconnect()
    }, [recalc])

    return { containerRef, pageSize }
}
