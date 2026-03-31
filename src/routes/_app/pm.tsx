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
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useDynamicPageSize } from '../../hooks/useDynamicPageSize'
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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { useRouteContext } from '@tanstack/react-router'
import { useSetToolbar } from '../../components/ToolbarContext'
import {
    fetchPmRows,
    fetchPmFormOptions,
    savePm,
    duplicatePmInstance,
    reopenPmInstance,
    fetchPmExecutionData,
    savePmTaskResult,
    updatePmEngineers,
    updatePmPhysicsHandOver,
    completePmInstance,
    type PmExecutionTaskRow,
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

const getDefaultDateFrom = () => {
    const date = new Date()
    date.setMonth(date.getMonth() - 13)
    return date.toISOString().slice(0, 10)
}

export const Route = createFileRoute('/_app/pm')({
    validateSearch: (search: Record<string, unknown>): PmSearchParams => ({
        search: typeof search.search === 'string' ? search.search : undefined,
        dateFrom: typeof search.dateFrom === 'string' ? search.dateFrom : getDefaultDateFrom(),
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
    loaderDeps: ({ search }) => ({
        dateFrom: search.dateFrom,
        dateTo: search.dateTo,
    }),
    loader: async ({ deps }) => {
        const [rows, options] = await Promise.all([
            fetchPmRows({ data: { dateFrom: deps.dateFrom, dateTo: deps.dateTo } }),
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
        size: 80,
        enableResizing: false,
    }),
    columnHelper.accessor('serialNumber', {
        header: 'Serial No.',
        cell: (info) => (
            <span className="font-medium font-mono text-md text-gray-900">
                {info.getValue() ?? '—'}
            </span>
        ),
        size: 80,
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
        size: 80,
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
                        timeZone: 'UTC',
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
                        timeZone: 'UTC',
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

type TaskStatus = 'Pass' | 'Fail' | 'N/A'

function FindingsTextArea({
    initialValue,
    disabled,
    onBlurSave,
}: {
    initialValue: string
    disabled: boolean
    onBlurSave: (value: string) => void
}) {
    const [text, setText] = useState(initialValue)

    useEffect(() => {
        setText(initialValue)
    }, [initialValue])

    return (
        <textarea
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => onBlurSave(text)}
            disabled={disabled}
            className="w-full max-h-[48px] bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-sm leading-5 text-gray-700 focus:outline-none focus:border-primary/60 resize-y"
            placeholder="Add findings..."
        />
    )
}

function PmExecutionDialog({
    pmId,
    open,
    onOpenChange,
    engineers,
    currentUserName,
    canManagePm,
    onSaved,
}: {
    pmId: number | null
    open: boolean
    onOpenChange: (open: boolean) => void
    engineers: Array<{ id: number; label: string }>
    currentUserName: string
    canManagePm: boolean
    onSaved: () => Promise<void> | void
}) {
    const queryClient = useQueryClient()
    const [draftEngineer, setDraftEngineer] = useState<Record<number, string>>({})
    const [draftStatus, setDraftStatus] = useState<Record<number, TaskStatus | ''>>({})
    const [assignedEngineerIds, setAssignedEngineerIds] = useState<number[]>([])
    const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null)
    const [selectedEngineerId, setSelectedEngineerId] = useState<number | null>(null)
    const [taskColumnFilters, setTaskColumnFilters] = useState<any[]>([])
    const [physicsHandOverText, setPhysicsHandOverText] = useState('')

    const { data, isLoading, refetch } = useQuery({
        queryKey: ['pm-execution', pmId],
        enabled: open && !!pmId,
        queryFn: async () =>
            fetchPmExecutionData({
                data: { pmId: pmId as number },
            }),
    })

    const taskRows = data?.tasks ?? []
    const taskIntervalOptions = useMemo(
        () =>
            Array.from(new Set(taskRows.map((row) => row.intervalMonths)))
                .sort((a, b) => a - b),
        [taskRows],
    )

    const completedTasks = useMemo(
        () => taskRows.filter((row) => !!row.status).length,
        [taskRows],
    )

    const selectedEngineerName = useMemo(
        () => engineers.find((eng) => eng.id === selectedEngineerId)?.label ?? null,
        [engineers, selectedEngineerId],
    )

    const taskById = useMemo(
        () => new Map(taskRows.map((row) => [row.taskId, row])),
        [taskRows],
    )

    const applyStatusForTask = (task: PmExecutionTaskRow, value: TaskStatus) => {
        if (!pmId) return
        const defaultEngineer =
            selectedEngineerName ??
            (currentUserName ? currentUserName : null)
        setDraftStatus((prev) => ({
            ...prev,
            [task.taskId]: value,
        }))
        setDraftEngineer((prev) => ({
            ...prev,
            [task.taskId]: defaultEngineer ?? '',
        }))
        saveTaskResultMutation.mutate({
            pmInstanceId: pmId,
            taskId: task.taskId,
            status: value,
            findings: task.findings ?? null,
            engineer: defaultEngineer,
        })
    }

    const saveTaskResultMutation = useMutation({
        mutationFn: async (payload: {
            pmInstanceId: number
            taskId: number
            status: TaskStatus
            findings: string | null
            engineer: string | null
        }) => savePmTaskResult({ data: payload }),
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['pm-execution', pmId] })
            await onSaved()
        },
    })

    const updateEngineersMutation = useMutation({
        mutationFn: async (engineerIds: number[]) => {
            if (!pmId) throw new Error('PM record is required')
            return updatePmEngineers({ data: { pmId, engineerIds } })
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['pm-execution', pmId] })
            await onSaved()
        },
    })

    const completeMutation = useMutation({
        mutationFn: async () => {
            if (!pmId) throw new Error('PM record is required')
            return completePmInstance({ data: { pmId } })
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['pm-execution', pmId] })
            await onSaved()
            await refetch()
        },
    })

    const updatePhysicsHandOverMutation = useMutation({
        mutationFn: async (value: string) => {
            if (!pmId) throw new Error('PM record is required')
            return updatePmPhysicsHandOver({
                data: { pmId, physicsHandOver: value },
            })
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['pm-execution', pmId] })
            await onSaved()
        },
    })

    const taskColumnHelper = createColumnHelper<PmExecutionTaskRow>()
    const taskColumns = useMemo<ColumnDef<PmExecutionTaskRow, any>[]>(
        () => [
            taskColumnHelper.accessor('intervalMonths', {
                header: ({ column }) => (
                    <div className="w-8 flex flex-col gap-1">
                        <span>Months</span>
                        <select
                            value={(column.getFilterValue() ?? '') as string}
                            onChange={(e) =>
                                column.setFilterValue(e.target.value || undefined)
                            }
                            className="w-12 text-[11px] py-1 px-1.5 border border-primary-200 rounded bg-white text-gray-700 font-normal focus:outline-none focus:border-primary/60"
                        >
                            <option value="">All</option>
                            {taskIntervalOptions.map((months) => (
                                <option key={months} value={String(months)}>
                                    {months}
                                </option>
                            ))}
                        </select>
                    </div>
                ),
                cell: (info) => (
                    <span className="text-sm font-semibold text-gray-900">{info.getValue()}m</span>
                ),
                filterFn: (row, columnId, filterValue) => {
                    if (!filterValue) return true
                    return String(row.getValue(columnId)) === String(filterValue)
                },
               size: 50, 
            }),
            taskColumnHelper.accessor('docSection', {
                header: 'Section',
                cell: (info) => info.getValue() ?? '—',
                size: 100,
            }),
            taskColumnHelper.accessor('instruction', {
                header: 'Task',
                cell: (info) => (
                    <span className="whitespace-normal break-words text-sm font-semibold text-gray-900">
                        {info.getValue()}
                    </span>
                ),
                size: 220,
            }),
            taskColumnHelper.display({
                id: 'status',
                header: 'Status',
                cell: ({ row }) => {
                    const status = draftStatus[row.original.taskId] ?? row.original.status ?? ''
                    return (
                        <select
                            value={status}
                            onChange={(e) => {
                                const value = e.target.value as TaskStatus
                                if (!value) return
                                applyStatusForTask(row.original, value)
                            }}
                            disabled={!canManagePm}
                            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:border-primary/60"
                        >
                            <option value="">Select</option>
                            <option value="Pass">Pass</option>
                            <option value="Fail">Fail</option>
                            <option value="N/A">N/A</option>
                        </select>
                    )
                },
                size: 110,
            }),
            taskColumnHelper.display({
                id: 'findings',
                header: 'Findings',
                cell: ({ row }) => {
                    const effectiveStatus = draftStatus[row.original.taskId] ?? row.original.status
                    return (
                        <FindingsTextArea
                            initialValue={row.original.findings ?? ''}
                            disabled={!canManagePm}
                            onBlurSave={(nextText) => {
                                if (!pmId || !effectiveStatus) return
                                saveTaskResultMutation.mutate({
                                    pmInstanceId: pmId,
                                    taskId: row.original.taskId,
                                    status: effectiveStatus,
                                    findings: nextText || null,
                                    engineer:
                                        draftEngineer[row.original.taskId] ??
                                        row.original.engineer ??
                                        null,
                                })
                            }}
                        />
                    )
                },
                size: 160,
            }),
            taskColumnHelper.display({
                id: 'engineer',
                header: 'Engineer',
                cell: ({ row }) => {
                    const value =
                        draftEngineer[row.original.taskId] ??
                        row.original.engineer
                    return (
                        <span className="inline-block w-full px-2 py-1.5 text-sm font-medium text-gray-800 bg-gray-100 border border-gray-200 rounded-lg">
                            {value || '—'}
                        </span>
                    )
                },
                size: 160,
            }),
            taskColumnHelper.accessor('category', {
                header: 'Category',
                cell: (info) => info.getValue() ?? '—',
                size: 100,
            }),
        ],
        [
            canManagePm,
            currentUserName,
            draftEngineer,
            draftStatus,
            pmId,
            selectedEngineerName,
            taskIntervalOptions,
            applyStatusForTask,
        ],
    )

    const taskTable = useReactTable({
        data: taskRows,
        columns: taskColumns,
        state: { columnFilters: taskColumnFilters },
        onColumnFiltersChange: setTaskColumnFilters,
        getCoreRowModel: getCoreRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
    })

    const toggleEngineer = (engineerId: number) => {
        if (!canManagePm) return
        const next = assignedEngineerIds.includes(engineerId)
            ? assignedEngineerIds.filter((id) => id !== engineerId)
            : [...assignedEngineerIds, engineerId]
        setAssignedEngineerIds(next)
        updateEngineersMutation.mutate(next)
    }

    useEffect(() => {
        if (data) {
            setAssignedEngineerIds(data.assignedEngineerIds)
            setPhysicsHandOverText(data.physicsHandOver)
            const nextDraftStatus: Record<number, TaskStatus | ''> = {}
            for (const task of data.tasks) {
                nextDraftStatus[task.taskId] = task.status ?? ''
            }
            setDraftStatus(nextDraftStatus)
            if (data.tasks.length > 0) {
                setSelectedTaskId((prev) => prev ?? data.tasks[0].taskId)
            }
        }
    }, [data])

    useEffect(() => {
        setSelectedEngineerId(null)
    }, [pmId, open])

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-7xl h-[88vh] flex flex-col">
                {isLoading || !data ? (
                    <div className="flex-1 min-h-0 grid place-items-center text-sm text-gray-500">
                        Loading PM execution data...
                    </div>
                ) : (
                    <div className="flex-1 min-h-0 flex flex-col gap-2">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
                            <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-2 rounded-lg border border-gray-200 bg-gray-50 p-2">
                                <div className="space-y-0.5">
                                    <p className="text-base text-gray-500">Asset</p>
                                    <p className="text-base font-semibold text-gray-800">{data.serialNumber ?? '—'}</p>
                                </div>
                                <div className="space-y-0.5">
                                    <p className="text-base text-gray-500">Site</p>
                                    <p className="text-base font-semibold text-gray-800">{data.siteName ?? '—'}</p>
                                </div>
                                <div className="space-y-0.5">
                                    <p className="text-base text-gray-500">System</p>
                                    <p className="text-base font-semibold text-gray-800">{data.systemName ?? '—'}</p>
                                </div>
                                <div className="space-y-0.5">
                                    <p className="text-base text-gray-500">Interval</p>
                                    <p className="text-base font-semibold text-gray-800">{data.intervalMonths} months</p>
                                </div>
                                <div className="space-y-0.5">
                                    <p className="text-base text-gray-500">Scheduled</p>
                                    <p className="text-base font-semibold text-gray-800">{new Date(data.startAt).toLocaleDateString('en-GB', { timeZone: 'UTC' })}</p>
                                </div>
                                <div className="space-y-0.5">
                                    <p className="text-base text-gray-500">Status</p>
                                    <p className="text-base font-semibold text-gray-800">{data.completedAt ? 'Completed' : 'Pending'}</p>
                                </div>
                                <div className="space-y-0.5 md:col-start-3 md:col-span-2">
                                    <p className="text-base text-gray-500">PhysicsHandedOver</p>
                                    <textarea
                                        rows={1}
                                        value={physicsHandOverText}
                                        onChange={(e) => setPhysicsHandOverText(e.target.value)}
                                        onBlur={() => {
                                            const value = physicsHandOverText.trim()
                                            if (!canManagePm || !value || value === data.physicsHandOver) return
                                            updatePhysicsHandOverMutation.mutate(value)
                                        }}
                                        disabled={!canManagePm}
                                        className="w-full min-h-[32px] bg-white border border-gray-200 rounded-md px-2 py-1 text-base leading-5 text-gray-700 focus:outline-none focus:border-primary/60 resize-none"
                                    />
                                </div>
                            </div>

                            <div className="rounded-lg border border-gray-200 overflow-hidden">
                                <div className="px-2 py-1.5 border-b border-gray-200 bg-primary-100">
                                    <p className="text-xs font-semibold text-primary-900 uppercase tracking-wider">Assigned Engineers</p>
                                </div>
                                <div className="max-h-32 overflow-y-auto">
                                <table className="min-w-full">
                                    <thead>
                                        <tr>
                                            <th className="px-2 py-1.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider bg-gray-50 border-b border-gray-200 w-12">Sel</th>
                                            <th className="px-2 py-1.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider bg-gray-50 border-b border-gray-200">Engineer</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {engineers.map((engineer) => (
                                            <tr
                                                key={engineer.id}
                                                onClick={() => setSelectedEngineerId(engineer.id)}
                                                className={`cursor-pointer transition-colors ${
                                                    selectedEngineerId === engineer.id
                                                        ? 'bg-primary/10'
                                                        : 'hover:bg-gray-50'
                                                }`}
                                            >
                                                <td className="px-2 py-1.5 text-xs">
                                                    <input
                                                        type="checkbox"
                                                        checked={assignedEngineerIds.includes(engineer.id)}
                                                        onClick={(e) => e.stopPropagation()}
                                                        onChange={() => toggleEngineer(engineer.id)}
                                                        disabled={!canManagePm || updateEngineersMutation.isPending}
                                                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                                    />
                                                </td>
                                                <td className="px-2 py-1.5 text-xs text-gray-700">{engineer.label}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                </div>
                            </div>
                        </div>

                        <div
                            className="flex-1 min-h-0 rounded-lg border border-gray-200 overflow-auto focus:outline-none focus:ring-2 focus:ring-primary/20"
                            tabIndex={0}
                            onKeyDownCapture={(e) => {
                                if (!canManagePm) return

                                const target = e.target as HTMLElement
                                const tag = target.tagName
                                const isTypingElement =
                                    tag === 'INPUT' ||
                                    tag === 'TEXTAREA' ||
                                    tag === 'SELECT' ||
                                    target.isContentEditable

                                const visibleRows = taskTable.getRowModel().rows
                                if (visibleRows.length === 0) return

                                if (!isTypingElement && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
                                    const currentIndex = selectedTaskId
                                        ? visibleRows.findIndex((row) => row.original.taskId === selectedTaskId)
                                        : 0
                                    const safeCurrentIndex = currentIndex >= 0 ? currentIndex : 0
                                    const nextIndex = e.key === 'ArrowDown'
                                        ? Math.min(safeCurrentIndex + 1, visibleRows.length - 1)
                                        : Math.max(safeCurrentIndex - 1, 0)
                                    const nextTaskId = visibleRows[nextIndex]?.original.taskId
                                    if (!nextTaskId) return

                                    e.preventDefault()
                                    setSelectedTaskId(nextTaskId)

                                    const rowEl = (e.currentTarget as HTMLElement).querySelector(
                                        'tr[data-task-id="' + nextTaskId + '"]',
                                    ) as HTMLElement | null
                                    rowEl?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
                                    return
                                }

                                if (isTypingElement) return
                                if (e.key !== ' ' && e.code !== 'Space') return

                                if (!selectedTaskId) return
                                const task = taskById.get(selectedTaskId)
                                if (!task) return

                                e.preventDefault()
                                applyStatusForTask(task, 'Pass')
                            }}
                        >
                            <table className="min-w-full" style={{ width: taskTable.getTotalSize() }}>
                                <thead>
                                    {taskTable.getHeaderGroups().map((headerGroup) => (
                                        <tr key={headerGroup.id}>
                                            {headerGroup.headers.map((header) => (
                                                <th
                                                    key={header.id}
                                                    className="px-3 py-2 text-left text-xs font-semibold text-primary-900 uppercase tracking-wider bg-primary-100 border-b border-primary-200/50"
                                                    style={{ width: header.getSize() }}
                                                >
                                                    {header.isPlaceholder
                                                        ? null
                                                        : flexRender(header.column.columnDef.header, header.getContext())}
                                                </th>
                                            ))}
                                        </tr>
                                    ))}
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {taskTable.getRowModel().rows.map((row) => (
                                        <tr
                                            key={row.id}
                                            data-task-id={row.original.taskId}
                                            onClick={() => setSelectedTaskId(row.original.taskId)}
                                            onFocusCapture={() => setSelectedTaskId(row.original.taskId)}
                                            className={`hover:bg-gray-50 ${
                                                selectedTaskId === row.original.taskId
                                                    ? 'bg-primary/10'
                                                    : ''
                                            }`}
                                        >
                                            {row.getVisibleCells().map((cell) => (
                                                <td
                                                    key={cell.id}
                                                    className="px-3 py-2 text-xs text-gray-600 align-top"
                                                    style={{ width: cell.column.getSize() }}
                                                >
                                                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                    </div>
                )}

                <DialogFooter className="pt-2 border-t border-gray-100 mt-2 shrink-0">
                    <span className="mr-auto text-xs text-gray-500">
                        {completedTasks}/{taskRows.length} tasks with status
                    </span>
                    <button
                        onClick={() => onOpenChange(false)}
                        className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 transition-colors"
                    >
                        Close
                    </button>
                    <button
                        onClick={() => completeMutation.mutate()}
                        disabled={!canManagePm || !!data?.completedAt || completeMutation.isPending}
                        className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                        {completeMutation.isPending ? 'Completing...' : data?.completedAt ? 'Completed' : 'Complete PM'}
                    </button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
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
    const [showExecutionDialog, setShowExecutionDialog] = useState(false)
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

    const { containerRef, pageSize } = useDynamicPageSize()
    const [pageIndex, setPageIndex] = useState(0)

    const table = useReactTable({
        data: rows,
        columns,
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
                    | 'pending'
                    | 'completed'
                    | 'all'
                    | undefined
                const rawSiteName = next.find((f: any) => f.id === 'siteName')?.value as
                    | string
                    | undefined
                const rawSystemName = next.find((f: any) => f.id === 'systemName')?.value as
                    | string
                    | undefined

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
                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white shadow-sm hover:bg-primary-dark disabled:opacity-30 disabled:cursor-not-allowed transition-all w-32 whitespace-nowrap"
                    >
                        <PlusCircle size={16} />
                        New
                    </button>
                    <button
                        id="btn-execute-pm"
                        disabled={!hasSelection || !canManagePm}
                        onClick={() => setShowExecutionDialog(true)}
                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-white text-gray-600 border border-gray-200 shadow-sm hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all w-32 whitespace-nowrap"
                    >
                        <CheckCircle2 size={16} />
                        Execute
                    </button>
                    <button
                        id="btn-edit-pm"
                        disabled={!hasSelection || !canManagePm}
                        onClick={handleEdit}
                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-white text-gray-600 border border-gray-200 shadow-sm hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all w-32 whitespace-nowrap"
                    >
                        <Pencil size={16} />
                        Edit
                    </button>
                    <button
                        id="btn-duplicate-pm"
                        disabled={!hasSelection || !canManagePm}
                        onClick={handleOpenDuplicateDialog}
                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-white text-gray-600 border border-gray-200 shadow-sm hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all w-32 whitespace-nowrap"
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
            <PmExecutionDialog
                pmId={selectedPmId}
                open={showExecutionDialog}
                onOpenChange={setShowExecutionDialog}
                engineers={options.engineers}
                currentUserName={user?.name ?? ''}
                canManagePm={canManagePm}
                onSaved={async () => {
                    await router.invalidate()
                }}
            />

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
