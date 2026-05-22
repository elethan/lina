import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
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
import type { WorkOrderRow } from '../../../data/workorders.api'
import { workOrderColumns } from '../columns'
import type { WoSearchParams } from '../types'

export function WorkOrdersTableView({
    data,
    engineers: engineersList,
    rowSelection,
    setRowSelection,
    onSelectionChange,
    initialSearch,
}: {
    data: WorkOrderRow[]
    engineers: { id: number; name: string }[]
    rowSelection: Record<string, boolean>
    setRowSelection: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
    onSelectionChange: (items: WorkOrderRow[]) => void
    initialSearch: WoSearchParams
}) {
    const navigate = useNavigate({ from: '/work-orders' })
    const {
        search: globalFilter = '',
        status: statusFilter = 'Open',
        engineerId,
        newWoId,
    } = initialSearch
    const selectedEngineerId = engineerId ?? null

    const setGlobalFilter = (value: string) =>
        navigate({ search: (prev: WoSearchParams) => ({ ...prev, search: value || undefined }) })

    const [columnFilters, setColumnFilters] = useState<any[]>([
        { id: 'status', value: statusFilter || 'Open' },
        ...(selectedEngineerId !== null ? [{ id: 'engineerId', value: selectedEngineerId }] : []),
    ])

    useEffect(() => {
        setColumnFilters([
            { id: 'status', value: statusFilter || 'Open' },
            ...(selectedEngineerId !== null ? [{ id: 'engineerId', value: selectedEngineerId }] : []),
        ])
    }, [statusFilter, selectedEngineerId])

    const filteredData = useMemo(() => data, [data])

    const [columnResizeMode] = useState<ColumnResizeMode>('onChange')
    const { containerRef, pageSize } = useDynamicPageSize()
    const [pageIndex, setPageIndex] = useState(0)

    useEffect(() => {
        if (!newWoId) return
        const rowIndex = filteredData.findIndex((wo) => wo.id === newWoId)
        if (rowIndex !== -1) {
            setRowSelection({ [rowIndex]: true })
        }
        navigate({
            search: (prev: WoSearchParams) => ({ ...prev, newWoId: undefined }),
            replace: true,
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [newWoId])

    const table = useReactTable({
        data: filteredData,
        columns: workOrderColumns,
        state: {
            globalFilter,
            rowSelection,
            columnFilters,
            pagination: { pageIndex, pageSize },
        },
        onGlobalFilterChange: setGlobalFilter,
        onPaginationChange: (updater) => {
            const next = typeof updater === 'function' ? updater({ pageIndex, pageSize }) : updater
            setPageIndex(next.pageIndex)
        },
        onRowSelectionChange: setRowSelection,
        onColumnFiltersChange: (updater) => {
            const next = typeof updater === 'function' ? updater(columnFilters) : updater
            setColumnFilters(next)

            const newStatus =
                (next.find((f: any) => f.id === 'status')?.value as string | undefined) ?? 'Open'
            const newEngineerId = next.find((f: any) => f.id === 'engineerId')?.value as number | undefined

            navigate({
                search: (old: WoSearchParams) => ({
                    ...old,
                    status: newStatus,
                    engineerId: newEngineerId,
                }),
            })
        },
        globalFilterFn: (row, _columnId, filterValue) => {
            const woId = rankItem(String(row.getValue('id')), filterValue)
            const serial = rankItem(row.getValue('serialNumber') ?? '', filterValue)
            const site = rankItem(row.getValue('siteName') ?? '', filterValue)
            const desc = rankItem(row.getValue('description') ?? '', filterValue)
            return woId.passed || serial.passed || site.passed || desc.passed
        },
        getCoreRowModel: getCoreRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getSortedRowModel: getSortedRowModel(),
        enableRowSelection: true,
        enableMultiRowSelection: false,
        columnResizeMode,
        enableColumnResizing: true,
        meta: { engineersList },
    })

    useEffect(() => {
        const selected = table.getSelectedRowModel().rows.map((row) => row.original)
        onSelectionChange(selected)
    }, [table, rowSelection, filteredData, onSelectionChange])

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
                                            : flexRender(header.column.columnDef.header, header.getContext())}
                                        {header.column.getCanResize() && (
                                            <div
                                                onMouseDown={header.getResizeHandler()}
                                                onTouchStart={header.getResizeHandler()}
                                                className={`absolute right-0 top-0 h-full w-1 cursor-col-resize select-none touch-none hover:bg-primary/40 transition-colors ${header.column.getIsResizing() ? 'bg-primary/60' : ''
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
                                    colSpan={workOrderColumns.length}
                                    className="px-6 py-16 text-center text-gray-400"
                                >
                                    No work orders found.
                                </td>
                            </tr>
                        ) : (
                            table.getRowModel().rows.map((row) => (
                                <tr
                                    key={row.id}
                                    className={`transition-colors cursor-pointer ${row.getIsSelected() ? 'bg-primary/5 hover:bg-primary/8' : 'hover:bg-gray-50'
                                        }`}
                                    onClick={row.getToggleSelectedHandler()}
                                >
                                    {row.getVisibleCells().map((cell) => (
                                        <td
                                            key={cell.id}
                                            className="px-4 py-3.5 text-sm text-gray-600"
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

            <div className="mt-3 flex items-center justify-between text-xs text-gray-500 px-1">
                <span>
                    {table.getFilteredRowModel().rows.length} of {data.length} work orders
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
                    <span className="px-2 text-gray-600 font-medium">
                        Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
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
