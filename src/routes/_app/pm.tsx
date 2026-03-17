import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import {
    useReactTable,
    getCoreRowModel,
    getFilteredRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    flexRender,
    createColumnHelper,
    type ColumnDef,
    type ColumnResizeMode,
} from '@tanstack/react-table'
import { rankItem } from '@tanstack/match-sorter-utils'
import { useMemo, useState } from 'react'
import {
    Calendar,
    CheckCircle2,
    AlertCircle,
    Search,
    PlusCircle,
    Pencil,
    Copy,
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
} from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { useRouteContext } from '@tanstack/react-router'
import { useSetToolbar } from '../../components/ToolbarContext'
import {
    fetchPmRows,
    duplicatePmInstance,
    reopenPmInstance,
    type PmRow,
} from '../../data/pm.api'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '../../components/ui/dialog'

type PmSearchParams = {
    search?: string
    dateFrom?: string
    dateTo?: string
    completionState?: 'nonCompleted' | 'completed' | 'all'
}

export const Route = createFileRoute('/_app/pm')({
    validateSearch: (search: Record<string, unknown>): PmSearchParams => ({
        search: typeof search.search === 'string' ? search.search : undefined,
        dateFrom: typeof search.dateFrom === 'string' ? search.dateFrom : undefined,
        dateTo: typeof search.dateTo === 'string' ? search.dateTo : undefined,
        completionState:
            search.completionState === 'completed' ||
            search.completionState === 'all' ||
            search.completionState === 'nonCompleted'
                ? search.completionState
                : 'nonCompleted',
    }),
    beforeLoad: ({ context }) => {
        const user = (context as any).user
        const role = user?.role as string | undefined
        if (!role) {
            throw redirect({ to: '/login' })
        }
        if (!['admin', 'engineer', 'scientist'].includes(role)) {
            throw redirect({ to: '/' })
        }
    },
    loader: async () => {
        const rows = await fetchPmRows()
        return { rows }
    },
    component: PreventiveMaintenancePage,
})

const columnHelper = createColumnHelper<PmRow>()

const columns: ColumnDef<PmRow, any>[] = [
    columnHelper.accessor('id', {
        header: 'PM #',
        cell: (info) => (
            <span className="font-semibold text-primary-darker font-mono text-xs">
                PM-{String(info.getValue()).padStart(4, '0')}
            </span>
        ),
        size: 100,
        enableResizing: false,
    }),
    columnHelper.accessor('serialNumber', {
        header: 'Serial No.',
        cell: (info) => (
            <span className="font-medium font-mono text-md text-gray-900">
                {info.getValue() ?? '—'}
            </span>
        ),
    }),
    columnHelper.accessor('siteName', {
        header: 'Site',
        cell: (info) => (
            <span className="font-medium font-mono text-md text-gray-900">
                {info.getValue() ?? '—'}
            </span>
        ),
    }),
    columnHelper.accessor('systemName', {
        header: 'System',
        cell: (info) => info.getValue() ?? '—',
    }),
    columnHelper.accessor('intervalMonths', {
        header: 'Interval',
        cell: (info) => {
            const months = info.getValue()
            return months ? `${months} month${months > 1 ? 's' : ''}` : '—'
        },
        size: 120,
    }),
    columnHelper.accessor('engineerName', {
        header: 'Engineer',
        cell: (info) => info.getValue() ?? <span className="text-gray-400 italic text-xs">Unassigned</span>,
    }),
    columnHelper.accessor('startAt', {
        header: 'Scheduled',
        cell: (info) => {
            const value = info.getValue()
            if (!value) return <span className="text-gray-300">—</span>
            return (
                <span className="text-gray-600 text-xs">
                    {new Date(value).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                    })}
                </span>
            )
        },
        size: 120,
    }),
    columnHelper.accessor('completedAt', {
        header: 'Completed',
        cell: (info) => {
            const value = info.getValue()
            if (!value) {
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary-darker border border-primary/20">
                        <AlertCircle size={12} />
                        Pending
                    </span>
                )
            }
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500 border border-gray-200">
                    <CheckCircle2 size={12} />
                    {new Date(value).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                    })}
                </span>
            )
        },
        size: 140,
    }),
]

function toDateInputValue(date: Date): string {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

function getSuggestedStartDate(source: PmRow | null): string {
    if (!source?.startAt || !source.intervalMonths) {
        return ''
    }

    const base = new Date(source.startAt)
    if (Number.isNaN(base.getTime())) {
        return ''
    }

    base.setMonth(base.getMonth() + source.intervalMonths)
    return toDateInputValue(base)
}

function PreventiveMaintenancePage() {
    const { rows } = Route.useLoaderData()
    const navigate = useNavigate({ from: '/pm' })
    const router = useRouter()
    const { user } = useRouteContext({ from: '/_app' })
    const {
        search: globalFilter = '',
        dateFrom = '',
        dateTo = '',
        completionState = 'nonCompleted',
    } = Route.useSearch()

    const setGlobalFilter = (value: string) =>
        navigate({
            search: (prev: PmSearchParams) => ({ ...prev, search: value || undefined }),
        })
    const setDateFrom = (value: string) =>
        navigate({
            search: (prev: PmSearchParams) => ({ ...prev, dateFrom: value || undefined }),
        })
    const setDateTo = (value: string) =>
        navigate({
            search: (prev: PmSearchParams) => ({ ...prev, dateTo: value || undefined }),
        })
    const setCompletionState = (value: PmSearchParams['completionState']) =>
        navigate({
            search: (prev: PmSearchParams) => ({
                ...prev,
                completionState: value ?? 'nonCompleted',
            }),
        })

    const filteredData = useMemo(() => {
        let result = rows

        if (completionState === 'nonCompleted') {
            result = result.filter((row) => !row.completedAt)
        } else if (completionState === 'completed') {
            result = result.filter((row) => !!row.completedAt)
        }

        if (dateFrom || dateTo) {
            result = result.filter((row) => {
                if (!row.startAt) return false
                const date = new Date(row.startAt)
                if (dateFrom && date < new Date(dateFrom)) return false
                if (dateTo) {
                    const to = new Date(dateTo)
                    to.setHours(23, 59, 59, 999)
                    if (date > to) return false
                }
                return true
            })
        }

        return result
    }, [rows, completionState, dateFrom, dateTo])

    const [columnResizeMode] = useState<ColumnResizeMode>('onChange')
    const [selectedPmId, setSelectedPmId] = useState<number | null>(null)
    const [showDuplicateDialog, setShowDuplicateDialog] = useState(false)
    const [duplicateDate, setDuplicateDate] = useState('')
    const [duplicateError, setDuplicateError] = useState<string | null>(null)
    const [showReopenDialog, setShowReopenDialog] = useState(false)

    const table = useReactTable({
        data: filteredData,
        columns,
        state: { globalFilter },
        initialState: { pagination: { pageSize: 20 } },
        onGlobalFilterChange: setGlobalFilter,
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
    })

    const selectedPm = useMemo(
        () => rows.find((row) => row.id === selectedPmId) ?? null,
        [rows, selectedPmId],
    )

    const { mutate: mutateDuplicate, isPending: isDuplicating } = useMutation({
        mutationFn: async () => {
            if (!selectedPm) {
                throw new Error('Select a PM record first')
            }

            if (!selectedPm.assetId || !selectedPm.systemId || !selectedPm.intervalMonths || !selectedPm.startAt) {
                throw new Error('Selected PM is missing required data and cannot be duplicated')
            }

            if (!duplicateDate) {
                throw new Error('Please choose a new start date')
            }

            return duplicatePmInstance({
                data: {
                    sourcePmId: selectedPm.id,
                    newStartAt: duplicateDate,
                },
            })
        },
        onSuccess: () => {
            setShowDuplicateDialog(false)
            setDuplicateError(null)
            router.invalidate()
        },
        onError: (error) => {
            setDuplicateError(error instanceof Error ? error.message : 'Failed to duplicate PM')
        },
    })

    const { mutate: mutateReopen, isPending: isReopening } = useMutation({
        mutationFn: async () => {
            if (!selectedPm) {
                throw new Error('Select a PM record first')
            }
            return reopenPmInstance({ data: { pmId: selectedPm.id } })
        },
        onSuccess: async () => {
            setShowReopenDialog(false)
            await router.invalidate()
            if (selectedPm) {
                navigate({
                    to: '/pm-form',
                    search: {
                        pmId: selectedPm.id,
                        returnSearch: globalFilter || undefined,
                        returnDateFrom: dateFrom || undefined,
                        returnDateTo: dateTo || undefined,
                        returnCompletionState: completionState,
                    },
                })
            }
        },
    })

    const handleOpenDuplicateDialog = () => {
        if (!selectedPm) {
            return
        }

        if (!selectedPm.assetId || !selectedPm.systemId || !selectedPm.intervalMonths || !selectedPm.startAt) {
            setDuplicateError('Selected PM is missing required data and cannot be duplicated')
            setShowDuplicateDialog(true)
            setDuplicateDate('')
            return
        }

        setDuplicateError(null)
        setDuplicateDate(getSuggestedStartDate(selectedPm))
        setShowDuplicateDialog(true)
    }

    const handleEdit = () => {
        if (!selectedPm) {
            return
        }

        if (selectedPm.completedAt) {
            setShowReopenDialog(true)
            return
        }

        navigate({
            to: '/pm-form',
            search: {
                pmId: selectedPm.id,
                returnSearch: globalFilter || undefined,
                returnDateFrom: dateFrom || undefined,
                returnDateTo: dateTo || undefined,
                returnCompletionState: completionState,
            },
        })
    }

    const hasSelection = !!selectedPm
    const canManagePm = user?.role === 'admin' || user?.role === 'engineer'

    const toolbarConfig = useMemo(
        () => ({
            title: 'Preventive Maintenance',
            leftContent: (
                <>
                    <div className="relative flex-1 min-w-64 max-w-sm">
                        <Search
                            size={16}
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                        />
                        <input
                            id="pm-search"
                            type="text"
                            placeholder="Search PM, asset, site, system, engineer..."
                            value={globalFilter}
                            onChange={(e) => setGlobalFilter(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15 transition-colors"
                        />
                    </div>

                    <div className="flex items-center gap-2 text-sm">
                        <Calendar size={16} className="text-gray-400" />
                        <input
                            id="pm-date-from"
                            type="date"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                            className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-600 text-xs focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15 transition-colors"
                        />
                        <span className="text-gray-400">to</span>
                        <input
                            id="pm-date-to"
                            type="date"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                            className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-600 text-xs focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15 transition-colors"
                        />
                    </div>

                    <div className="flex items-center gap-2 text-sm">
                        <select
                            id="pm-completion-state"
                            value={completionState}
                            onChange={(e) =>
                                setCompletionState(
                                    e.target.value as PmSearchParams['completionState'],
                                )
                            }
                            className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-700 text-xs focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15 transition-colors"
                        >
                            <option value="nonCompleted">Non-completed</option>
                            <option value="completed">Completed</option>
                            <option value="all">All</option>
                        </select>
                    </div>
                </>
            ),
            rightContent: (
                <div className="flex items-center gap-2">
                    <button
                        id="btn-new-pm"
                        disabled={!canManagePm}
                        onClick={() =>
                            navigate({
                                to: '/pm-form',
                                search: {
                                    returnSearch: globalFilter || undefined,
                                    returnDateFrom: dateFrom || undefined,
                                    returnDateTo: dateTo || undefined,
                                    returnCompletionState: completionState,
                                },
                            })
                        }
                        className="inline-flex items-center justify-center gap-2 px-8 py-2.5 rounded-lg text-sm font-medium bg-primary text-white shadow-sm hover:bg-primary-dark disabled:opacity-30 disabled:cursor-not-allowed transition-all w-40"
                    >
                        <PlusCircle size={16} />
                        New
                    </button>
                    <button
                        id="btn-edit-pm"
                        disabled={!hasSelection || !canManagePm}
                        onClick={handleEdit}
                        className="inline-flex items-center justify-center gap-2 px-8 py-2.5 rounded-lg text-sm font-medium bg-white text-gray-600 border border-gray-200 shadow-sm hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all w-40"
                    >
                        <Pencil size={16} />
                        Edit
                    </button>
                    <button
                        id="btn-duplicate-pm"
                        disabled={!hasSelection || !canManagePm}
                        onClick={handleOpenDuplicateDialog}
                        className="inline-flex items-center justify-center gap-2 px-8 py-2.5 rounded-lg text-sm font-medium bg-white text-gray-600 border border-gray-200 shadow-sm hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all w-40"
                    >
                        <Copy size={16} />
                        Duplicate
                    </button>
                </div>
            ),
        }),
        [
            globalFilter,
            dateFrom,
            dateTo,
            completionState,
            hasSelection,
            canManagePm,
            handleEdit,
            handleOpenDuplicateDialog,
        ],
    )

    useSetToolbar(toolbarConfig)

    return (
        <>
            <Dialog open={showDuplicateDialog} onOpenChange={setShowDuplicateDialog}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-base font-semibold text-gray-900">
                            Duplicate PM
                        </DialogTitle>
                        <DialogDescription className="text-sm text-gray-500 leading-relaxed">
                            This creates a new PM record with copied header fields, resets completion to pending, leaves engineer unassigned, and does not copy PM task results.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3">
                        <label htmlFor="pm-duplicate-start-date" className="text-sm font-medium text-gray-700">
                            New start date
                        </label>
                        <input
                            id="pm-duplicate-start-date"
                            type="date"
                            value={duplicateDate}
                            onChange={(e) => {
                                setDuplicateDate(e.target.value)
                                setDuplicateError(null)
                            }}
                            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-700 text-sm focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15 transition-colors"
                        />
                        {duplicateError && (
                            <p className="text-xs text-red-600">{duplicateError}</p>
                        )}
                    </div>

                    <DialogFooter>
                        <button
                            onClick={() => setShowDuplicateDialog(false)}
                            className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => mutateDuplicate()}
                            disabled={isDuplicating}
                            className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                            {isDuplicating ? 'Duplicating...' : 'Create Duplicate'}
                        </button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={showReopenDialog} onOpenChange={setShowReopenDialog}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-base font-semibold text-gray-900">
                            Reopen Completed PM?
                        </DialogTitle>
                        <DialogDescription className="text-sm text-gray-500 leading-relaxed">
                            This PM is already completed. Continuing will reopen it and allow edits.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <button
                            onClick={() => setShowReopenDialog(false)}
                            className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => mutateReopen()}
                            disabled={isReopening}
                            className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                            {isReopening ? 'Reopening...' : 'Reopen and Edit'}
                        </button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

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
                                    colSpan={columns.length}
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
                                        setSelectedPmId((prev) =>
                                            prev === row.original.id ? null : row.original.id,
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
                    {table.getFilteredRowModel().rows.length} of {rows.length} PM records
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
        </>
    )
}
