import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
    useReactTable,
    getCoreRowModel,
    getFilteredRowModel,
    flexRender,
    createColumnHelper,
    type ColumnDef,
} from '@tanstack/react-table'
import {
    Dialog,
    DialogContent,
    DialogFooter,
} from '../../../components/ui/dialog'
import {
    fetchPmExecutionData,
    savePm,
    savePmTaskResult,
    updatePmEngineers,
    updatePmPhysicsHandOver,
    completePmInstance,
    type PmExecutionTaskRow,
} from '../../../data/pm.api'
import { toDateInputValue } from '../format'
import type { TaskStatus } from '../types'

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

export function PmExecutionDialog({
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
    const [scheduledDate, setScheduledDate] = useState('')

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

    const applyStatusForTask = useCallback(
        (task: PmExecutionTaskRow, value: TaskStatus) => {
            if (!pmId) return
            const defaultEngineer =
                selectedEngineerName ?? (currentUserName ? currentUserName : null)
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
        },
        [pmId, selectedEngineerName, currentUserName, saveTaskResultMutation],
    )

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

    const rescheduleMutation = useMutation({
        mutationFn: async (startAt: string) => {
            if (!pmId || !data) throw new Error('PM record is required')
            return savePm({
                data: {
                    pmId,
                    assetId: data.assetId!,
                    systemId: data.systemId!,
                    intervalMonths: data.intervalMonths,
                    startAt,
                    engineerId: data.engineerId,
                },
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
            draftEngineer,
            draftStatus,
            pmId,
            taskIntervalOptions,
            applyStatusForTask,
            saveTaskResultMutation,
            taskColumnHelper,
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
            setScheduledDate(data.startAt ? toDateInputValue(data.startAt) : '')
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
                                    <input
                                        type="date"
                                        value={scheduledDate}
                                        onChange={(e) => setScheduledDate(e.target.value)}
                                        onBlur={() => {
                                            if (!canManagePm || !scheduledDate) return
                                            const currentIso = data.startAt ? toDateInputValue(data.startAt) : ''
                                            if (scheduledDate === currentIso) return
                                            rescheduleMutation.mutate(scheduledDate)
                                        }}
                                        disabled={!canManagePm}
                                        className="w-full bg-white border border-gray-200 rounded-md px-2 py-1 text-base font-semibold text-gray-800 focus:outline-none focus:border-primary/60 disabled:bg-gray-50 disabled:cursor-not-allowed"
                                    />
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
