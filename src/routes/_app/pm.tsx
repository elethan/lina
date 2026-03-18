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
import { useCallback, useMemo, useState } from 'react'
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
    fetchPmFormOptions,
    savePm,
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
    completedAt?: 'pending' | 'completed' | 'all'
    siteName?: string
    systemName?: string
}

export const Route = createFileRoute('/_app/pm')({
    validateSearch: (search: Record<string, unknown>): PmSearchParams => ({
        search: typeof search.search === 'string' ? search.search : undefined,
        dateFrom: typeof search.dateFrom === 'string' ? search.dateFrom : undefined,
        dateTo: typeof search.dateTo === 'string' ? search.dateTo : undefined,
        completedAt:
            search.completedAt === 'completed' ||
            search.completedAt === 'all' ||
            search.completedAt === 'pending'
                ? search.completedAt
                : search.completionState === 'completed'
                    ? 'completed'
                    : search.completionState === 'all'
                        ? 'all'
                        : 'pending',
        siteName: typeof search.siteName === 'string' ? search.siteName : undefined,
        systemName: typeof search.systemName === 'string' ? search.systemName : undefined,
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
        const [rows, options] = await Promise.all([
            fetchPmRows(),
            fetchPmFormOptions(),
        ])
        return { rows, options }
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
        header: ({ column, table }) => {
            const siteOptions = ((table.options.meta as any)?.siteOptions ?? []) as string[]

            return (
                <div className="flex flex-col gap-1">
                    <span>Site</span>
                    <select
                        value={(column.getFilterValue() ?? '') as string}
                        onChange={(e) => column.setFilterValue(e.target.value || undefined)}
                        className="text-xs py-1 px-1.5 border border-primary-200 rounded bg-white text-gray-700 font-normal focus:outline-none focus:border-primary/60 outline-none w-full max-w-40"
                    >
                        <option value="">All</option>
                        {siteOptions.map((site) => (
                            <option key={site} value={site}>
                                {site}
                            </option>
                        ))}
                    </select>
                </div>
            )
        },
        cell: (info) => (
            <span className="font-medium font-mono text-md text-gray-900">
                {info.getValue() ?? '—'}
            </span>
        ),
        filterFn: (row, columnId, filterValue) => {
            if (!filterValue) return true
            return row.getValue(columnId) === filterValue
        },
    }),
    columnHelper.accessor('systemName', {
        header: ({ column, table }) => {
            const systemOptions = ((table.options.meta as any)?.systemOptions ?? []) as string[]

            return (
                <div className="flex flex-col gap-1">
                    <span>System</span>
                    <select
                        value={(column.getFilterValue() ?? '') as string}
                        onChange={(e) => column.setFilterValue(e.target.value || undefined)}
                        className="text-xs py-1 px-1.5 border border-primary-200 rounded bg-white text-gray-700 font-normal focus:outline-none focus:border-primary/60 outline-none w-full max-w-32"
                    >
                        <option value="">All</option>
                        {systemOptions.map((system) => (
                            <option key={system} value={system}>
                                {system}
                            </option>
                        ))}
                    </select>
                </div>
            )
        },
        cell: (info) => info.getValue() ?? '—',
        filterFn: (row, columnId, filterValue) => {
            if (!filterValue) return true
            return row.getValue(columnId) === filterValue
        },
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
        header: ({ column }) => (
            <div className="flex flex-col gap-1">
                <span>Completed</span>
                <select
                    value={(column.getFilterValue() ?? 'pending') as string}
                    onChange={(e) =>
                        column.setFilterValue(
                            e.target.value === 'all' ? undefined : e.target.value,
                        )
                    }
                    className="text-xs py-1 px-1.5 border border-primary-200 rounded bg-green-50 text-gray-700 font-normal focus:outline-none focus:border-primary/60 outline-none w-full max-w-26 truncate"
                >
                    <option value="all">All</option>
                    <option value="pending">Pending</option>
                    <option value="completed">Completed</option>
                </select>
            </div>
        ),
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
        filterFn: (row, columnId, filterValue) => {
            if (!filterValue || filterValue === 'all') return true
            const value = row.getValue(columnId)
            if (filterValue === 'pending') return !value
            if (filterValue === 'completed') return !!value
            return true
        },
        size: 100,
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
    const { rows, options } = Route.useLoaderData()
    const navigate = useNavigate({ from: '/pm' })
    const router = useRouter()
    const { user } = useRouteContext({ from: '/_app' })
    const {
        search: globalFilter = '',
        dateFrom = '',
        dateTo = '',
        completedAt = 'pending',
        siteName = '',
        systemName = '',
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

    const [columnFilters, setColumnFilters] = useState<any[]>([
        ...(completedAt && completedAt !== 'all' ? [{ id: 'completedAt', value: completedAt }] : []),
        ...(siteName ? [{ id: 'siteName', value: siteName }] : []),
        ...(systemName ? [{ id: 'systemName', value: systemName }] : []),
    ])

    const filteredData = useMemo(() => {
        let result = rows

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
    }, [rows, dateFrom, dateTo])

    const [columnResizeMode] = useState<ColumnResizeMode>('onChange')
    const [selectedPmId, setSelectedPmId] = useState<number | null>(null)
    const [showDuplicateDialog, setShowDuplicateDialog] = useState(false)
    const [showNewDialog, setShowNewDialog] = useState(false)
    const [showEditDialog, setShowEditDialog] = useState(false)
    const [duplicateDate, setDuplicateDate] = useState('')
    const [duplicateError, setDuplicateError] = useState<string | null>(null)
    const [newPmError, setNewPmError] = useState<string | null>(null)
    const [editPmError, setEditPmError] = useState<string | null>(null)
    const [showReopenDialog, setShowReopenDialog] = useState(false)
    const [newAssetId, setNewAssetId] = useState<number | ''>('')
    const [newSystemId, setNewSystemId] = useState<number | ''>('')
    const [newIntervalMonths, setNewIntervalMonths] = useState<number | ''>('')
    const [newStartAt, setNewStartAt] = useState<string>('')
    const [newEngineerId, setNewEngineerId] = useState<number | ''>('')
    const [editAssetId, setEditAssetId] = useState<number | ''>('')
    const [editSystemId, setEditSystemId] = useState<number | ''>('')
    const [editIntervalMonths, setEditIntervalMonths] = useState<number | ''>('')
    const [editStartAt, setEditStartAt] = useState<string>('')
    const [editEngineerId, setEditEngineerId] = useState<number | ''>('')

    const siteOptions = useMemo(
        () =>
            Array.from(new Set(rows.map((row) => row.siteName).filter((v): v is string => !!v))).sort(
                (a, b) => a.localeCompare(b),
            ),
        [rows],
    )

    const systemOptions = useMemo(
        () =>
            Array.from(new Set(rows.map((row) => row.systemName).filter((v): v is string => !!v))).sort(
                (a, b) => a.localeCompare(b),
            ),
        [rows],
    )

    const table = useReactTable({
        data: filteredData,
        columns,
        state: { globalFilter, columnFilters },
        initialState: { pagination: { pageSize: 20 } },
        onGlobalFilterChange: setGlobalFilter,
        onColumnFiltersChange: (updater) => {
            setColumnFilters(updater)
            const newFilters = typeof updater === 'function' ? updater(columnFilters) : updater
            const newCompletedAt = newFilters.find((f: any) => f.id === 'completedAt')?.value as
                | 'pending'
                | 'completed'
                | 'all'
                | undefined
            const newSiteName = newFilters.find((f: any) => f.id === 'siteName')?.value as
                | string
                | undefined
            const newSystemName = newFilters.find((f: any) => f.id === 'systemName')?.value as
                | string
                | undefined

            navigate({
                search: (prev: PmSearchParams) => ({
                    ...prev,
                    completedAt: newCompletedAt,
                    siteName: newSiteName,
                    systemName: newSystemName,
                }),
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
            if (!selectedPm) return
            setEditPmError(null)
            setEditAssetId(selectedPm.assetId ?? '')
            setEditSystemId(selectedPm.systemId ?? '')
            setEditIntervalMonths(selectedPm.intervalMonths ?? '')
            setEditStartAt(selectedPm.startAt ? toDateInputValue(new Date(selectedPm.startAt)) : '')
            setEditEngineerId(selectedPm.engineerId ?? '')
            setShowEditDialog(true)
        },
    })

    const { mutate: mutateCreatePm, isPending: isCreatingPm } = useMutation({
        mutationFn: async () => {
            if (!newAssetId || !newSystemId || !newIntervalMonths || !newStartAt) {
                throw new Error('Please complete all required fields')
            }

            return savePm({
                data: {
                    assetId: newAssetId,
                    systemId: newSystemId,
                    intervalMonths: newIntervalMonths,
                    startAt: newStartAt,
                    engineerId: newEngineerId || null,
                },
            })
        },
        onSuccess: async () => {
            setShowNewDialog(false)
            setNewPmError(null)
            setNewAssetId('')
            setNewSystemId('')
            setNewIntervalMonths('')
            setNewStartAt('')
            setNewEngineerId('')
            await router.invalidate()
        },
        onError: (error) => {
            setNewPmError(error instanceof Error ? error.message : 'Unable to create PM')
        },
    })

    const { mutate: mutateUpdatePm, isPending: isUpdatingPm } = useMutation({
        mutationFn: async () => {
            if (!selectedPm) {
                throw new Error('Select a PM record first')
            }
            if (!editAssetId || !editSystemId || !editIntervalMonths || !editStartAt) {
                throw new Error('Please complete all required fields')
            }

            return savePm({
                data: {
                    pmId: selectedPm.id,
                    assetId: editAssetId,
                    systemId: editSystemId,
                    intervalMonths: editIntervalMonths,
                    startAt: editStartAt,
                    engineerId: editEngineerId || null,
                },
            })
        },
        onSuccess: async () => {
            setShowEditDialog(false)
            setEditPmError(null)
            await router.invalidate()
        },
        onError: (error) => {
            setEditPmError(error instanceof Error ? error.message : 'Unable to update PM')
        },
    })

    const handleOpenDuplicateDialog = useCallback(() => {
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
    }, [selectedPm])

    const handleEdit = useCallback(() => {
        if (!selectedPm) {
            return
        }

        if (selectedPm.completedAt) {
            setShowReopenDialog(true)
            return
        }

        setEditPmError(null)
        setEditAssetId(selectedPm.assetId ?? '')
        setEditSystemId(selectedPm.systemId ?? '')
        setEditIntervalMonths(selectedPm.intervalMonths ?? '')
        setEditStartAt(selectedPm.startAt ? toDateInputValue(new Date(selectedPm.startAt)) : '')
        setEditEngineerId(selectedPm.engineerId ?? '')
        setShowEditDialog(true)
    }, [selectedPm])

    const hasSelection = !!selectedPm
    const canManagePm = user?.role === 'admin' || user?.role === 'engineer'
    const canCreatePm = !!newAssetId && !!newSystemId && !!newIntervalMonths && !!newStartAt
    const canUpdatePm = !!editAssetId && !!editSystemId && !!editIntervalMonths && !!editStartAt

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
                            className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15 transition-colors"
                        />
                    </div>

                    <div className="flex items-center gap-2 text-sm">
                        <Calendar size={16} className="text-gray-400" />
                        <input
                            id="pm-date-from"
                            type="date"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                            className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-gray-600 text-sm focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15 transition-colors"
                        />
                        <span className="text-gray-400">to</span>
                        <input
                            id="pm-date-to"
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
                        id="btn-new-pm"
                        disabled={!canManagePm}
                        onClick={() => {
                            setNewPmError(null)
                            setNewAssetId('')
                            setNewSystemId('')
                            setNewIntervalMonths('')
                            setNewStartAt('')
                            setNewEngineerId('')
                            setShowNewDialog(true)
                        }}
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

            <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
                <DialogContent className="sm:max-w-xl">
                    <DialogHeader>
                        <DialogTitle className="text-base font-semibold text-gray-900">
                            New PM
                        </DialogTitle>
                        <DialogDescription className="text-sm text-gray-500 leading-relaxed">
                            Create a new PM header record. PM tasks and completion are handled in the execution workflow.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label htmlFor="pm-new-asset" className="text-sm font-medium text-gray-700">Asset *</label>
                            <select
                                id="pm-new-asset"
                                value={newAssetId}
                                onChange={(e) => setNewAssetId(e.target.value ? Number(e.target.value) : '')}
                                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
                            >
                                <option value="">Select asset</option>
                                {options.assets.map((asset) => (
                                    <option key={asset.id} value={asset.id}>{asset.label}</option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-1.5">
                            <label htmlFor="pm-new-system" className="text-sm font-medium text-gray-700">System *</label>
                            <select
                                id="pm-new-system"
                                value={newSystemId}
                                onChange={(e) => setNewSystemId(e.target.value ? Number(e.target.value) : '')}
                                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
                            >
                                <option value="">Select system</option>
                                {options.systems.map((system) => (
                                    <option key={system.id} value={system.id}>{system.label}</option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-1.5">
                            <label htmlFor="pm-new-interval" className="text-sm font-medium text-gray-700">Interval (months) *</label>
                            <input
                                id="pm-new-interval"
                                type="number"
                                min={1}
                                value={newIntervalMonths}
                                onChange={(e) => setNewIntervalMonths(e.target.value ? Number(e.target.value) : '')}
                                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label htmlFor="pm-new-start" className="text-sm font-medium text-gray-700">Start date *</label>
                            <input
                                id="pm-new-start"
                                type="date"
                                value={newStartAt}
                                onChange={(e) => setNewStartAt(e.target.value)}
                                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
                            />
                        </div>

                        <div className="space-y-1.5 md:col-span-2">
                            <label htmlFor="pm-new-engineer" className="text-sm font-medium text-gray-700">Engineer</label>
                            <select
                                id="pm-new-engineer"
                                value={newEngineerId}
                                onChange={(e) => setNewEngineerId(e.target.value ? Number(e.target.value) : '')}
                                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
                            >
                                <option value="">Unassigned</option>
                                {options.engineers.map((eng) => (
                                    <option key={eng.id} value={eng.id}>{eng.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {newPmError && <p className="text-sm text-red-600">{newPmError}</p>}

                    <DialogFooter>
                        <button
                            onClick={() => setShowNewDialog(false)}
                            className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => mutateCreatePm()}
                            disabled={!canCreatePm || isCreatingPm}
                            className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                            {isCreatingPm ? 'Creating...' : 'Create PM'}
                        </button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
                <DialogContent className="sm:max-w-xl">
                    <DialogHeader>
                        <DialogTitle className="text-base font-semibold text-gray-900">
                            Edit PM
                        </DialogTitle>
                        <DialogDescription className="text-sm text-gray-500 leading-relaxed">
                            Update PM header details. PM tasks and completion are handled in the execution workflow.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label htmlFor="pm-edit-asset" className="text-sm font-medium text-gray-700">Asset *</label>
                            <select
                                id="pm-edit-asset"
                                value={editAssetId}
                                onChange={(e) => setEditAssetId(e.target.value ? Number(e.target.value) : '')}
                                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
                            >
                                <option value="">Select asset</option>
                                {options.assets.map((asset) => (
                                    <option key={asset.id} value={asset.id}>{asset.label}</option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-1.5">
                            <label htmlFor="pm-edit-system" className="text-sm font-medium text-gray-700">System *</label>
                            <select
                                id="pm-edit-system"
                                value={editSystemId}
                                onChange={(e) => setEditSystemId(e.target.value ? Number(e.target.value) : '')}
                                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
                            >
                                <option value="">Select system</option>
                                {options.systems.map((system) => (
                                    <option key={system.id} value={system.id}>{system.label}</option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-1.5">
                            <label htmlFor="pm-edit-interval" className="text-sm font-medium text-gray-700">Interval (months) *</label>
                            <input
                                id="pm-edit-interval"
                                type="number"
                                min={1}
                                value={editIntervalMonths}
                                onChange={(e) => setEditIntervalMonths(e.target.value ? Number(e.target.value) : '')}
                                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label htmlFor="pm-edit-start" className="text-sm font-medium text-gray-700">Start date *</label>
                            <input
                                id="pm-edit-start"
                                type="date"
                                value={editStartAt}
                                onChange={(e) => setEditStartAt(e.target.value)}
                                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
                            />
                        </div>

                        <div className="space-y-1.5 md:col-span-2">
                            <label htmlFor="pm-edit-engineer" className="text-sm font-medium text-gray-700">Engineer</label>
                            <select
                                id="pm-edit-engineer"
                                value={editEngineerId}
                                onChange={(e) => setEditEngineerId(e.target.value ? Number(e.target.value) : '')}
                                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
                            >
                                <option value="">Unassigned</option>
                                {options.engineers.map((eng) => (
                                    <option key={eng.id} value={eng.id}>{eng.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {editPmError && <p className="text-sm text-red-600">{editPmError}</p>}

                    <DialogFooter>
                        <button
                            onClick={() => setShowEditDialog(false)}
                            className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => mutateUpdatePm()}
                            disabled={!canUpdatePm || isUpdatingPm}
                            className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                            {isUpdatingPm ? 'Saving...' : 'Save Changes'}
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
