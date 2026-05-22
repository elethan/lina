import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import {
    createColumnHelper,
    flexRender,
    getCoreRowModel,
    useReactTable,
} from '@tanstack/react-table'
import { CheckCircle2, Clock, Play, UserPlus, XCircle } from 'lucide-react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '../../../components/ui/dialog'
import {
    closeWorkOrder,
    createDowntimeEvent,
    fetchDowntimeByWoId,
    fetchWorkOrderNotes,
    fetchWorkOrderSystemsByAsset,
    reopenWorkOrder,
    startWorkOrder,
    updateDowntimeEvent,
    updateWorkOrderSystem,
    type WorkOrderRow,
    type WorkOrderSystemOption,
} from '../../../data/workorders.api'
import { assignWorkOrdersToEngineer } from '../../../data/engineers.api'
import { toLocalDatetime } from '../format'
import { HydratedDateText } from '../../../components/HydratedDateText'
import { EditableNoteCell } from './EditableNoteCell'
import { AddNoteDialog } from './AddNoteDialog'

export function WorkOrderExecutionDialog({
    wo,
    open,
    onOpenChange,
    engineers,
    currentUserId,
    currentUserName,
    canUpdateWorkOrders,
    onCloseComplete,
}: {
    wo: WorkOrderRow | null
    open: boolean
    onOpenChange: (open: boolean) => void
    engineers: { id: number; name: string; userId: string | null }[]
    currentUserId: string | null
    currentUserName: string | null
    canUpdateWorkOrders: boolean
    onCloseComplete: () => void
}) {
    const [showAddNote, setShowAddNote] = useState(false)
    const [showCloseConfirmDialog, setShowCloseConfirmDialog] = useState(false)
    const canAssignEngineer = canUpdateWorkOrders

    const defaultEngineerId: number =
        wo?.engineerId ??
        engineers.find((e) => currentUserId && e.userId === currentUserId)?.id ??
        engineers.find(
            (e) =>
                currentUserName &&
                e.name.toLowerCase().includes(currentUserName.split(' ')[0]?.toLowerCase() ?? ''),
        )?.id ??
        engineers[0]?.id ??
        0

    const [displayStartAt, setDisplayStartAt] = useState<string | null>(wo?.startAt ?? null)
    const [displayEndAt, setDisplayEndAt] = useState<string | null>(wo?.endAt ?? null)
    const [displayStatus, setDisplayStatus] = useState<string>(wo?.status ?? 'Open')
    const [displaySystemId, setDisplaySystemId] = useState<number | null>(wo?.systemId ?? null)
    const [displaySystemName, setDisplaySystemName] = useState<string | null>(wo?.systemName ?? null)
    const isClosedWorkOrder = displayStatus === 'Closed'
    const [showStartAssignDialog, setShowStartAssignDialog] = useState(false)
    const [startEngineerId, setStartEngineerId] = useState<number>(
        defaultEngineerId > 0 ? defaultEngineerId : engineers[0]?.id ?? 0,
    )
    const [startAssignError, setStartAssignError] = useState<string | null>(null)

    useEffect(() => {
        setDisplayStartAt(wo?.startAt ?? null)
        setDisplayEndAt(wo?.endAt ?? null)
        setDisplayStatus(wo?.status ?? 'Open')
        setDisplaySystemId(wo?.systemId ?? null)
        setDisplaySystemName(wo?.systemName ?? null)
        setShowCloseConfirmDialog(false)
        setShowStartAssignDialog(false)
        setStartAssignError(null)
        setStartEngineerId(defaultEngineerId > 0 ? defaultEngineerId : engineers[0]?.id ?? 0)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [wo?.id])

    useEffect(() => {
        if (!open) {
            setShowCloseConfirmDialog(false)
            setShowStartAssignDialog(false)
            setShowAddNote(false)
            setStartAssignError(null)
        }
    }, [open])

    const router = useRouter()
    const startWoMutation = useMutation({
        mutationFn: async () => await startWorkOrder({ data: { woId: wo!.id } }),
        onSuccess: (result) => {
            setDisplayStartAt(result.startAt)
            router.invalidate()
        },
        onError: (err: Error) => {
            alert(err.message || 'Failed to start work order')
        },
    })

    const startWithEngineerMutation = useMutation({
        mutationFn: async (engineerId: number) => {
            if (!wo?.id) {
                throw new Error(
                    'Work Order context was lost. Close and reopen the Work Order dialog, then try again.',
                )
            }
            await assignWorkOrdersToEngineer({ data: { woIds: [wo!.id], engineerId } })
            return await startWorkOrder({ data: { woId: wo!.id } })
        },
        onSuccess: (result) => {
            setStartAssignError(null)
            setDisplayStartAt(result.startAt)
            setShowStartAssignDialog(false)
            router.invalidate()
        },
        onError: (err: Error) => {
            setStartAssignError(err.message || 'Failed to assign engineer and start work order')
        },
    })

    const requiresStartEngineerSelection = !!(
        canAssignEngineer &&
        open &&
        wo &&
        !isClosedWorkOrder &&
        !wo.startAt &&
        !displayStartAt &&
        !wo.engineerId
    )

    useEffect(() => {
        if (requiresStartEngineerSelection) {
            setShowStartAssignDialog(true)
        }
    }, [requiresStartEngineerSelection])

    const autoStartedRef = useRef(false)
    useEffect(() => {
        if (
            open &&
            wo &&
            !isClosedWorkOrder &&
            !wo.startAt &&
            !displayStartAt &&
            !requiresStartEngineerSelection &&
            !autoStartedRef.current
        ) {
            autoStartedRef.current = true
            startWoMutation.mutate()
        }
        if (!open) {
            autoStartedRef.current = false
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, wo?.id, displayStartAt, requiresStartEngineerSelection, isClosedWorkOrder])

    const { data: notes, refetch } = useQuery({
        queryKey: ['wo-notes', wo?.id],
        queryFn: () => (wo ? fetchWorkOrderNotes({ data: { woId: wo.id } }) : Promise.resolve([])),
        enabled: !!wo && open,
    })

    const { data: downtimeData, refetch: refetchDowntime } = useQuery({
        queryKey: ['wo-downtime', wo?.id],
        queryFn: () => (wo ? fetchDowntimeByWoId({ data: { woId: wo.id } }) : Promise.resolve([])),
        enabled: !!wo && open,
    })
    const { data: rawSystemOptions, isLoading: isLoadingSystemOptions } = useQuery({
        queryKey: ['wo-systems-by-asset', wo?.assetId],
        queryFn: () =>
            wo?.assetId
                ? fetchWorkOrderSystemsByAsset({ data: { assetId: wo.assetId } })
                : Promise.resolve([] as WorkOrderSystemOption[]),
        enabled: !!wo?.assetId && open,
    })
    const downtimeEvent = downtimeData?.[0] ?? null

    const systemOptions = useMemo(() => {
        const options = rawSystemOptions ?? []
        if (displaySystemId && !options.some((option) => option.systemId === displaySystemId)) {
            return [
                {
                    systemId: displaySystemId,
                    systemName: displaySystemName ?? `System ${displaySystemId}`,
                },
                ...options,
            ]
        }
        return options
    }, [rawSystemOptions, displaySystemId, displaySystemName])

    const [dtStartAt, setDtStartAt] = useState('')
    const [dtEndAt, setDtEndAt] = useState('')
    const [showDowntimeForm, setShowDowntimeForm] = useState(false)

    const handleDateTimeChangeAndClose = (
        event: ChangeEvent<HTMLInputElement>,
        onChange: (value: string) => void,
    ) => {
        onChange(event.target.value)
        event.currentTarget.blur()
    }

    useEffect(() => {
        if (downtimeEvent) {
            setDtStartAt(downtimeEvent.startAt ? toLocalDatetime(downtimeEvent.startAt) : '')
            setDtEndAt(downtimeEvent.endAt ? toLocalDatetime(downtimeEvent.endAt) : '')
            setShowDowntimeForm(false)
        } else {
            setDtStartAt('')
            setDtEndAt('')
            setShowDowntimeForm(false)
        }
    }, [downtimeEvent?.id, downtimeEvent?.endAt])

    const createDtMutation = useMutation({
        mutationFn: async (vals: { startAt: string; endAt?: string }) =>
            await createDowntimeEvent({
                data: {
                    assetId: wo!.assetId!,
                    systemId: (displaySystemId ?? wo!.systemId)!,
                    woId: wo!.id,
                    ...vals,
                },
            }),
        onSuccess: () => {
            refetchDowntime()
            setShowDowntimeForm(false)
        },
    })

    const updateDtMutation = useMutation({
        mutationFn: async (vals: { id: number; endAt?: string }) =>
            await updateDowntimeEvent({ data: vals }),
        onSuccess: () => refetchDowntime(),
    })

    const updateSystemMutation = useMutation({
        mutationFn: async (payload: {
            systemId: number
            previousSystemId: number | null
            previousSystemName: string | null
        }) => await updateWorkOrderSystem({ data: { woId: wo!.id, systemId: payload.systemId } }),
        onSuccess: (result) => {
            setDisplaySystemId(result.systemId)
            setDisplaySystemName(result.systemName)
            router.invalidate()
        },
        onError: (err: Error, payload) => {
            setDisplaySystemId(payload.previousSystemId)
            setDisplaySystemName(payload.previousSystemName)
            alert(err.message || 'Failed to update work order system')
        },
    })

    const notesColumnHelper = createColumnHelper<any>()
    const notesColumns = useMemo(
        () => [
            notesColumnHelper.accessor('createdAt', {
                header: 'Date',
                cell: (info) => <HydratedDateText value={info.getValue()} />,
                size: 140,
            }),
            notesColumnHelper.accessor('engineerName', {
                header: 'Engineer',
                cell: (info) => info.getValue() || <span className="text-gray-400 italic">Unknown</span>,
                size: 150,
            }),
            notesColumnHelper.accessor('noteText', {
                header: 'Note',
                cell: (info) => (
                    <EditableNoteCell
                        noteId={info.row.original.id}
                        value={info.getValue()}
                        onSave={refetch}
                        editable={canUpdateWorkOrders}
                    />
                ),
                size: 400,
            }),
        ],
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [refetch, canUpdateWorkOrders],
    )

    const notesTable = useReactTable({
        data: notes || [],
        columns: notesColumns,
        getCoreRowModel: getCoreRowModel(),
    })

    const closeWoMutation = useMutation({
        mutationFn: async () => await closeWorkOrder({ data: { woId: wo!.id } }),
        onSuccess: (result) => {
            setDisplayEndAt(result.endAt)
            setDisplayStatus('Closed')
            setShowCloseConfirmDialog(false)
            router.invalidate()
            onCloseComplete()
        },
        onError: (err: Error) => {
            if (err.message.includes('downtime end time')) {
                alert('Cannot close: please record downtime end time first.')
            } else {
                alert(err.message || 'Failed to close work order')
            }
        },
    })

    const reopenWoMutation = useMutation({
        mutationFn: async () => await reopenWorkOrder({ data: { woId: wo!.id } }),
        onSuccess: (result) => {
            setDisplayStatus(result.status)
            setDisplayEndAt(null)
            setShowCloseConfirmDialog(false)
            router.invalidate()
        },
        onError: (err: Error) => {
            alert(err.message || 'Failed to reopen work order')
        },
    })

    if (!wo) return null

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
                    <DialogHeader className="px-6 py-4 border-b border-gray-100 bg-gray-50 shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 shrink-0">
                                <Play size={20} className="text-primary" />
                            </div>
                            <div>
                                <DialogTitle className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                                    WO-{String(wo.id).padStart(4, '0')} Execution
                                </DialogTitle>
                                <DialogDescription className="text-sm text-gray-500 mt-1">
                                    {wo.siteName} &middot;{' '}
                                    {displaySystemName ?? wo.systemName ?? 'No System'} &middot;{' '}
                                    {wo.serialNumber || 'No Serial'}
                                </DialogDescription>
                            </div>
                        </div>
                    </DialogHeader>

                    <div className="flex-1 overflow-auto bg-white p-6 flex flex-col gap-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-gray-50 p-4 rounded-xl border border-gray-100">
                            <div className="md:col-span-2">
                                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                                    Reported Fault
                                </h4>
                                <p className="text-sm text-gray-800 whitespace-pre-wrap">{wo.description}</p>
                            </div>
                            <div className="flex flex-col gap-3">
                                <div>
                                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                                        System
                                    </h4>
                                    <select
                                        value={displaySystemId ?? ''}
                                        onChange={(e) => {
                                            const nextSystemId = Number(e.target.value)
                                            const nextSystemName =
                                                systemOptions.find((option) => option.systemId === nextSystemId)
                                                    ?.systemName ?? null
                                            const previousSystemId = displaySystemId
                                            const previousSystemName = displaySystemName

                                            setDisplaySystemId(nextSystemId)
                                            setDisplaySystemName(nextSystemName)

                                            updateSystemMutation.mutate({
                                                systemId: nextSystemId,
                                                previousSystemId,
                                                previousSystemName,
                                            })
                                        }}
                                        disabled={
                                            !canUpdateWorkOrders ||
                                            updateSystemMutation.isPending ||
                                            systemOptions.length === 0
                                        }
                                        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:bg-gray-100 disabled:text-gray-500"
                                    >
                                        {isLoadingSystemOptions && systemOptions.length === 0 ? (
                                            <option value="">Loading systems...</option>
                                        ) : systemOptions.length === 0 ? (
                                            <option value="">No systems available</option>
                                        ) : null}
                                        {systemOptions.map((option) => (
                                            <option key={option.systemId} value={option.systemId}>
                                                {option.systemName}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                                        Start Date
                                    </h4>
                                    <p className="text-sm text-gray-800 font-medium">
                                        {displayStartAt ? (
                                            <HydratedDateText value={displayStartAt} />
                                        ) : (
                                            <span className="text-gray-400 italic">Not started</span>
                                        )}
                                    </p>
                                </div>
                                <div>
                                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                                        End Date
                                    </h4>
                                    <p className="text-sm text-gray-800 font-medium">
                                        {displayEndAt ? (
                                            <HydratedDateText value={displayEndAt} />
                                        ) : (
                                            <span className="text-gray-400 italic">In progress</span>
                                        )}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="bg-amber-50/50 p-4 rounded-xl border border-amber-200/60">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <Clock size={16} className="text-amber-600" />
                                    <h4 className="text-xs font-semibold text-amber-800 uppercase tracking-wider">
                                        System Downtime
                                    </h4>
                                </div>
                                {!downtimeEvent && !showDowntimeForm && displayStatus !== 'Closed' && (
                                    <button
                                        onClick={() => setShowDowntimeForm(true)}
                                        disabled={!canUpdateWorkOrders}
                                        className="text-xs font-medium text-amber-700 hover:text-amber-900 underline underline-offset-2 transition-colors"
                                    >
                                        Record Downtime
                                    </button>
                                )}
                            </div>

                            {downtimeEvent ? (
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                    <div>
                                        <label className="text-xs font-medium text-gray-500">Down Since</label>
                                        <p className="text-sm text-gray-800 font-medium mt-0.5">
                                            <HydratedDateText value={downtimeEvent.startAt} />
                                        </p>
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-gray-500">Restored At</label>
                                        {downtimeEvent.endAt ? (
                                            <p className="text-sm text-gray-800 font-medium mt-0.5">
                                                <HydratedDateText value={downtimeEvent.endAt} />
                                            </p>
                                        ) : displayStatus !== 'Closed' ? (
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <input
                                                    type="datetime-local"
                                                    value={dtEndAt}
                                                    onChange={(e) => handleDateTimeChangeAndClose(e, setDtEndAt)}
                                                    disabled={!canUpdateWorkOrders}
                                                    className="text-sm border border-gray-300 rounded-md py-1 px-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
                                                />
                                                <button
                                                    onClick={() => {
                                                        if (!dtEndAt) return
                                                        updateDtMutation.mutate({
                                                            id: downtimeEvent.id,
                                                            endAt: new Date(dtEndAt).toISOString(),
                                                        })
                                                    }}
                                                    disabled={
                                                        !canUpdateWorkOrders || !dtEndAt || updateDtMutation.isPending
                                                    }
                                                    className="text-xs font-medium px-3 py-1.5 bg-primary text-white rounded-md hover:bg-primary-dark disabled:opacity-50 transition-colors"
                                                >
                                                    {updateDtMutation.isPending ? 'Saving...' : 'Save'}
                                                </button>
                                            </div>
                                        ) : (
                                            <p className="text-sm text-amber-600 italic mt-0.5">Not recorded</p>
                                        )}
                                    </div>
                                    {downtimeEvent.endAt && (
                                        <div>
                                            <label className="text-xs font-medium text-gray-500">
                                                Total Downtime
                                            </label>
                                            <p className="text-sm text-gray-800 font-medium mt-0.5">
                                                {(() => {
                                                    const ms =
                                                        new Date(downtimeEvent.endAt).getTime() -
                                                        new Date(downtimeEvent.startAt).getTime()
                                                    const hours = Math.floor(ms / 3600000)
                                                    const mins = Math.floor((ms % 3600000) / 60000)
                                                    return hours >= 24
                                                        ? `${Math.floor(hours / 24)}d ${hours % 24}h ${mins}m`
                                                        : `${hours}h ${mins}m`
                                                })()}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            ) : showDowntimeForm ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-xs font-medium text-gray-500">Down Since</label>
                                        <input
                                            type="datetime-local"
                                            value={dtStartAt}
                                            onChange={(e) => handleDateTimeChangeAndClose(e, setDtStartAt)}
                                            disabled={!canUpdateWorkOrders}
                                            className="w-full text-sm border border-gray-300 rounded-md py-1.5 px-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-medium text-gray-500">
                                            Restored At <span className="text-gray-400">(optional)</span>
                                        </label>
                                        <input
                                            type="datetime-local"
                                            value={dtEndAt}
                                            onChange={(e) => handleDateTimeChangeAndClose(e, setDtEndAt)}
                                            disabled={!canUpdateWorkOrders}
                                            className="w-full text-sm border border-gray-300 rounded-md py-1.5 px-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
                                        />
                                    </div>
                                    <div className="sm:col-span-2 flex gap-2">
                                        <button
                                            onClick={() => {
                                                if (!dtStartAt) {
                                                    alert('Start time is required')
                                                    return
                                                }
                                                createDtMutation.mutate({
                                                    startAt: new Date(dtStartAt).toISOString(),
                                                    endAt: dtEndAt ? new Date(dtEndAt).toISOString() : undefined,
                                                })
                                            }}
                                            disabled={
                                                !canUpdateWorkOrders || !dtStartAt || createDtMutation.isPending
                                            }
                                            className="text-xs font-medium px-4 py-1.5 bg-primary text-white rounded-md hover:bg-primary-dark disabled:opacity-50 transition-colors"
                                        >
                                            {createDtMutation.isPending ? 'Saving...' : 'Save Downtime'}
                                        </button>
                                        <button
                                            onClick={() => {
                                                setShowDowntimeForm(false)
                                                setDtStartAt('')
                                                setDtEndAt('')
                                            }}
                                            className="text-xs font-medium px-4 py-1.5 text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-sm text-gray-500 italic">
                                    No downtime recorded for this work order.
                                </p>
                            )}
                        </div>

                        <div className="flex-1 flex flex-col min-h-[250px] border border-gray-200 rounded-xl overflow-hidden">
                            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                                <h3 className="font-semibold text-gray-800 text-sm">Engineer Notes History</h3>
                                <span className="text-xs text-gray-500 font-medium">
                                    {notes?.length || 0} Entries
                                </span>
                            </div>
                            <div className="flex-1 overflow-auto">
                                <table className="min-w-full">
                                    <thead className="sticky top-0 bg-white z-10 shadow-sm">
                                        {notesTable.getHeaderGroups().map((hg) => (
                                            <tr key={hg.id}>
                                                {hg.headers.map((h) => (
                                                    <th
                                                        key={h.id}
                                                        className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase border-b"
                                                        style={{ width: h.getSize() }}
                                                    >
                                                        {flexRender(h.column.columnDef.header, h.getContext())}
                                                    </th>
                                                ))}
                                            </tr>
                                        ))}
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {notes?.length === 0 ? (
                                            <tr>
                                                <td
                                                    colSpan={3}
                                                    className="px-4 py-8 text-center text-sm text-gray-400"
                                                >
                                                    No notes yet. Add the first one below!
                                                </td>
                                            </tr>
                                        ) : (
                                            notesTable.getRowModel().rows.map((row) => (
                                                <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                                                    {row.getVisibleCells().map((cell) => (
                                                        <td
                                                            key={cell.id}
                                                            className="px-4 py-3 text-sm text-gray-700 align-top"
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
                        </div>

                        <div className="flex justify-between items-center shrink-0">
                            <button
                                onClick={() => setShowAddNote(true)}
                                disabled={!canUpdateWorkOrders}
                                className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium bg-primary-50 text-primary-700 hover:bg-primary-100 transition-colors border border-primary-200"
                            >
                                <UserPlus size={16} />
                                Add Note Entry
                            </button>
                            {displayStatus !== 'Closed' ? (
                                <button
                                    onClick={() => setShowCloseConfirmDialog(true)}
                                    disabled={!canUpdateWorkOrders || closeWoMutation.isPending}
                                    className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium bg-red-50 text-red-700 hover:bg-red-100 transition-colors border border-red-200 disabled:opacity-50"
                                >
                                    <XCircle size={16} />
                                    {closeWoMutation.isPending ? 'Closing...' : 'Close Work Order'}
                                </button>
                            ) : (
                                <button
                                    onClick={() => reopenWoMutation.mutate()}
                                    disabled={!canUpdateWorkOrders || reopenWoMutation.isPending}
                                    className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors border border-emerald-200 disabled:opacity-50"
                                >
                                    <CheckCircle2 size={16} />
                                    {reopenWoMutation.isPending ? 'Reopening...' : 'Reopen Work Order'}
                                </button>
                            )}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={showCloseConfirmDialog} onOpenChange={setShowCloseConfirmDialog}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Close This Work Order?</DialogTitle>
                        <DialogDescription>
                            This will mark the work order as Closed and close all linked requests. You can reopen
                            it later from the execution view if this was accidental.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <button
                            type="button"
                            onClick={() => setShowCloseConfirmDialog(false)}
                            className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
                            disabled={closeWoMutation.isPending}
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={() => closeWoMutation.mutate()}
                            disabled={!canUpdateWorkOrders || closeWoMutation.isPending}
                            className="px-4 py-2 text-sm font-medium bg-red-600 text-white hover:bg-red-700 rounded-md transition-colors disabled:opacity-50"
                        >
                            {closeWoMutation.isPending ? 'Closing...' : 'Confirm Close'}
                        </button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {canAssignEngineer && (
                <Dialog
                    open={showStartAssignDialog}
                    onOpenChange={(val) => {
                        setShowStartAssignDialog(val)
                        if (!val) {
                            onOpenChange(false)
                        }
                    }}
                >
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle>Select Engineer Before Start</DialogTitle>
                            <DialogDescription>
                                This Work Order has not started and has no assigned engineer. Choose an engineer to
                                continue.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="mt-2 flex flex-col gap-3">
                            <select
                                value={startEngineerId}
                                onChange={(e) => {
                                    setStartAssignError(null)
                                    setStartEngineerId(Number(e.target.value))
                                }}
                                className="w-full text-sm border border-gray-300 rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                            >
                                <option value={0} disabled>
                                    Select Engineer
                                </option>
                                {engineers.map((eng) => (
                                    <option key={eng.id} value={eng.id}>
                                        {eng.name}
                                    </option>
                                ))}
                            </select>
                            {startAssignError && <p className="text-sm text-red-600">{startAssignError}</p>}
                            <DialogFooter className="pt-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setStartAssignError(null)
                                        setShowStartAssignDialog(false)
                                        onOpenChange(false)
                                    }}
                                    className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    disabled={
                                        startEngineerId <= 0 || !wo?.id || startWithEngineerMutation.isPending
                                    }
                                    onClick={() => {
                                        setStartAssignError(null)
                                        if (startEngineerId > 0) {
                                            startWithEngineerMutation.mutate(startEngineerId)
                                        }
                                    }}
                                    className="px-4 py-2 text-sm font-medium bg-primary text-white hover:bg-primary-dark rounded-md transition-colors disabled:opacity-50"
                                >
                                    {startWithEngineerMutation.isPending ? 'Starting...' : 'Assign & Start'}
                                </button>
                            </DialogFooter>
                        </div>
                    </DialogContent>
                </Dialog>
            )}

            <AddNoteDialog
                wo={wo}
                open={showAddNote}
                onOpenChange={setShowAddNote}
                engineers={engineers}
                defaultEngineerId={defaultEngineerId}
                onSuccess={() => {
                    setShowAddNote(false)
                    refetch()
                }}
            />
        </>
    )
}
