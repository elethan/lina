import { createFileRoute, useRouter, useNavigate } from '@tanstack/react-router'
import { useForm } from '@tanstack/react-form'
import { z } from 'zod'
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
import { useState, useMemo, useEffect } from 'react'
import { useDynamicPageSize } from '../../hooks/useDynamicPageSize'
import { Search, Calendar, PlusCircle, Merge, XCircle, ClipboardPlus, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, AlertCircle } from 'lucide-react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '../../components/ui/dialog'
import { useMutation } from '@tanstack/react-query'
import { useRouteContext } from '@tanstack/react-router'
import { useSetToolbar } from '../../components/ToolbarContext'
import { fetchRequests, deleteRequests, createRequest, type RequestRow } from '../../data/requests.api'
import { createWorkOrder } from '../../data/workorders.api'

import { fetchSiteEquipment, fetchSites } from '../../data/equipment.api'
import { useQuery } from '@tanstack/react-query'

type RequestSearchParams = {
    search?: string
    dateFrom?: string
    dateTo?: string
    status?: string
    siteId?: number
}

const getDefaultDateFrom = () => {
    const date = new Date()
    date.setMonth(date.getMonth() - 6)
    return date.toISOString().slice(0, 10)
}

// ── Route ─────────────────────────────────────────────────────
export const Route = createFileRoute('/_app/')({
    validateSearch: (search: Record<string, unknown>): RequestSearchParams => ({
        search: typeof search.search === 'string' ? search.search : undefined,
        dateFrom: typeof search.dateFrom === 'string' ? search.dateFrom : getDefaultDateFrom(),
        dateTo: typeof search.dateTo === 'string' ? search.dateTo : undefined,
        status:
            search.status === 'Open' ||
            search.status === 'Active' ||
            search.status === 'Closed' ||
            search.status === 'All'
                ? search.status
                : search.status === 'OpenActive'
                    ? 'Open'
                    : 'Open',
        siteId: search.siteId ? Number(search.siteId) : undefined,
    }),
    loader: async () => {
        const [requests] = await Promise.all([
            fetchRequests(),
        ])
        return { requests }
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
    columnHelper.accessor('woId', {
        header: 'WO #',
        cell: (info) => {
            const woId = info.getValue()
            if (!woId) return <span className="text-gray-400 italic font-mono text-xs">—</span>
            return (
                <span className="inline-flex px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-mono text-xs font-semibold border border-blue-100">
                    WO-{woId}
                </span>
            )
        },
        size: 80,
    }),
    columnHelper.accessor('siteName', {
        header: 'Site',
        cell: (info) => info.getValue() ?? '—',
        filterFn: fuzzyFilter,
        size: 120
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
        size:400
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
                timeZone: 'UTC',
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
                    className="text-xs py-1 px-1.5 border border-primary-200 rounded bg-green-50 text-gray-700 font-normal focus:outline-none focus:border-primary/60 outline-none w-full max-w-20 "
                >
                    <option value="All">All</option>
                    <option value="Open">Open</option>
                    <option value="Active">Active</option>
                    <option value="Closed">Closed</option>
                </select>
            </div>
        ),
        cell: (info) => {
            const status = info.getValue()
            const colors: Record<string, string> = {
                Open: 'bg-primary/10 text-primary-darker border border-primary/20',
                Active: 'bg-blue-100 text-blue-700 border border-blue-200',
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
        size: 100,
     }),
    columnHelper.accessor('downtimeStartAt', {
        header: 'Downtime',
        cell: (info) => {
            const start = info.getValue()
            const end = info.row.original.downtimeEndAt
            if (!start) return <span className="text-gray-400">—</span>
            
            const formatDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
            
            return (
                <div className="flex flex-col text-[11px] space-y-0.5">
                    <span className="text-red-600 font-medium">Down: {formatDate(start)}</span>
                    {end ? <span className="text-green-600 font-medium">Up: {formatDate(end)}</span> : <span className="text-gray-400 italic">Ongoing</span>}
                </div>
            )
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
    const { requests: data } = Route.useLoaderData()
    const router = useRouter()
    const navigate = useNavigate({ from: '/' })
    const { user } = useRouteContext({ from: '/_app/' })
    const userRole = user?.role ?? 'user'
    const { search: globalFilter = '', dateFrom = '', dateTo = '', status: statusFilter = 'Open', siteId } = Route.useSearch()

    const setGlobalFilter = (value: string) =>
        navigate({ search: (prev: RequestSearchParams) => ({ ...prev, search: value || undefined }) })
    const setDateFrom = (value: string) =>
        navigate({ search: (prev: RequestSearchParams) => ({ ...prev, dateFrom: value || undefined }) })
    const setDateTo = (value: string) =>
        navigate({ search: (prev: RequestSearchParams) => ({ ...prev, dateTo: value || undefined }) })

    const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({})
    const [showCreateWODialog, setShowCreateWODialog] = useState(false)
    const [showCloseDialog, setShowCloseDialog] = useState(false)
    const [showNewRequestDialog, setShowNewRequestDialog] = useState(false)
    const [autoWoNotice, setAutoWoNotice] = useState<{ woId: number; isNew: boolean } | null>(null)
    const [columnFilters, setColumnFilters] = useState<any[]>([
        ...(statusFilter && statusFilter !== 'All' ? [{ id: 'status', value: statusFilter }] : []),
    ])

    const { mutate: mutateCreateWO } = useMutation({
        mutationFn: async (data: { requestIds: number[] }) => {
            const result = await createWorkOrder({ data })
            return result
        },
        onSuccess: (result) => {
            router.invalidate()
            setRowSelection({})
            navigate({ to: '/work-orders', search: { newWoId: result.woId, status: 'All' } })
        },
    })

    const { mutate: mutateDeleteRequests } = useMutation({
        mutationFn: async (data: { requestIds: number[] }) => {
            const result = await deleteRequests({ data })
            return result
        },
        onSuccess: () => {
            router.invalidate()
            setRowSelection({})
            setShowCloseDialog(false)
        },
    })

    // Date-filtered + Site-filtered  data
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

        // Site filter
        if (siteId) {
            result = result.filter((row) => row.siteId === siteId)
        }

        return result
    }, [data, dateFrom, dateTo, siteId])

    const [columnResizeMode] = useState<ColumnResizeMode>('onChange')
    const { containerRef, pageSize } = useDynamicPageSize()
    const [pageIndex, setPageIndex] = useState(0)

    const table = useReactTable({
        data: filteredData,
        columns,
        state: { globalFilter, rowSelection, columnFilters, pagination: { pageIndex, pageSize } },
        onGlobalFilterChange: setGlobalFilter,
        onPaginationChange: (updater) => {
            const next = typeof updater === 'function' ? updater({ pageIndex, pageSize }) : updater
            setPageIndex(next.pageIndex)
        },
        onRowSelectionChange: setRowSelection,
        onColumnFiltersChange: (updater) => {
            setColumnFilters(updater)
            const newFilters = typeof updater === 'function' ? updater(columnFilters) : updater
            const newStatus = newFilters.find((f: any) => f.id === 'status')?.value as string | undefined

            navigate({
                search: (prev: RequestSearchParams) => ({
                    ...prev,
                    status: newStatus,
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
    })

    const selectedCount = Object.keys(rowSelection).length

    const handleConfirmCreateWO = () => {
        const selectedRequestIds = Object.keys(rowSelection)
            .filter((key) => rowSelection[key])
            .map((key) => filteredData[parseInt(key)]?.id)
            .filter((id): id is number => id !== undefined)

        setShowCreateWODialog(false)
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
                        className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15 transition-colors"
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
                        className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-gray-600 text-sm focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15 transition-colors"
                    />
                    <span className="text-gray-400">to</span>
                    <input
                        id="date-to"
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-gray-600 text-sm focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15 transition-colors"
                    />
                </div>
            </>
        ),
        rightContent: (
            <div className="flex items-center gap-2">
                <button
                    id="btn-new"
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white shadow-sm hover:bg-primary-dark transition-all w-32 whitespace-nowrap disabled:opacity-50"
                    onClick={() => setShowNewRequestDialog(true)}
                >
                    <PlusCircle size={16} />
                    New
                </button>
                <div className="w-px h-8 bg-gray-200" />
                <button
                    id="btn-create-wo"
                    disabled={selectedCount === 0 || userRole === 'user'}
                    onClick={() => setShowCreateWODialog(true)}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-white text-gray-600 border border-gray-200 shadow-sm hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all w-32 whitespace-nowrap"
                >
                    <ClipboardPlus size={16} />
                    Create WO
                </button>
                <button
                    id="btn-merge"
                    disabled={selectedCount < 2 || userRole === 'user'}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-white text-gray-600 border border-gray-200 shadow-sm hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all w-32 whitespace-nowrap"
                >
                    <Merge size={16} />
                    Merge
                </button>
                <button
                    id="btn-close"
                    disabled={selectedCount === 0}
                    onClick={() => setShowCloseDialog(true)}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-white text-gray-600 border border-gray-200 shadow-sm hover:bg-red-50 hover:text-red-600 hover:border-red-200 disabled:opacity-30 disabled:cursor-not-allowed transition-all w-32 whitespace-nowrap"
                >
                    <XCircle size={16} />
                    Close
                </button>
            </div>
        ),
    }), [globalFilter, dateFrom, dateTo, selectedCount, userRole, siteId])

    useSetToolbar(toolbarConfig)

    // Check if selected requests span multiple assets
    const selectedRequests = Object.keys(rowSelection)
        .filter((key) => rowSelection[key])
        .map((key) => filteredData[parseInt(key)])
        .filter((req): req is typeof filteredData[0] => req !== undefined)

    const uniqueAssetIds = new Set(selectedRequests.map((req) => req.assetId))
    const isMultipleAssets = uniqueAssetIds.size > 1
    const hasAttachedRequests = selectedRequests.some((req) => req.status !== 'Open')

    return (
        <>
            {/* ─── Close Requests Dialog ─── */}
            <Dialog open={showCloseDialog} onOpenChange={setShowCloseDialog}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <div className="flex items-center gap-3 mb-1">
                            <div className={`flex items-center justify-center w-10 h-10 rounded-full shrink-0 ${hasAttachedRequests ? 'bg-red-100' : 'bg-primary/10'}`}>
                                <XCircle size={20} className={hasAttachedRequests ? 'text-red-600' : 'text-primary'} />
                            </div>
                            <DialogTitle className="text-base font-semibold text-gray-900">
                                {hasAttachedRequests ? 'Cannot Delete Requests' : 'Delete Requests'}
                            </DialogTitle>
                        </div>
                        <DialogDescription className="text-sm text-gray-500 leading-relaxed pl-[52px]">
                            {hasAttachedRequests ? (
                                <>
                                    One or more of the selected requests are currently <span className="font-semibold text-gray-700">Active</span> or <span className="font-semibold text-gray-700">Closed</span>.
                                    <br /><br />
                                    You cannot delete requests that are already attached to a Work Order.
                                </>
                            ) : (
                                <>
                                    Are you sure you want to permanently delete{' '}
                                    <span className="font-semibold text-gray-700">
                                        {selectedCount} selected request{selectedCount !== 1 ? 's' : ''}
                                    </span>?
                                    <br /><br />
                                    This action cannot be undone.
                                </>
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="mt-2 flex gap-2 sm:gap-2">
                        {hasAttachedRequests ? (
                            <button
                                onClick={() => setShowCloseDialog(false)}
                                className="w-full inline-flex items-center justify-center px-4 py-2.5 rounded-lg text-sm font-medium bg-gray-900 text-white hover:bg-gray-800 transition-colors"
                            >
                                Got it
                            </button>
                        ) : (
                            <>
                                <button
                                    onClick={() => setShowCloseDialog(false)}
                                    className="flex-1 inline-flex items-center justify-center px-4 py-2.5 rounded-lg text-sm font-medium bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    autoFocus
                                    onClick={() => {
                                        const ids = selectedRequests.map((r) => r.id)
                                        mutateDeleteRequests({ requestIds: ids })
                                    }}
                                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-red-600 text-white shadow-sm hover:bg-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500/40 focus:ring-offset-1"
                                >
                                    <XCircle size={15} />
                                    Delete
                                </button>
                            </>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ─── Create WO Confirmation / Error Dialog ─── */}
            <Dialog open={showCreateWODialog} onOpenChange={setShowCreateWODialog}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <div className="flex items-center gap-3 mb-1">
                            <div className={`flex items-center justify-center w-10 h-10 rounded-full shrink-0 ${isMultipleAssets ? 'bg-red-100' : 'bg-primary/10'}`}>
                                <AlertCircle size={20} className={isMultipleAssets ? 'text-red-600' : 'text-primary'} />
                            </div>
                            <DialogTitle className="text-base font-semibold text-gray-900">
                                {isMultipleAssets ? 'Invalid Selection' : 'Create Work Order'}
                            </DialogTitle>
                        </div>
                        <DialogDescription className="text-sm text-gray-500 leading-relaxed pl-[52px]">
                            {isMultipleAssets ? (
                                <>
                                    You have selected requests from <span className="font-semibold text-gray-700">multiple different assets/systems</span>.
                                    <br /><br />
                                    A single Work Order can only be created for requests belonging to the <span className="font-semibold text-gray-700">same asset</span>. Please adjust your selection and try again.
                                </>
                            ) : (
                                <>
                                    A new Work Order will be created and linked to{' '}
                                    <span className="font-semibold text-gray-700">
                                        {selectedCount} selected request{selectedCount !== 1 ? 's' : ''}
                                    </span>
                                    . This action will commit the Work Order to the database.
                                </>
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="mt-2 flex gap-2 sm:gap-2">
                        {isMultipleAssets ? (
                            <button
                                onClick={() => setShowCreateWODialog(false)}
                                className="w-full inline-flex items-center justify-center px-4 py-2.5 rounded-lg text-sm font-medium bg-gray-900 text-white hover:bg-gray-800 transition-colors"
                            >
                                Got it
                            </button>
                        ) : (
                            <>
                                <button
                                    onClick={() => setShowCreateWODialog(false)}
                                    className="flex-1 inline-flex items-center justify-center px-4 py-2.5 rounded-lg text-sm font-medium bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    autoFocus
                                    onClick={handleConfirmCreateWO}
                                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white shadow-sm hover:bg-primary-dark transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-1"
                                >
                                    <ClipboardPlus size={15} />
                                    Continue
                                </button>
                            </>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            {/* ─── Table ─── */}
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

            <NewRequestDialog
                initialSiteId={siteId}
                open={showNewRequestDialog}
                onOpenChange={setShowNewRequestDialog}
                onAutoWoCreated={(info) => setAutoWoNotice(info)}
            />

            {autoWoNotice && (
                <Dialog open={!!autoWoNotice} onOpenChange={() => setAutoWoNotice(null)}>
                    <DialogContent className="sm:max-w-sm">
                        <DialogHeader>
                            <DialogTitle>
                                Work Order {autoWoNotice.isNew ? 'Created' : 'Linked'} Automatically
                            </DialogTitle>
                            <DialogDescription className="pt-1">
                                {autoWoNotice.isNew
                                    ? `A new Work Order WO-${String(autoWoNotice.woId).padStart(4, '0')} was automatically created because you reported system downtime.`
                                    : `Your request was linked to the existing open Work Order WO-${String(autoWoNotice.woId).padStart(4, '0')}.`
                                }
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter className="pt-4">
                            <button
                                onClick={() => setAutoWoNotice(null)}
                                className="px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary-dark rounded-md shadow-sm transition-colors"
                            >
                                OK
                            </button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}
        </>
    )
}

// ── New Request Dialog ──────────────────────────────────────────────

function NewRequestDialog({ initialSiteId, open, onOpenChange, onAutoWoCreated }: { initialSiteId?: number, open: boolean, onOpenChange: (open: boolean) => void, onAutoWoCreated?: (info: { woId: number; isNew: boolean }) => void }) {
    const router = useRouter()
    const siteLocked = typeof initialSiteId === 'number'
    const [selectedSiteId, setSelectedSiteId] = useState<number | undefined>(initialSiteId)
    const [formErrorToast, setFormErrorToast] = useState<string | null>(null)
    const getTodayDateValue = () => new Date().toISOString().slice(0, 10)

    const showFormError = (message: string) => {
        setFormErrorToast(message)
    }

    const { data: sites, isLoading: isLoadingSites } = useQuery({
        queryKey: ['sites'],
        queryFn: async () => fetchSites(),
        enabled: open,
    })

    // Fetch equipment data for the selected site
    const { data: equipment, isLoading } = useQuery({
        queryKey: ['siteEquipment', selectedSiteId],
        queryFn: async () => fetchSiteEquipment({ data: { siteId: selectedSiteId as number } }),
        enabled: open && !!selectedSiteId,
    })

    const { mutateAsync: mutateCreateRequest } = useMutation({
        mutationFn: async (data: { assetId?: number, systemId?: number, reportedBy: string, commentText: string, downtimeStartAt?: string, downtimeEndAt?: string }) => {
            return await createRequest({ data })
        },
        onSuccess: (result) => {
            router.invalidate()
            onOpenChange(false)
            if (result.linkedWoId !== undefined) {
                onAutoWoCreated?.({ woId: result.linkedWoId, isNew: result.woIsNew ?? false })
            }
        }
    })

    const form = useForm({
        defaultValues: {
            systemId: 0,
            assetId: 0,
            reportedBy: '',
            commentText: '',
            downtimeDate: getTodayDateValue(),
            downtimeTime: '',
            downtimeEndDate: getTodayDateValue(),
            downtimeEndTime: '',
        },
        onSubmit: async ({ value }) => {
            // Validation step
            const parsed = z.object({
                systemId: z.number().min(1, 'System is required'),
                assetId: z.number().min(1, 'Asset is required'),
                reportedBy: z.string().min(1, 'Reported by is required'),
                commentText: z.string().min(1, 'Comment is required')
            }).safeParse(value)

            if (!parsed.success) {
                const firstError = parsed.error.issues[0]?.message ?? 'Please fill out all required fields.'
                showFormError(firstError)
                return
            }

            const hasDowntimeTime = value.downtimeTime.trim().length > 0
            let downtimeStartAt: string | undefined
            if (hasDowntimeTime) {
                const parsedDowntime = new Date(`${value.downtimeDate}T${value.downtimeTime}`)
                if (Number.isNaN(parsedDowntime.getTime())) {
                    showFormError('Downtime date/time is invalid')
                    return
                }
                downtimeStartAt = parsedDowntime.toISOString()
            }

            const hasDowntimeEndTime = value.downtimeEndTime.trim().length > 0
            let downtimeEndAt: string | undefined
            if (hasDowntimeEndTime) {
                const parsedDowntimeEnd = new Date(`${value.downtimeEndDate}T${value.downtimeEndTime}`)
                if (Number.isNaN(parsedDowntimeEnd.getTime())) {
                    showFormError('Downtime end date/time is invalid')
                    return
                }
                downtimeEndAt = parsedDowntimeEnd.toISOString()
            }

            await mutateCreateRequest({
                systemId: parsed.data.systemId,
                assetId: parsed.data.assetId,
                reportedBy: parsed.data.reportedBy,
                commentText: parsed.data.commentText,
                downtimeStartAt,
                downtimeEndAt,
            })
        }
    })

    useEffect(() => {
        if (!open) return

        setSelectedSiteId(siteLocked ? initialSiteId : undefined)
        form.setFieldValue('systemId', 0)
        form.setFieldValue('assetId', 0)
        form.setFieldValue('reportedBy', '')
        form.setFieldValue('commentText', '')
        form.setFieldValue('downtimeDate', getTodayDateValue())
        form.setFieldValue('downtimeTime', '')
        form.setFieldValue('downtimeEndDate', getTodayDateValue())
        form.setFieldValue('downtimeEndTime', '')
        setFormErrorToast(null)
    }, [open, siteLocked, initialSiteId])

    useEffect(() => {
        if (!formErrorToast) return
        const timer = setTimeout(() => setFormErrorToast(null), 2000)
        return () => clearTimeout(timer)
    }, [formErrorToast])

    const selectedSiteName = sites?.find((site) => site.siteId === selectedSiteId)?.name

    const getAvailableSystemsForAsset = (assetId?: number) => {
        if (!equipment) return []
        if (!assetId) return equipment.systems

        const validSystemIds = equipment.assetSystemMap
            .filter((m) => m.assetId === assetId)
            .map((m) => m.systemId)

        return equipment.systems.filter((s) => validSystemIds.includes(s.systemId))
    }

    // Derived asset logic moved inside Asset Field subscription

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                {formErrorToast && (
                    <div className="absolute top-4 right-4 z-50 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 shadow-sm">
                        {formErrorToast}
                    </div>
                )}
                <DialogHeader>
                    <DialogTitle>New Request</DialogTitle>
                    <DialogDescription>
                        {selectedSiteId
                            ? `for ${selectedSiteName ?? `site ID ${selectedSiteId}`}.`
                            : ''}
                    </DialogDescription>
                </DialogHeader>

                {(isLoadingSites && open) || (isLoading && !!selectedSiteId) ? (
                    <div className="py-8 text-center text-sm text-gray-500">Loading equipment...</div>
                ) : (
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            form.handleSubmit()
                        }}
                        noValidate
                        className="space-y-4 pt-4"
                    >
                        {/* Site Dropdown */}
                        <div className="space-y-1.5">
                            <label htmlFor="new-request-site" className="text-sm font-medium text-gray-700">Site</label>
                            <select
                                id="new-request-site"
                                disabled={siteLocked || isLoadingSites}
                                value={selectedSiteId ?? ''}
                                onChange={(e) => {
                                    const value = e.target.value ? Number(e.target.value) : undefined
                                    setSelectedSiteId(value)
                                    form.setFieldValue('systemId', 0)
                                    form.setFieldValue('assetId', 0)
                                }}
                                className="w-full text-sm border border-gray-300 rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary disabled:bg-gray-100 disabled:text-gray-500"
                            >
                                <option value="">Select a Site</option>
                                {sites?.map((site) => (
                                    <option key={site.siteId} value={site.siteId}>{site.name}</option>
                                ))}
                            </select>
                        </div>

                        {/* Asset Dropdown */}
                        <form.Field name="assetId">
                            {(field) => (
                                <div className="space-y-1.5">
                                    <label htmlFor={field.name} className="text-sm font-medium text-gray-700">Asset</label>
                                    <select
                                        id={field.name}
                                        disabled={!selectedSiteId}
                                        value={field.state.value || ''}
                                        onChange={(e) => {
                                            const nextAssetId = e.target.value ? Number(e.target.value) : 0
                                            field.handleChange(nextAssetId)

                                            const systemsForAsset = getAvailableSystemsForAsset(
                                                nextAssetId || undefined,
                                            )
                                            form.setFieldValue('systemId', systemsForAsset[0]?.systemId ?? 0)
                                        }}
                                        className="w-full text-sm border border-gray-300 rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary disabled:bg-gray-100 disabled:text-gray-500"
                                    >
                                        <option value="">{selectedSiteId ? 'Select an Asset' : 'Select a Site first'}</option>
                                        {equipment?.assets.map(a => (
                                            <option key={a.assetId} value={a.assetId}>{a.modelName || 'Unknown Model'} (SN: {a.serialNumber})</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </form.Field>

                        {/* System Dropdown */}
                        <form.Subscribe selector={(state) => state.values.assetId}>
                            {(selectedAssetId) => {
                                const availableSystems = getAvailableSystemsForAsset(selectedAssetId || undefined)

                                return (
                                    <form.Field name="systemId">
                                        {(field) => (
                                            <div className="space-y-1.5">
                                                <label htmlFor={field.name} className="text-sm font-medium text-gray-700">System</label>
                                                <select
                                                    id={field.name}
                                                    disabled={!selectedSiteId}
                                                    value={field.state.value || ''}
                                                    onChange={(e) => field.handleChange(Number(e.target.value))}
                                                    className="w-full text-sm border border-gray-300 rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary disabled:bg-gray-100 disabled:text-gray-500"
                                                >
                                                    <option value="">{selectedSiteId ? 'Select a System' : 'Select a Site first'}</option>
                                                    {availableSystems.map(s => (
                                                        <option key={s.systemId} value={s.systemId}>{s.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}
                                    </form.Field>
                                )
                            }}
                        </form.Subscribe>

                        {/* Reported By Text Input */}
                        <form.Field name="reportedBy">
                            {(field) => (
                                <div className="space-y-1.5">
                                    <label htmlFor={field.name} className="text-sm font-medium text-gray-700">Reported By</label>
                                    <input
                                        id={field.name}
                                        type="text"
                                        placeholder="Clinical staff name"
                                        value={field.state.value}
                                        onChange={(e) => field.handleChange(e.target.value)}
                                        className="w-full text-sm border border-gray-300 rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                                    />
                                </div>
                            )}
                        </form.Field>

                        {/* Comment Textarea */}
                        <form.Field name="commentText">
                            {(field) => (
                                <div className="space-y-1.5">
                                    <label htmlFor={field.name} className="text-sm font-medium text-gray-700">Description</label>
                                    <textarea
                                        id={field.name}
                                        placeholder="Describe the issue..."
                                        rows={6}
                                        value={field.state.value}
                                        onChange={(e) => field.handleChange(e.target.value)}
                                        className="w-full text-sm border border-gray-300 rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary resize-none"
                                    />
                                </div>
                            )}
                        </form.Field>

                        {/* System Down Since (optional) */}
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-gray-700">System Down Since <span className="text-gray-400 font-normal">(optional)</span></label>
                            <div className="grid grid-cols-2 gap-2">
                                <form.Field name="downtimeDate">
                                    {(field) => (
                                        <input
                                            id={field.name}
                                            type="date"
                                            value={field.state.value}
                                            onChange={(e) => field.handleChange(e.target.value)}
                                            className="w-full text-sm border border-gray-300 rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                                        />
                                    )}
                                </form.Field>
                                <form.Field name="downtimeTime">
                                    {(field) => (
                                        <input
                                            id={field.name}
                                            type="time"
                                            step={60}
                                            value={field.state.value}
                                            onChange={(e) => field.handleChange(e.target.value)}
                                            className="w-full text-sm border border-gray-300 rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                                        />
                                    )}
                                </form.Field>
                            </div>
                        </div>

                        {/* System Restored At (optional) */}
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-gray-700">System Restored At <span className="text-gray-400 font-normal">(optional)</span></label>
                            <div className="grid grid-cols-2 gap-2">
                                <form.Field name="downtimeEndDate">
                                    {(field) => (
                                        <input
                                            id={field.name}
                                            type="date"
                                            value={field.state.value}
                                            onChange={(e) => field.handleChange(e.target.value)}
                                            className="w-full text-sm border border-gray-300 rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                                        />
                                    )}
                                </form.Field>
                                <form.Field name="downtimeEndTime">
                                    {(field) => (
                                        <input
                                            id={field.name}
                                            type="time"
                                            step={60}
                                            value={field.state.value}
                                            onChange={(e) => field.handleChange(e.target.value)}
                                            className="w-full text-sm border border-gray-300 rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                                        />
                                    )}
                                </form.Field>
                            </div>
                            <p className="text-xs text-gray-500">Dates default to today. Enter a time only if system downtime needs to be recorded.</p>
                        </div>

                        <DialogFooter className="pt-2">
                            <button
                                type="button"
                                onClick={() => onOpenChange(false)}
                                className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-md transition-colors"
                            >
                                Cancel
                            </button>
                            <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
                                {([canSubmit, isSubmitting]) => (
                                    <button
                                        type="submit"
                                        disabled={!canSubmit || isSubmitting as boolean}
                                        className="px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary-dark rounded-md shadow-sm disabled:opacity-50 transition-colors"
                                    >
                                        {isSubmitting ? 'Creating...' : 'Create Request'}
                                    </button>
                                )}
                            </form.Subscribe>
                        </DialogFooter>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    )
}

