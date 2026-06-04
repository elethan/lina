import { useEffect, useState } from 'react'
import {
    flexRender,
    getCoreRowModel,
    getFilteredRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    useReactTable,
    type ColumnResizeMode,
} from '@tanstack/react-table'
import { rankItem } from '@tanstack/match-sorter-utils'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { useDynamicPageSize } from '../../../hooks/useDynamicPageSize'
import type { SparePartOption, SparePartRow } from '../../../data/spare-parts.api'
import { sparePartColumns } from '../columns'

export function SparePartsTableView({
    data,
    siteOptions,
    locationOptions,
    rowSelection,
    setRowSelection,
    onSelectionChange,
    globalFilter,
    onGlobalFilterChange,
    canUpdateSpareParts,
    canDeleteSpareParts,
    onRefresh,
    onDelete,
}: {
    data: SparePartRow[]
    siteOptions: SparePartOption[]
    locationOptions: SparePartOption[]
    rowSelection: Record<string, boolean>
    setRowSelection: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
    onSelectionChange: (items: SparePartRow[]) => void
    globalFilter: string
    onGlobalFilterChange: (value: string) => void
    canUpdateSpareParts: boolean
    canDeleteSpareParts: boolean
    onRefresh: () => void
    onDelete: (row: SparePartRow) => void
}) {
    const [columnResizeMode] = useState<ColumnResizeMode>('onChange')
    const { containerRef, pageSize } = useDynamicPageSize()
    const [pageIndex, setPageIndex] = useState(0)

    const table = useReactTable({
        data,
        columns: sparePartColumns,
        state: {
            globalFilter,
            rowSelection,
            pagination: { pageIndex, pageSize },
        },
        onGlobalFilterChange: onGlobalFilterChange,
        onPaginationChange: (updater) => {
            const next = typeof updater === 'function' ? updater({ pageIndex, pageSize }) : updater
            setPageIndex(next.pageIndex)
        },
        onRowSelectionChange: setRowSelection,
        globalFilterFn: (row, _columnId, filterValue) => {
            const searchValue = String(filterValue ?? '').trim()
            if (!searchValue) return true

            const code = rankItem(row.getValue('code') ?? '', searchValue)
            const name = rankItem(row.getValue('name') ?? '', searchValue)
            const site = rankItem(row.getValue('siteName') ?? '', searchValue)

            return code.passed || name.passed || site.passed
        },
        getCoreRowModel: getCoreRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getSortedRowModel: getSortedRowModel(),
        enableRowSelection: true,
        enableMultiRowSelection: false,
        columnResizeMode,
        enableColumnResizing: true,
        meta: {
            canUpdateSpareParts,
            canDeleteSpareParts,
            siteOptions,
            locationOptions,
            onRefresh,
            onDelete,
        },
    })

    useEffect(() => {
        const selected = table.getSelectedRowModel().rows.map((row) => row.original)
        onSelectionChange(selected)
    }, [table, rowSelection, data, onSelectionChange])

    return (
        <div ref={containerRef} className="flex-1 overflow-auto px-6 py-4">
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
                <table className="min-w-full" style={{ width: table.getTotalSize() }}>
                    <thead>
                        {table.getHeaderGroups().map((headerGroup) => (
                            <tr key={headerGroup.id}>
                                {headerGroup.headers.map((header) => (
                                    <th
                                        key={header.id}
                                        className="relative border-b border-primary-200/50 bg-primary-100 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-primary-900"
                                        style={{ width: header.getSize() }}
                                    >
                                        {header.isPlaceholder
                                            ? null
                                            : flexRender(header.column.columnDef.header, header.getContext())}
                                        {header.column.getCanResize() && (
                                            <div
                                                onMouseDown={header.getResizeHandler()}
                                                onTouchStart={header.getResizeHandler()}
                                                className={`absolute right-0 top-0 h-full w-1 cursor-col-resize select-none touch-none transition-colors hover:bg-primary/40 ${header.column.getIsResizing() ? 'bg-primary/60' : ''}`}
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
                                <td colSpan={sparePartColumns.length} className="px-6 py-16 text-center text-gray-400">
                                    No spare parts found.
                                </td>
                            </tr>
                        ) : (
                            table.getRowModel().rows.map((row) => (
                                <tr
                                    key={row.id}
                                    className={`cursor-pointer transition-colors ${row.getIsSelected() ? 'bg-primary/5 hover:bg-primary/10' : 'hover:bg-gray-50'}`}
                                    onClick={row.getToggleSelectedHandler()}
                                >
                                    {row.getVisibleCells().map((cell) => (
                                        <td
                                            key={cell.id}
                                            className="px-4 py-3.5 align-top text-sm text-gray-600"
                                            style={{ width: cell.column.getSize() }}
                                        >
                                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                        </td>
                                    ))}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <div className="mt-3 flex items-center justify-between px-1 text-xs text-gray-500">
                <span>
                    {table.getFilteredRowModel().rows.length} of {data.length} spare parts
                </span>

                <div className="flex items-center gap-1.5">
                    <button
                        onClick={() => table.firstPage()}
                        disabled={!table.getCanPreviousPage()}
                        className="rounded-md p-1.5 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                        <ChevronsLeft size={14} />
                    </button>
                    <button
                        onClick={() => table.previousPage()}
                        disabled={!table.getCanPreviousPage()}
                        className="rounded-md p-1.5 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                        <ChevronLeft size={14} />
                    </button>
                    <span className="px-2 font-medium text-gray-600">
                        Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
                    </span>
                    <button
                        onClick={() => table.nextPage()}
                        disabled={!table.getCanNextPage()}
                        className="rounded-md p-1.5 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                        <ChevronRight size={14} />
                    </button>
                    <button
                        onClick={() => table.lastPage()}
                        disabled={!table.getCanNextPage()}
                        className="rounded-md p-1.5 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                        <ChevronsRight size={14} />
                    </button>
                </div>
            </div>
        </div>
    )
}