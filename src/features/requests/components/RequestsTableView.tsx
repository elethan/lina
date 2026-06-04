import { useState, useEffect, useMemo } from 'react'
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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useRouter } from '@tanstack/react-router'
import {
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
} from 'lucide-react'

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '../../../components/ui/dialog'
import { useDynamicPageSize } from '../../../hooks/useDynamicPageSize'
import {
    updateRequestComment,
    updateRequestEngineerComment,
    type RequestRow,
} from '../../../data/requests.api'
import {
    fetchMachineClinicalAssetContext,
    fetchMachineClinicalAssetsBySite,
    fetchMachineClinicalStatus,
    fetchSites,
    updateMachineClinicalStatus,
} from '../../../data/equipment.api'
import {
    getMachineClinicalStatusLabel,
    getNextMachineClinicalStatus,
    isNonClinicalMachineStatus,
    MACHINE_CLINICAL_STATUS,
} from '../../../lib/machine-clinical-status'

import { requestColumns } from '../columns'
import { hasValidTimestamp } from '../format'
import type { MachineClinicalStatus, RequestSearchParams } from '../types'

export function RequestsTableView({
    data,
    rowSelection,
    setRowSelection,
    onSelectionChange,
    canEditRequestComments,
    canEditRequestEngineerNotes,
    canToggleMachineClinical,
    currentUserRole,
    initialSearch,
}: {
    data: RequestRow[]
    rowSelection: Record<string, boolean>
    setRowSelection: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
    onSelectionChange: (items: RequestRow[]) => void
    canEditRequestComments: boolean
    canEditRequestEngineerNotes: boolean
    canToggleMachineClinical: boolean
    currentUserRole?: string
    initialSearch: RequestSearchParams
}) {
    const router = useRouter()
    const queryClient = useQueryClient()
    const navigate = useNavigate({ from: '/' })
    const {
        siteId,
        assetId,
        search: globalFilter = '',
        status: statusFilter = 'Open',
    } = initialSearch
    const selectedCount = Object.keys(rowSelection).length
    const isTherapist = String(currentUserRole ?? '').toLowerCase() === 'therapist'

    const [columnFilters, setColumnFilters] = useState<any[]>([
        ...(statusFilter && statusFilter !== 'All' ? [{ id: 'status', value: statusFilter }] : []),
    ])
    const [columnResizeMode] = useState<ColumnResizeMode>('onChange')
    const { containerRef, pageSize } = useDynamicPageSize()
    const [pageIndex, setPageIndex] = useState(0)
    const [showModeConfirmDialog, setShowModeConfirmDialog] = useState(false)
    const [pendingModeStatus, setPendingModeStatus] = useState<MachineClinicalStatus | null>(null)
    const [modeDialogError, setModeDialogError] = useState<string | null>(null)
    const [isDateTimeHydrated, setIsDateTimeHydrated] = useState(false)

    useEffect(() => {
        setIsDateTimeHydrated(true)
    }, [])

    const hasSelectedAsset = typeof assetId === 'number' && Number.isInteger(assetId) && assetId > 0
    const selectedAssetId = hasSelectedAsset ? assetId : undefined

    const filteredData = useMemo(() => {
        let result = data
        if (typeof siteId === 'number') {
            result = result.filter((row) => row.siteId === siteId)
        }
        if (typeof assetId === 'number') {
            result = result.filter((row) => row.assetId === assetId)
        }
        return result
    }, [data, siteId, assetId])

    const { data: modeSites, isLoading: isModeSitesLoading } = useQuery({
        queryKey: ['sites'],
        queryFn: async () => fetchSites(),
    })

    const { data: modeAssetContext } = useQuery({
        queryKey: ['machine-clinical-asset-context', selectedAssetId],
        queryFn: async () => fetchMachineClinicalAssetContext({ data: { assetId: selectedAssetId as number } }),
        enabled: hasSelectedAsset,
    })

    const resolvedSiteId = typeof siteId === 'number'
        ? siteId
        : (modeAssetContext?.siteId ?? undefined)

    const { data: modeAssets, isLoading: isModeAssetsLoading } = useQuery({
        queryKey: ['machine-clinical-assets-by-site', resolvedSiteId],
        queryFn: async () => fetchMachineClinicalAssetsBySite({ data: { siteId: resolvedSiteId as number } }),
        enabled: typeof resolvedSiteId === 'number',
    })

    const { data: machineStatus, isLoading: isMachineStatusLoading } = useQuery({
        queryKey: ['machine-clinical-status', selectedAssetId],
        queryFn: async () => fetchMachineClinicalStatus({ data: { assetId: selectedAssetId as number } }),
        enabled: hasSelectedAsset,
    })

    const isMachineNonClinical = isNonClinicalMachineStatus(machineStatus?.status)

    const { mutate: mutateMachineClinicalStatus, isPending: isUpdatingMachineStatus } = useMutation({
        mutationFn: async (payload: { assetId: number; status: MachineClinicalStatus }) =>
            updateMachineClinicalStatus({ data: payload }),
        onSuccess: async (_result, vars) => {
            await queryClient.invalidateQueries({
                queryKey: ['machine-clinical-status', vars.assetId],
            })
            await queryClient.invalidateQueries({
                queryKey: ['machine-clinical-asset-context', vars.assetId],
            })
            await queryClient.invalidateQueries({
                queryKey: ['machine-clinical-assets-by-site'],
            })
            await queryClient.invalidateQueries({
                queryKey: ['siteEquipment'],
            })

            setShowModeConfirmDialog(false)
            setPendingModeStatus(null)
            setModeDialogError(null)
            router.invalidate()
        },
        onError: (error: Error) => {
            setModeDialogError(error.message || 'Failed to update machine mode.')
        },
    })

    const { mutateAsync: mutateUpdateRequestComment } = useMutation({
        mutationFn: async (payload: { requestId: number; commentText: string }) =>
            updateRequestComment({ data: payload }),
        onSuccess: async () => {
            await router.invalidate()
        },
    })

    const { mutateAsync: mutateUpdateRequestEngineerComment } = useMutation({
        mutationFn: async (payload: { requestId: number; engineerComment: string | null }) =>
            updateRequestEngineerComment({ data: payload }),
        onSuccess: async () => {
            await router.invalidate()
        },
    })

    useEffect(() => {
        if (!hasSelectedAsset) return
        if (typeof siteId === 'number') return
        if (typeof modeAssetContext?.siteId !== 'number') return

        navigate({
            replace: true,
            search: (prev: RequestSearchParams) => ({
                ...prev,
                siteId: modeAssetContext.siteId ?? undefined,
            }),
        })
    }, [hasSelectedAsset, siteId, modeAssetContext?.siteId, navigate])

    useEffect(() => {
        if (hasSelectedAsset && modeAssets && modeAssets.length > 0) {
            const stillVisible = modeAssets.some((asset) => asset.assetId === selectedAssetId)
            if (!stillVisible) {
                navigate({
                    replace: true,
                    search: (prev: RequestSearchParams) => ({
                        ...prev,
                        assetId: undefined,
                    }),
                })
            }
        }
    }, [hasSelectedAsset, modeAssets, selectedAssetId, navigate])

    useEffect(() => {
        if (hasSelectedAsset) return
        if (typeof resolvedSiteId !== 'number') return
        if (!modeAssets || modeAssets.length !== 1) return

        const onlyAssetId = modeAssets[0].assetId
        navigate({
            replace: true,
            search: (prev: RequestSearchParams) => ({
                ...prev,
                siteId: resolvedSiteId,
                assetId: onlyAssetId,
            }),
        })
    }, [hasSelectedAsset, modeAssets, resolvedSiteId, navigate])

    const handleSiteComboChange = (value: string) => {
        const nextSiteId = value ? Number(value) : undefined
        navigate({
            search: (prev: RequestSearchParams) => ({
                ...prev,
                siteId: nextSiteId,
                assetId: undefined,
            }),
        })
    }

    const handleAssetComboChange = (value: string) => {
        const nextAssetId = value ? Number(value) : undefined
        navigate({
            search: (prev: RequestSearchParams) => ({
                ...prev,
                siteId: typeof resolvedSiteId === 'number' ? resolvedSiteId : prev.siteId,
                assetId: nextAssetId,
            }),
        })
    }

    const openModeDialog = () => {
        if (!canToggleMachineClinical || !hasSelectedAsset) return

        setPendingModeStatus(getNextMachineClinicalStatus(machineStatus?.status))
        setModeDialogError(null)

        setShowModeConfirmDialog(true)
    }

    const handleConfirmModeToggle = () => {
        if (!pendingModeStatus || !selectedAssetId) return

        mutateMachineClinicalStatus({
            assetId: selectedAssetId,
            status: pendingModeStatus,
        })
    }

    const isToggleDisabled =
        !canToggleMachineClinical ||
        !hasSelectedAsset ||
        isMachineStatusLoading ||
        isUpdatingMachineStatus

    useEffect(() => {
        const selected = Object.keys(rowSelection)
            .filter((key) => rowSelection[key])
            .map((key) => filteredData[parseInt(key)])
            .filter((req): req is RequestRow => req !== undefined)
        onSelectionChange(selected)
    }, [rowSelection, filteredData, onSelectionChange])

    const table = useReactTable({
        data: filteredData,
        columns: requestColumns,
        state: { globalFilter, rowSelection, columnFilters, pagination: { pageIndex, pageSize } },
        onGlobalFilterChange: (value: string) =>
            navigate({ search: (prev: RequestSearchParams) => ({ ...prev, search: value || undefined }) }),
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
                }),
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
        meta: {
            canEditRequestComments,
            canEditRequestEngineerNotes,
            isDateTimeHydrated,
            saveRequestComment: async (requestId: number, commentText: string) => {
                await mutateUpdateRequestComment({ requestId, commentText })
            },
            saveRequestEngineerComment: async (requestId: number, engineerComment: string | null) => {
                await mutateUpdateRequestEngineerComment({ requestId, engineerComment })
            },
        },
    })

    return (
        <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
            <Dialog
                open={showModeConfirmDialog}
                onOpenChange={(nextOpen) => {
                    setShowModeConfirmDialog(nextOpen)
                    if (!nextOpen) {
                        setPendingModeStatus(null)
                        setModeDialogError(null)
                    }
                }}
            >
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle>
                            Confirm Linac Status Change
                        </DialogTitle>
                        <DialogDescription className="text-base leading-relaxed">
                            {pendingModeStatus
                                ? `Are you sure you want to switch this machine status to ${getMachineClinicalStatusLabel(pendingModeStatus, { uppercase: true })}?`
                                : 'Are you sure you want to change this machine status?'}
                        </DialogDescription>
                    </DialogHeader>

                    {modeDialogError && (
                        <p className="text-sm text-red-600">{modeDialogError}</p>
                    )}

                    <DialogFooter>
                        <button
                            type="button"
                            onClick={() => {
                                setShowModeConfirmDialog(false)
                                setPendingModeStatus(null)
                                setModeDialogError(null)
                            }}
                            className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-md transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleConfirmModeToggle}
                            disabled={isUpdatingMachineStatus}
                            className="px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary-dark rounded-md shadow-sm transition-colors"
                        >
                            {isUpdatingMachineStatus ? 'Updating...' : 'Confirm'}
                        </button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <div className="px-6 pt-4">
                <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center">
                    <div className="w-full shrink-0 space-y-2 lg:w-72">
                        <div className="space-y-1">
                            <label htmlFor="linac-site" className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                                Site
                            </label>
                            <select
                                id="linac-site"
                                value={resolvedSiteId ?? ''}
                                onChange={(e) => handleSiteComboChange(e.target.value)}
                                disabled={isTherapist || isModeSitesLoading}
                                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
                            >
                                <option value="">Select a site</option>
                                {modeSites?.map((site) => (
                                    <option key={site.siteId} value={site.siteId}>
                                        {site.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-1">
                            <label htmlFor="linac-asset" className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                                Asset
                            </label>
                            <select
                                id="linac-asset"
                                value={selectedAssetId ?? ''}
                                onChange={(e) => handleAssetComboChange(e.target.value)}
                                disabled={isTherapist || typeof resolvedSiteId !== 'number' || isModeAssetsLoading}
                                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
                            >
                                <option value="">
                                    {typeof resolvedSiteId === 'number' ? 'Select an asset' : 'Select a site first'}
                                </option>
                                {(modeAssets ?? []).map((asset) => (
                                    <option key={asset.assetId} value={asset.assetId}>
                                        {(asset.modelName || 'Unknown Model')} (SN: {asset.serialNumber})
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <button
                        type="button"
                        disabled={isToggleDisabled}
                        aria-pressed={isMachineNonClinical}
                        aria-label={`Set Linac mode to ${getMachineClinicalStatusLabel(getNextMachineClinicalStatus(machineStatus?.status), { uppercase: true })}`}
                        onClick={openModeDialog}
                        className="group relative h-32 w-full max-w-156 overflow-hidden rounded-full border-2 border-slate-400/85 bg-gradient-to-b from-white via-slate-50 to-slate-100 shadow-[0_8px_18px_rgba(15,23,42,0.14),inset_0_1px_0_rgba(255,255,255,0.92),inset_0_-1px_0_rgba(148,163,184,0.22)] transition-all hover:shadow-[0_12px_22px_rgba(15,23,42,0.18),inset_0_1px_0_rgba(255,255,255,0.92),inset_0_-1px_0_rgba(148,163,184,0.22)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:shadow-[0_8px_18px_rgba(15,23,42,0.14),inset_0_1px_0_rgba(255,255,255,0.92),inset_0_-1px_0_rgba(148,163,184,0.22)] [--linac-rail-y:clamp(0.55rem,7%,1rem)]"
                    >
                        <svg
                            aria-hidden="true"
                            viewBox="0 0 1000 160"
                            preserveAspectRatio="none"
                            className="absolute inset-0 h-full w-full"
                        >
                            <defs>
                                <linearGradient id="linac-track" x1="0" y1="0" x2="1" y2="0">
                                    <stop offset="0%" stopColor="#ecfdf3" />
                                    <stop offset="50%" stopColor="#f5f7fa" />
                                    <stop offset="100%" stopColor="#fff1f2" />
                                </linearGradient>
                            </defs>
                            <rect
                                x="6"
                                y="6"
                                width="988"
                                height="148"
                                rx="74"
                                fill="url(#linac-track)"
                                stroke="#94a3b8"
                                strokeOpacity="0.35"
                                strokeWidth="3"
                            />
                        </svg>

                        <div
                            aria-hidden="true"
                            className="absolute inset-[4px] rounded-full border border-white/65 shadow-[inset_0_2px_3px_rgba(255,255,255,0.85),inset_0_-6px_10px_rgba(100,116,139,0.12)]"
                        />

                        <div
                            aria-hidden="true"
                            className="absolute inset-x-14 top-3 h-5 rounded-full bg-white/35 blur-md"
                        />

                        <div className="absolute inset-x-1.5 top-[calc(var(--linac-rail-y)-2px)] bottom-[calc(var(--linac-rail-y)+2px)] overflow-hidden rounded-full border border-white/60 shadow-[inset_0_2px_5px_rgba(255,255,255,0.5),inset_0_-6px_10px_rgba(15,23,42,0.08)]">
                            <div
                                className="h-full w-1/2 rounded-full shadow-[0_5px_12px_rgba(15,23,42,0.22),inset_0_1px_3px_rgba(255,255,255,0.3)] transition-transform duration-300 ease-out"
                                style={{ transform: isMachineNonClinical ? 'translateX(100%)' : 'translateX(0)' }}
                            >
                                <svg aria-hidden="true" viewBox="0 0 500 148" preserveAspectRatio="none" className="h-full w-full">
                                    <defs>
                                        <linearGradient id="linac-thumb" x1="0" y1="0" x2="1" y2="0">
                                            <stop offset="0%" stopColor={isMachineNonClinical ? '#ef4444' : '#059669'} />
                                            <stop offset="100%" stopColor={isMachineNonClinical ? '#dc2626' : '#047857'} />
                                        </linearGradient>
                                    </defs>
                                    <rect
                                        x="4"
                                        y="4"
                                        width="492"
                                        height="140"
                                        rx="68"
                                        fill="url(#linac-thumb)"
                                        stroke="#f8fafc"
                                        strokeOpacity="0.7"
                                        strokeWidth="3"
                                    />
                                </svg>
                            </div>
                        </div>

                        <div className="relative z-10 grid h-full grid-cols-2 items-center px-8 text-lg font-bold uppercase tracking-[0.16em] md:text-2xl">
                            <span className="flex justify-center">
                                <span className={`px-4 py-2 transition-opacity duration-200 ${!isMachineNonClinical ? 'text-white opacity-100' : 'text-transparent opacity-0'}`}>
                                    {getMachineClinicalStatusLabel(MACHINE_CLINICAL_STATUS.clinical, { uppercase: true })}
                                </span>
                            </span>
                            <span className="flex justify-center">
                                <span className={`px-4 py-2 transition-opacity duration-200 ${isMachineNonClinical ? 'text-white opacity-100' : 'text-transparent opacity-0'}`}>
                                    {getMachineClinicalStatusLabel(MACHINE_CLINICAL_STATUS.nonClinical, { uppercase: true })}
                                </span>
                            </span>
                        </div>
                    </button>
                </div>
            </div>

            <div ref={containerRef} className="flex-1 min-h-0 overflow-auto px-6 py-4">
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
                                        colSpan={requestColumns.length}
                                        className="px-6 py-16 text-center text-gray-400"
                                    >
                                        No requests found.
                                    </td>
                                </tr>
                            ) : (
                                table.getRowModel().rows.map((row) => {
                                    const isSelected = row.getIsSelected()
                                    const hasDowntimeStart = hasValidTimestamp(row.original.downtimeStartAt)
                                    const hasDowntimeEnd = hasValidTimestamp(row.original.downtimeEndAt)

                                    const rowColorClass = hasDowntimeStart && hasDowntimeEnd
                                        ? (isSelected ? 'bg-orange-100 hover:bg-orange-200' : 'bg-orange-50 hover:bg-orange-100')
                                        : hasDowntimeStart
                                            ? (isSelected ? 'bg-red-200 hover:bg-red-300' : 'bg-red-100 hover:bg-red-200')
                                            : (isSelected ? 'bg-primary/5 hover:bg-primary/8' : 'hover:bg-gray-50')

                                    return (
                                        <tr
                                            key={row.id}
                                            className={`transition-colors cursor-pointer ${rowColorClass}`}
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
                                    )
                                })
                            )}
                        </tbody>
                    </table>
                </div>

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
        </div>
    )
}
