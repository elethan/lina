import { createFileRoute, useRouter, useNavigate } from '@tanstack/react-router'
import {
    useReactTable,
    getCoreRowModel,
    getFilteredRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    flexRender,
    createColumnHelper,
    type FilterFn,
    type ColumnDef,
    type ColumnResizeMode,
} from '@tanstack/react-table'
import { rankItem } from '@tanstack/match-sorter-utils'
import { useState, useMemo } from 'react'
import { Search, Calendar, PlusCircle, Merge, XCircle, ClipboardPlus, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { useRouteContext } from '@tanstack/react-router'
import { useSetToolbar } from '../../components/ToolbarContext'
import { fetchRequests, type RequestRow } from '../../data/requests.api'
import { createWorkOrder } from '../../data/workorders.api'
import { fetchEngineers } from '../../data/engineers.api'

type RequestSearchParams = {
    search?: string
    dateFrom?: string
    dateTo?: string
    status?: string
    engineerId?: number
}

// ── Route ─────────────────────────────────────────────────────
export const Route = createFileRoute('/_app/')({
    validateSearch: (search: Record<string, unknown>): RequestSearchParams => ({
        search: typeof search.search === 'string' ? search.search : undefined,
        dateFrom: typeof search.dateFrom === 'string' ? search.dateFrom : undefined,
        dateTo: typeof search.dateTo === 'string' ? search.dateTo : undefined,
        status: typeof search.status === 'string' ? search.status : 'Open',
        engineerId: search.engineerId ? Number(search.engineerId) : undefined,
    }),
    loader: async () => {
        const [requests, engineers] = await Promise.all([
            fetchRequests(),
            fetchEngineers(),
        ])
        return { requests, engineers }
    },
    component: RequestsPage,
})

// ── Fuzzy filter ──────────────────────────────────────────────
const fuzzyFilter: FilterFn<RequestRow> = (row, columnId, value, addMeta) => {
    const itemRank = rankItem(row.getValue(columnId), value)
    addMeta({ itemRank })
    return itemRank.passed
}

// ── Columns ───────────────────────────────────────────────────
const columnHelper = createColumnHelper<RequestRow>()

const columns: ColumnDef<RequestRow, any>[] = [
    columnHelper.display({
        id: 'select',
        header: ({ table }) => (
            <input
                type="checkbox"
                className="accent-primary rounded"
                checked={table.getIsAllRowsSelected()}
                onChange={table.getToggleAllRowsSelectedHandler()}
            />
        ),
        cell: ({ row }) => (
            <input
                type="checkbox"
                className="accent-primary rounded"
                checked={row.getIsSelected()}
                onChange={row.getToggleSelectedHandler()}
            />
        ),
        size: 40,
        enableResizing: false,
    }),
    columnHelper.accessor('id', {
        header: '#',
        cell: (info) => (
            <span className="text-gray-400 font-mono text-xs">
                {info.getValue()}
            </span>
        ),
        size: 60,
        enableResizing: false,
    }),
    columnHelper.accessor('siteName', {
        header: 'Site',
        cell: (info) => info.getValue() ?? '—',
        filterFn: fuzzyFilter,
    }),
    columnHelper.accessor('commentText', {
        header: 'Comment',
        cell: (info) => {
            const text = info.getValue()
            return (
                <span className="text-gray-500 whitespace-pre-wrap break-words">
                    {text}
                </span>
            )
        },
    }),
    columnHelper.accessor('createdAt', {
        header: 'Date Created',
        cell: (info) => {
            const date = info.getValue()
            if (!date) return '—'
            return new Date(date).toLocaleDateString('en-GB', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
            })
        },
    }),
    columnHelper.accessor('reportedBy', {
        header: 'Reported By',
        cell: (info) => info.getValue(),
    }),
    columnHelper.accessor('status', {
        header: ({ column }) => (
            <div className="flex flex-col gap-1">
                <span>Status</span>
                <select
                    value={(column.getFilterValue() ?? 'Open') as string}
                    onChange={(e) => column.setFilterValue(e.target.value === 'All' ? undefined : e.target.value)}
                    className="text-xs py-1 px-1.5 border border-primary-200 rounded bg-green-50 text-gray-700 font-normal focus:outline-none focus:border-primary/60 outline-none w-full max-w-20 truncate"
                >
                    <option value="All">All</option>
                    <option value="Open">Open</option>
                    <option value="Closed">Closed</option>
                </select>
            </div>
        ),
        cell: (info) => {
            const status = info.getValue()
            const colors: Record<string, string> = {
                Open: 'bg-primary/10 text-primary-darker border border-primary/20',
                Closed: 'bg-gray-100 text-gray-500 border border-gray-200',
            }
            return (
                <span
                    className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${colors[status] ?? 'bg-gray-100 text-gray-600'}`}
                >
                    {status}
                </span>
            )
        },
        filterFn: (row, columnId, filterValue) => {
            if (!filterValue || filterValue === 'All') return true
            return row.getValue(columnId) === filterValue
        },
    }),
    columnHelper.accessor('engineerId', {
        header: ({ column, table }) => {
            const engineers = (table.options.meta as any)?.engineersList ?? []
            return (
                <div className="flex flex-col gap-1">
                    <span>Engineer</span>
                    <select
                        value={(column.getFilterValue() ?? '') as string}
                        onChange={(e) => column.setFilterValue(e.target.value ? Number(e.target.value) : undefined)}
                        className="text-xs py-1 px-1.5 border border-primary-200 rounded bg-white text-gray-700 font-normal focus:outline-none focus:border-primary/60 outline-none w-full max-w-28 truncate"
                    >
                        <option value="">All</option>
                        {engineers.map((eng: { id: number; name: string }) => (
                            <option key={eng.id} value={eng.id}>
                                {eng.name}
                            </option>
                        ))}
                    </select>
                </div>
            )
        },
        cell: (info) => {
            const id = info.getValue()
            const name = info.row.original.engineerName
            return id ? (
                <span className="text-gray-700">{name}</span>
            ) : (
                <span className="text-gray-400 italic text-xs">Unassigned</span>
            )
        },
        filterFn: (row, columnId, filterValue) => {
            if (filterValue === undefined || filterValue === null || filterValue === '') return true
            return row.getValue(columnId) === filterValue || row.getValue(columnId) === null
        },
    }),

    columnHelper.accessor('serialNumber', {
        header: 'Serial Number',
        cell: (info) => (
            <span className="font-medium text-gray-900">
                {info.getValue() ?? '—'}
            </span>
        ),
        filterFn: fuzzyFilter,
    }),
    columnHelper.accessor('systemName', {
        header: 'System',
        cell: (info) => info.getValue() ?? '—',
    }),
]

// ── Page ──────────────────────────────────────────────────────
function RequestsPage() {
    const { requests: data, engineers: engineersList } = Route.useLoaderData()
    const router = useRouter()
    const navigate = useNavigate({ from: '/' })
    const { user } = useRouteContext({ from: '/_app/' })
    const userRole = user?.role ?? 'user'
    const { search: globalFilter = '', dateFrom = '', dateTo = '', status: statusFilter = 'Open', engineerId } = Route.useSearch()
    const selectedEngineerId = engineerId ?? null

    const setGlobalFilter = (value: string) =>
        navigate({ search: (prev: RequestSearchParams) => ({ ...prev, search: value || undefined }) })
    const setDateFrom = (value: string) =>
        navigate({ search: (prev: RequestSearchParams) => ({ ...prev, dateFrom: value || undefined }) })
    const setDateTo = (value: string) =>
        navigate({ search: (prev: RequestSearchParams) => ({ ...prev, dateTo: value || undefined }) })

    const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({})
    const [columnFilters, setColumnFilters] = useState<any[]>([
        ...(statusFilter && statusFilter !== 'All' ? [{ id: 'status', value: statusFilter }] : []),
        ...(selectedEngineerId !== null ? [{ id: 'engineerId', value: selectedEngineerId }] : []),
    ])

    const { mutate: mutateCreateWO } = useMutation({
        mutationFn: async (data: { requestIds: number[] }) => {
            const result = await createWorkOrder({ data })
            return result
        },
        onSuccess: () => {
            router.invalidate()
            setRowSelection({})
            navigate({ to: '/work-orders' })
        },
    })

    // Date-filtered + Engineer-filtered data
    const filteredData = useMemo(() => {
        let result = data

        // Date range filter
        if (dateFrom || dateTo) {
            result = result.filter((row) => {
                if (!row.createdAt) return true
                const d = new Date(row.createdAt)
                if (dateFrom && d < new Date(dateFrom)) return false
                if (dateTo) {
                    const to = new Date(dateTo)
                    to.setHours(23, 59, 59, 999)
                    if (d > to) return false
                }
                return true
            })
        }

        return result
    }, [data, dateFrom, dateTo])

    const [columnResizeMode] = useState<ColumnResizeMode>('onChange')

    const table = useReactTable({
        data: filteredData,
        columns,
        state: { globalFilter, rowSelection, columnFilters },
        initialState: { pagination: { pageSize: 20 } },
        onGlobalFilterChange: setGlobalFilter,
        onRowSelectionChange: setRowSelection,
        onColumnFiltersChange: (updater) => {
            setColumnFilters(updater)
            const newFilters = typeof updater === 'function' ? updater(columnFilters) : updater
            const newStatus = newFilters.find((f: any) => f.id === 'status')?.value as string | undefined
            const newEngineerId = newFilters.find((f: any) => f.id === 'engineerId')?.value as number | undefined

            navigate({
                search: (prev: RequestSearchParams) => ({
                    ...prev,
                    status: newStatus,
                    engineerId: newEngineerId,
                })
            })
        },
        globalFilterFn: (row, _columnId, filterValue) => {
            const serial = rankItem(row.getValue('serialNumber') ?? '', filterValue)
            const site = rankItem(row.getValue('siteName') ?? '', filterValue)
            return serial.passed || site.passed
        },
        getCoreRowModel: getCoreRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getSortedRowModel: getSortedRowModel(),
        enableRowSelection: true,
        columnResizeMode,
        enableColumnResizing: true,
        meta: { engineersList },
    })

    const selectedCount = Object.keys(rowSelection).length

    const handleCreateWO = () => {
        // Get actual request IDs from the selected row indices
        const selectedRequestIds = Object.keys(rowSelection)
            .filter((key) => rowSelection[key])
            .map((key) => filteredData[parseInt(key)]?.id)
            .filter((id): id is number => id !== undefined)

        if (selectedRequestIds.length === 0) return

        mutateCreateWO({ requestIds: selectedRequestIds })
    }

    // ── Set toolbar content (synchronous — SSR-safe) ─────────────
    const toolbarConfig = useMemo(() => ({
        title: 'Requests',
        leftContent: (
            <>
                {/* Fuzzy search */}
                <div className="relative flex-1 min-w-64 max-w-sm">
                    <Search
                        size={16}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                    <input
                        id="system-search"
                        type="text"
                        placeholder="Search serial number or site…"
                        value={globalFilter}
                        onChange={(e) => setGlobalFilter(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15 transition-colors"
                    />
                </div>

                {/* Date range */}
                <div className="flex items-center gap-2 text-sm">
                    <Calendar size={16} className="text-gray-400" />
                    <input
                        id="date-from"
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-600 text-xs focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15 transition-colors"
                    />
                    <span className="text-gray-400">to</span>
                    <input
                        id="date-to"
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-600 text-xs focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15 transition-colors"
                    />
                </div>
            </>
        ),
        rightContent: (
            <div className="flex items-center gap-2">
                <button
                    id="btn-new"
                    className="inline-flex items-center justify-center gap-2 px-8 py-2.5 rounded-lg text-sm font-medium bg-primary text-white shadow-sm hover:bg-primary-dark transition-all w-40"
                    onClick={() => {
                        alert('New Request form to be implemented')
                    }}
                >
                    <PlusCircle size={16} />
                    New
                </button>
                <div className="w-px h-6 bg-gray-200" />
                <button
                    id="btn-create-wo"
                    disabled={selectedCount === 0 || userRole === 'user'}
                    onClick={handleCreateWO}
                    className="inline-flex items-center justify-center gap-2 px-8 py-2.5 rounded-lg text-sm font-medium bg-white text-gray-600 border border-gray-200 shadow-sm hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all w-40"
                >
                    <ClipboardPlus size={16} />
                    Create WO
                </button>
                <button
                    id="btn-merge"
                    disabled={selectedCount < 2 || userRole === 'user'}
                    className="inline-flex items-center justify-center gap-2 px-8 py-2.5 rounded-lg text-sm font-medium bg-white text-gray-600 border border-gray-200 shadow-sm hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all w-40"
                >
                    <Merge size={16} />
                    Merge
                </button>
                <button
                    id="btn-close"
                    disabled={selectedCount === 0}
                    className="inline-flex items-center justify-center gap-2 px-8 py-2.5 rounded-lg text-sm font-medium bg-white text-gray-600 border border-gray-200 shadow-sm hover:bg-red-50 hover:text-red-600 hover:border-red-200 disabled:opacity-30 disabled:cursor-not-allowed transition-all w-40"
                >
                    <XCircle size={16} />
                    Close
                </button>
            </div>
        ),
    }), [globalFilter, dateFrom, dateTo, selectedCount, handleCreateWO, userRole])

    useSetToolbar(toolbarConfig)

    return (
        <>
            {/* ─── Table ─── */}
            <div className="flex-1 overflow-auto px-6 py-4">
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
                                                    className={`absolute right-0 top-0 h-full w-1 cursor-col-resize select-none touch-none hover:bg-primary/40 transition-colors ${header.column.getIsResizing() ? 'bg-primary/60' : ''}`}
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
                                        colSpan={columns.length}
                                        className="px-6 py-16 text-center text-gray-400"
                                    >
                                        No requests found.
                                    </td>
                                </tr>
                            ) : (
                                table.getRowModel().rows.map((row) => (
                                    <tr
                                        key={row.id}
                                        className={`transition-colors cursor-pointer ${row.getIsSelected()
                                            ? 'bg-primary/5 hover:bg-primary/8'
                                            : 'hover:bg-gray-50'
                                            }`}
                                        onClick={row.getToggleSelectedHandler()}
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

                {/* Footer — Pagination */}
                <div className="mt-3 flex items-center justify-between text-xs text-gray-500 px-1">
                    <span>
                        {table.getFilteredRowModel().rows.length} of{' '}
                        {data.length} requests
                        {selectedCount > 0 && ` · ${selectedCount} selected`}
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
                            Page {table.getState().pagination.pageIndex + 1} of{' '}
                            {table.getPageCount()}
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
        </>
    )
}
