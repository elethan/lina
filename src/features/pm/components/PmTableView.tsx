import { useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
    useReactTable,
    getCoreRowModel,
    getFilteredRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    flexRender,
    type ColumnResizeMode,
} from '@tanstack/react-table'
import { rankItem } from '@tanstack/match-sorter-utils'
import {
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
} from 'lucide-react'
import { useDynamicPageSize } from '../../../hooks/useDynamicPageSize'
import type { PmRow } from '../../../data/pm.api'
import { pmColumns } from '../columns'
import type { PmSearchParams } from '../types'

export function PmTableView({
    data,
    selectedPmId,
    onSelectionChange,
    initialSearch,
}: {
    data: PmRow[]
    selectedPmId: number | null
    onSelectionChange: (pm: PmRow | null) => void
    initialSearch: PmSearchParams
}) {
    const navigate = useNavigate({ from: '/pm' })
    const {
        search: globalFilter = '',
        completedAt = 'pending',
        siteName = '',
        systemName = '',
    } = initialSearch

    const setGlobalFilter = (value: string) =>
        navigate({
            search: (prev: PmSearchParams) => ({ ...prev, search: value || undefined }),
        })

    const [columnFilters, setColumnFilters] = useState<any[]>([
        ...(completedAt && completedAt !== 'all' ? [{ id: 'completedAt', value: completedAt }] : []),
        ...(siteName ? [{ id: 'siteName', value: siteName }] : []),
        ...(systemName ? [{ id: 'systemName', value: systemName }] : []),
    ])

    const [columnResizeMode] = useState<ColumnResizeMode>('onChange')
    const { containerRef, pageSize } = useDynamicPageSize()
    const [pageIndex, setPageIndex] = useState(0)

    const siteOptions = useMemo(
        () =>
            Array.from(new Set(data.map((row) => row.siteName).filter((v): v is string => !!v))).sort(
                (a, b) => a.localeCompare(b),
            ),
        [data],
    )

    const systemOptions = useMemo(
        () =>
            Array.from(new Set(data.map((row) => row.systemName).filter((v): v is string => !!v))).sort(
                (a, b) => a.localeCompare(b),
            ),
        [data],
    )

    const table = useReactTable({
        data,
        columns: pmColumns,
        state: { globalFilter, columnFilters, pagination: { pageIndex, pageSize } },
        onGlobalFilterChange: setGlobalFilter,
        onPaginationChange: (updater) => {
            const next = typeof updater === 'function' ? updater({ pageIndex, pageSize }) : updater
            setPageIndex(next.pageIndex)
        },
        onColumnFiltersChange: (updater) => {
            setColumnFilters((prev) => {
                const next = typeof updater === 'function' ? updater(prev) : updater

                const rawCompletedAt = next.find((f: any) => f.id === 'completedAt')?.value as
                    | 'pending' | 'completed' | 'all' | undefined
                const rawSiteName = next.find((f: any) => f.id === 'siteName')?.value as string | undefined
                const rawSystemName = next.find((f: any) => f.id === 'systemName')?.value as string | undefined

                const newCompletedAt = rawCompletedAt && rawCompletedAt !== 'all' ? rawCompletedAt : undefined
                const newSiteName = rawSiteName?.trim() ? rawSiteName : undefined
                const newSystemName = rawSystemName?.trim() ? rawSystemName : undefined

                navigate({
                    search: (searchPrev: PmSearchParams) => ({
                        ...searchPrev,
                        completedAt: newCompletedAt,
                        siteName: newSiteName,
                        systemName: newSystemName,
                    }),
                })

                return next
            })
        },
        globalFilterFn: (row, _columnId, filterValue) => {
            const pmId = rankItem(String(row.getValue('id')), filterValue)
            const serial = rankItem(row.getValue('serialNumber') ?? '', filterValue)
            const site = rankItem(row.getValue('siteName') ?? '', filterValue)
            const system = rankItem(row.getValue('systemName') ?? '', filterValue)
            const engineer = rankItem(row.getValue('engineerName') ?? '', filterValue)
            return pmId.passed || serial.passed || site.passed || system.passed || engineer.passed
        },
        getCoreRowModel: getCoreRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getSortedRowModel: getSortedRowModel(),
        columnResizeMode,
        enableColumnResizing: true,
        meta: { siteOptions, systemOptions },
    })

    return (
        <div ref={containerRef} className="flex-1 overflow-auto px-6 py-4">
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm overflow-x-auto">
                <table className="min-w-full" style={{ width: table.getTotalSize() }}>
                    <thead>
                        {table.getHeaderGroups().map((headerGroup) => (
                            <tr key={headerGroup.id}>
                                {headerGroup.headers.map((header) => (
                                    <th
                                        key={header.id}
                                        className="px-4 py-3 text-left text-xs font-semibold text-primary-900 uppercase tracking-wider bg-primary-100 border-b border-primary-200/50 relative"
                                        style={{ width: header.getSize() }}
                                    >
                                        {header.isPlaceholder
                                            ? null
                                            : flexRender(
                                                  header.column.columnDef.header,
                                                  header.getContext(),
                                              )}
                                        {header.column.getCanResize() && (
                                            <div
                                                onMouseDown={header.getResizeHandler()}
                                                onTouchStart={header.getResizeHandler()}
                                                className={`absolute right-0 top-0 h-full w-1 cursor-col-resize select-none touch-none hover:bg-primary/40 transition-colors ${
                                                    header.column.getIsResizing()
                                                        ? 'bg-primary/60'
                                                        : ''
                                                }`}
                                            />
                                        )}
                                    </th>
                                ))}
                            </tr>
                        ))}
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {table.getRowModel().rows.length === 0 ? (
                            <tr>
                                <td
                                    colSpan={pmColumns.length}
                                    className="px-6 py-16 text-center text-gray-400"
                                >
                                    No preventive maintenance records found.
                                </td>
                            </tr>
                        ) : (
                            table.getRowModel().rows.map((row) => (
                                <tr
                                    key={row.id}
                                    onClick={() =>
                                        onSelectionChange(
                                            selectedPmId === row.original.id ? null : row.original,
                                        )
                                    }
                                    className={`transition-colors cursor-pointer ${
                                        selectedPmId === row.original.id
                                            ? 'bg-primary/5 hover:bg-primary/8'
                                            : 'hover:bg-gray-50'
                                    }`}
                                >
                                    {row.getVisibleCells().map((cell) => (
                                        <td
                                            key={cell.id}
                                            className="px-4 py-3.5 text-sm text-gray-600"
                                            style={{ width: cell.column.getSize() }}
                                        >
                                            {flexRender(
                                                cell.column.columnDef.cell,
                                                cell.getContext(),
                                            )}
                                        </td>
                                    ))}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <div className="mt-3 flex items-center justify-between text-xs text-gray-500 px-1">
                <span>
                    {table.getFilteredRowModel().rows.length} of {data.length} PM records
                </span>

                <div className="flex items-center gap-1.5">
                    <button
                        onClick={() => table.firstPage()}
                        disabled={!table.getCanPreviousPage()}
                        className="p-1.5 rounded-md hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                        <ChevronsLeft size={14} />
                    </button>
                    <button
                        onClick={() => table.previousPage()}
                        disabled={!table.getCanPreviousPage()}
                        className="p-1.5 rounded-md hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                        <ChevronLeft size={14} />
                    </button>

                    <span className="px-2 text-gray-600 tabular-nums">
                        Page {table.getState().pagination.pageIndex + 1} / {table.getPageCount() || 1}
                    </span>

                    <button
                        onClick={() => table.nextPage()}
                        disabled={!table.getCanNextPage()}
                        className="p-1.5 rounded-md hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                        <ChevronRight size={14} />
                    </button>
                    <button
                        onClick={() => table.lastPage()}
                        disabled={!table.getCanNextPage()}
                        className="p-1.5 rounded-md hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                        <ChevronsRight size={14} />
                    </button>
                </div>
            </div>
        </div>
    )
}
