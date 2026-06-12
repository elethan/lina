import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type {
  AssetStatusDashboardEditableField,
  AssetStatusDashboardRow,
} from '../../../data/dashboard.api'
import { AssetStatusCard } from './AssetStatusCard'

const GRID_ROWS = 4

function getDashboardColumnCount(width: number): number {
  if (width >= 1280) return 4
  if (width >= 1024) return 3
  if (width >= 640) return 2
  return 1
}

export function AssetStatusDashboard({
  rows,
  isLoading,
  errorMessage,
  onDetailCommit,
  isDetailSaving,
}: {
  rows: AssetStatusDashboardRow[]
  isLoading: boolean
  errorMessage: string | null
  onDetailCommit?: (payload: {
    assetId: number
    field: AssetStatusDashboardEditableField
    value: string | null
  }) => Promise<void>
  isDetailSaving?: (assetId: number, field: AssetStatusDashboardEditableField) => boolean
}) {
  const [pageIndex, setPageIndex] = useState(0)
  const [expandedAssetId, setExpandedAssetId] = useState<number | null>(null)
  const [columnCount, setColumnCount] = useState(4)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const recalcColumns = () => {
      setColumnCount(getDashboardColumnCount(window.innerWidth))
    }

    recalcColumns()
    window.addEventListener('resize', recalcColumns)
    return () => window.removeEventListener('resize', recalcColumns)
  }, [])

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const siteA = a.siteName?.trim() ?? ''
      const siteB = b.siteName?.trim() ?? ''
      const siteAMissing = siteA.length === 0
      const siteBMissing = siteB.length === 0

      if (siteAMissing !== siteBMissing) {
        return siteAMissing ? 1 : -1
      }

      const siteCompare = siteA.localeCompare(siteB, undefined, { sensitivity: 'base' })
      if (siteCompare !== 0) {
        return siteCompare
      }

      const modelCompare = (a.modelName ?? '').localeCompare(b.modelName ?? '', undefined, {
        sensitivity: 'base',
      })
      if (modelCompare !== 0) {
        return modelCompare
      }

      return a.serialNumber.localeCompare(b.serialNumber, undefined, {
        sensitivity: 'base',
      })
    })
  }, [rows])

  const pageSize = columnCount * GRID_ROWS
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize))

  useEffect(() => {
    if (pageIndex <= totalPages - 1) return
    setPageIndex(totalPages - 1)
  }, [pageIndex, totalPages])

  useEffect(() => {
    if (expandedAssetId == null) return
    if (sortedRows.some((row) => row.assetId === expandedAssetId)) return
    setExpandedAssetId(null)
  }, [expandedAssetId, sortedRows])

  const pageRows = useMemo(() => {
    const start = pageIndex * pageSize
    return sortedRows.slice(start, start + pageSize)
  }, [sortedRows, pageIndex, pageSize])

  const slots = useMemo(() => {
    if (isLoading) return Array.from({ length: pageSize }, () => null)

    const next = [...pageRows] as Array<AssetStatusDashboardRow | null>
    while (next.length < pageSize) {
      next.push(null)
    }
    return next
  }, [isLoading, pageRows, pageSize])

  const rowsByLine = useMemo(() => {
    const lines: Array<Array<AssetStatusDashboardRow | null>> = []

    for (let rowIndex = 0; rowIndex < GRID_ROWS; rowIndex += 1) {
      const start = rowIndex * columnCount
      lines.push(slots.slice(start, start + columnCount))
    }

    return lines
  }, [slots, columnCount])

  return (
    <div className="flex-1 min-h-0 p-4">
      <div className="h-full min-h-0 rounded-xl border border-gray-200 bg-white shadow-sm p-4 flex flex-col">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Asset Status Dashboard</h2>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <button
              type="button"
              onClick={() => setPageIndex((prev) => Math.max(0, prev - 1))}
              disabled={pageIndex === 0 || isLoading}
              className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Previous dashboard page"
            >
              <ChevronLeft size={16} />
            </button>

            <span className="min-w-28 text-center text-xs font-semibold uppercase tracking-wide text-gray-600">
              Page {pageIndex + 1} / {totalPages}
            </span>

            <button
              type="button"
              onClick={() => setPageIndex((prev) => Math.min(totalPages - 1, prev + 1))}
              disabled={pageIndex >= totalPages - 1 || isLoading}
              className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Next dashboard page"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {errorMessage ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : sortedRows.length === 0 && !isLoading ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-sm text-gray-600">
            No assets available for dashboard view.
          </div>
        ) : (
          <div className="flex-1 min-h-0">
            <div className="h-full min-h-0 flex flex-col gap-3">
              {rowsByLine.map((line, lineIndex) => {
                const expandedInLine = line.find(
                  (entry): entry is AssetStatusDashboardRow =>
                    !!entry && entry.assetId === expandedAssetId,
                )

                const orderedLine = expandedInLine
                  ? [
                    expandedInLine,
                    ...line.filter((entry) => !entry || entry.assetId !== expandedInLine.assetId),
                  ]
                  : line

                return (
                  <div key={`line-${lineIndex}`} className="min-h-0 flex-1 flex gap-3">
                    {orderedLine.map((entry, entryIndex) => {
                      const isExpanded = !!entry && expandedInLine?.assetId === entry.assetId
                      const isSqueezed = !!expandedInLine && !isExpanded

                      if (!entry) {
                        return (
                          <div
                            key={`slot-${lineIndex}-${entryIndex}`}
                            className={`rounded-xl border ${
                              isLoading
                                ? 'border-gray-200 bg-gray-50 p-4 animate-pulse'
                                : 'border-dashed border-gray-200 bg-gray-50/60'
                            } h-full min-h-24 transition-all duration-300 ${
                              isSqueezed
                                ? 'flex-[0_1_clamp(4.5rem,8vw,7.5rem)] min-w-[4.25rem]'
                                : 'flex-1 min-w-0'
                            }`}
                          >
                            {isLoading && (
                              <>
                                <div className="h-4 w-20 rounded bg-gray-200" />
                                <div className="h-3 w-28 rounded bg-gray-200 mt-2" />
                                <div className="h-10 w-10 rounded-full bg-gray-200 mt-3" />
                              </>
                            )}
                          </div>
                        )
                      }

                      return (
                        <div
                          key={entry.assetId}
                          className={`min-h-0 transition-all duration-300 ${
                            isSqueezed
                              ? 'flex-[0_1_clamp(4.5rem,8vw,7.5rem)] min-w-[4.25rem]'
                              : 'flex-1 min-w-0'
                          }`}
                        >
                          <AssetStatusCard
                            row={entry}
                            isExpanded={isExpanded}
                            isCompressed={isSqueezed}
                            onCommitField={onDetailCommit}
                            isFieldSaving={({ assetId, field }) =>
                              isDetailSaving?.(assetId, field) ?? false
                            }
                            onToggle={() =>
                              setExpandedAssetId((prev) =>
                                prev === entry.assetId ? null : entry.assetId,
                              )
                            }
                          />
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
