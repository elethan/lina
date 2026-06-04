import { createFileRoute, useRouter, useNavigate, Await } from '@tanstack/react-router'
import { useState, useMemo, useEffect } from 'react'
import { Search, Calendar, PlusCircle, Merge, XCircle, ClipboardPlus, AlertCircle } from 'lucide-react'
import { useMutation, useQuery } from '@tanstack/react-query'

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '../../components/ui/dialog'
import { useSetToolbar } from '../../components/ToolbarContext'
import TableSkeleton from '../../components/TableSkeleton'

import {
    fetchRequests,
    deleteRequests,
    type RequestRow,
} from '../../data/requests.api'
import { createWorkOrder, fetchOpenWorkOrdersByAsset, mergeRequestsToWo } from '../../data/workorders.api'
import { fetchCurrentUserPermissions } from '../../data/current-user-permissions.api'
import { canPermissionMap } from '../../lib/role-permissions'
import { pushClientErrorNotice } from '../../lib/client-error-logger'
import { UNAUTHORIZED_REDIRECT_NOTICE } from '../../lib/redirect-target'
import { isNonClinicalMachineStatus } from '../../lib/machine-clinical-status'
import { fetchMachineClinicalStatus } from '../../data/equipment.api'

import type { RequestSearchParams } from '../../features/requests/types'
import {
    getDefaultDateFrom,
    parseOptionalNumber,
} from '../../features/requests/format'
import { RequestsTableView } from '../../features/requests/components/RequestsTableView'
import { NewRequestDialog } from '../../features/requests/components/NewRequestDialog'

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
        siteId: parseOptionalNumber(search.siteId ?? search.siteID),
        assetId: parseOptionalNumber(search.assetId ?? search.assetID),
        notice:
            search.notice === UNAUTHORIZED_REDIRECT_NOTICE
                ? UNAUTHORIZED_REDIRECT_NOTICE
                : undefined,
    }),
    loaderDeps: ({ search }) => ({
        dateFrom: search.dateFrom,
        dateTo: search.dateTo,
    }),
    loader: ({ deps }) => ({
        requests: fetchRequests({ data: { dateFrom: deps.dateFrom, dateTo: deps.dateTo } }),
    }),
    component: RequestsPage,
})

function RequestsPage() {
    const { requests: requestsPromise } = Route.useLoaderData()
    const router = useRouter()
    const navigate = useNavigate({ from: '/' })
    const search = Route.useSearch()
    const {
        search: globalFilter = '',
        dateFrom = '',
        dateTo = '',
        siteId,
        assetId,
        notice,
    } = search
    const { data: currentPermissions } = useQuery({
        queryKey: ['current-user-permissions'],
        queryFn: () => fetchCurrentUserPermissions(),
    })
    const permissionMap = currentPermissions?.permissions
    const canCreateRequests = canPermissionMap(permissionMap, 'requests', 'create')
    const canCloseRequests = canPermissionMap(permissionMap, 'requests', 'delete')
    const canCreateWorkOrders = canPermissionMap(permissionMap, 'workOrders', 'create')
    const canMergeToWorkOrders = canPermissionMap(permissionMap, 'workOrders', 'update')
    const canToggleMachineClinical = canPermissionMap(permissionMap, 'machineClinical', 'update')
    const canEditRequestComments = canPermissionMap(permissionMap, 'requests', 'update')
    const isTherapistUser = String(currentPermissions?.role ?? '').toLowerCase() === 'therapist'
    const canEditRequestEngineerNotes = canEditRequestComments && !isTherapistUser

    const hasSelectedAsset = typeof assetId === 'number' && Number.isInteger(assetId) && assetId > 0
    const { data: selectedAssetMachineStatus, isLoading: isLoadingSelectedAssetMachineStatus } = useQuery({
        queryKey: ['machine-clinical-status', hasSelectedAsset ? assetId : null],
        queryFn: async () => fetchMachineClinicalStatus({ data: { assetId: assetId as number } }),
        enabled: hasSelectedAsset,
    })
    const isSelectedAssetNonClinical = isNonClinicalMachineStatus(selectedAssetMachineStatus?.status)

    const setGlobalFilter = (value: string) =>
        navigate({ search: (prev: RequestSearchParams) => ({ ...prev, search: value || undefined }) })
    const setDateFrom = (value: string) =>
        navigate({ search: (prev: RequestSearchParams) => ({ ...prev, dateFrom: value || undefined }) })
    const setDateTo = (value: string) =>
        navigate({ search: (prev: RequestSearchParams) => ({ ...prev, dateTo: value || undefined }) })

    useEffect(() => {
        if (notice !== UNAUTHORIZED_REDIRECT_NOTICE) return

        pushClientErrorNotice(
            'Access Restricted',
            'You do not have access to that page. Showing Requests instead.',
        )

        navigate({
            replace: true,
            search: (prev: RequestSearchParams) => ({
                ...prev,
                notice: undefined,
            }),
        })
    }, [navigate, notice])

    const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({})
    const [selectedItems, setSelectedItems] = useState<RequestRow[]>([])
    const [showCreateWODialog, setShowCreateWODialog] = useState(false)
    const [showCloseDialog, setShowCloseDialog] = useState(false)
    const [closeComment, setCloseComment] = useState('')
    const [showMergeDialog, setShowMergeDialog] = useState(false)
    const [selectedMergeWoId, setSelectedMergeWoId] = useState<number | null>(null)
    const [showNewRequestDialog, setShowNewRequestDialog] = useState(false)
    const [autoWoNotice, setAutoWoNotice] = useState<{ woId: number; isNew: boolean } | null>(null)

    useEffect(() => {
        if (!isSelectedAssetNonClinical || !showNewRequestDialog) return
        setShowNewRequestDialog(false)
    }, [isSelectedAssetNonClinical, showNewRequestDialog])

    const { mutate: mutateCreateWO } = useMutation({
        mutationFn: async (data: { requestIds?: number[]; assetId?: number }) => {
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
        mutationFn: async (data: { requestIds: number[]; engineerComment?: string }) => {
            const result = await deleteRequests({ data })
            return result
        },
        onSuccess: () => {
            router.invalidate()
            setRowSelection({})
            setShowCloseDialog(false)
            setCloseComment('')
        },
    })

    const { mutate: mutateMergeRequests } = useMutation({
        mutationFn: async (data: { requestIds: number[]; woId: number }) => {
            const result = await mergeRequestsToWo({ data })
            return result
        },
        onSuccess: () => {
            router.invalidate()
            setRowSelection({})
            setShowMergeDialog(false)
            setSelectedMergeWoId(null)
        },
    })

    const selectedCount = Object.keys(rowSelection).length
    const canCreateWoFromAssetSelection = hasSelectedAsset && selectedCount === 0

    const handleConfirmCreateWO = () => {
        setShowCreateWODialog(false)
        mutateCreateWO({
            requestIds: selectedItems.map((r) => r.id),
            assetId: canCreateWoFromAssetSelection ? (assetId as number) : undefined,
        })
    }

    const toolbarConfig = useMemo(() => ({
        title: 'Requests',
        leftContent: (
            <>
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
                    disabled={!canCreateRequests || (hasSelectedAsset && (isLoadingSelectedAssetMachineStatus || isSelectedAssetNonClinical))}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white shadow-sm hover:bg-primary-dark transition-all w-32 whitespace-nowrap disabled:opacity-50"
                    onClick={() => setShowNewRequestDialog(true)}
                >
                    <PlusCircle size={16} />
                    New
                </button>
                <div className="w-px h-8 bg-gray-200" />
                <button
                    id="btn-create-wo"
                    disabled={(!canCreateWoFromAssetSelection && selectedCount === 0) || !canCreateWorkOrders}
                    onClick={() => setShowCreateWODialog(true)}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-white text-gray-600 border border-gray-200 shadow-sm hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all w-32 whitespace-nowrap"
                >
                    <ClipboardPlus size={16} />
                    Create WO
                </button>
                <button
                    id="btn-merge"
                    disabled={selectedCount === 0 || !canMergeToWorkOrders}
                    onClick={() => setShowMergeDialog(true)}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-white text-gray-600 border border-gray-200 shadow-sm hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all w-32 whitespace-nowrap"
                >
                    <Merge size={16} />
                    Merge
                </button>
                <button
                    id="btn-close"
                    disabled={selectedCount === 0 || !canCloseRequests}
                    onClick={() => setShowCloseDialog(true)}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-white text-gray-600 border border-gray-200 shadow-sm hover:bg-red-50 hover:text-red-600 hover:border-red-200 disabled:opacity-30 disabled:cursor-not-allowed transition-all w-32 whitespace-nowrap"
                >
                    <XCircle size={16} />
                    Close
                </button>
            </div>
        ),
    }), [
        globalFilter,
        dateFrom,
        dateTo,
        selectedCount,
        canCreateWoFromAssetSelection,
        siteId,
        canCreateRequests,
        hasSelectedAsset,
        isLoadingSelectedAssetMachineStatus,
        isSelectedAssetNonClinical,
        canCloseRequests,
        canCreateWorkOrders,
        canMergeToWorkOrders,
    ])

    useSetToolbar(toolbarConfig)

    const uniqueAssetIds = new Set(selectedItems.map((req) => req.assetId))
    const isMultipleAssets = uniqueAssetIds.size > 1
    const hasAttachedRequests = selectedItems.some((req) => req.status !== 'Open')

    const mergeQuery = useQuery({
        queryKey: ['openWosForAsset', uniqueAssetIds.size === 1 ? Array.from(uniqueAssetIds)[0] : null],
        queryFn: async () => fetchOpenWorkOrdersByAsset({ data: { assetId: Array.from(uniqueAssetIds)[0] as number } }),
        enabled: showMergeDialog && !isMultipleAssets && uniqueAssetIds.size === 1,
    })
    const openWosForMerge = mergeQuery.data ?? []

    return (
        <>
            {/* ─── Merge Requests Dialog ─── */}
            <Dialog open={showMergeDialog} onOpenChange={(val) => {
                setShowMergeDialog(val)
                if (!val) setSelectedMergeWoId(null)
            }}>
                <DialogContent className="sm:max-w-2xl">
                    <DialogHeader>
                        <div className="flex items-center gap-3 mb-1">
                            <div className={`flex items-center justify-center w-10 h-10 rounded-full shrink-0 ${hasAttachedRequests || isMultipleAssets ? 'bg-red-100' : 'bg-primary/10'}`}>
                                {hasAttachedRequests || isMultipleAssets ? <AlertCircle size={20} className="text-red-600" /> : <Merge size={20} className="text-primary" />}
                            </div>
                            <DialogTitle className="text-base font-semibold text-gray-900">
                                {hasAttachedRequests || isMultipleAssets ? 'Cannot Merge Requests' : 'Merge to Open Work Order'}
                            </DialogTitle>
                        </div>
                        <DialogDescription className="text-sm text-gray-500 leading-relaxed pl-[52px]" asChild>
                            {hasAttachedRequests ? (
                                <div>
                                    One or more of the selected requests are currently <span className="font-semibold text-gray-700">Active</span> or <span className="font-semibold text-gray-700">Closed</span>.
                                    <br /><br />
                                    You cannot merge requests that are already attached to a Work Order.
                                </div>
                            ) : isMultipleAssets ? (
                                <div>
                                    You have selected requests from <span className="font-semibold text-gray-700">multiple different assets/systems</span>.
                                    <br /><br />
                                    Selected requests must belong to the <span className="font-semibold text-gray-700">same asset</span>. Please adjust your selection and try again.
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <p>
                                        Select an open Work Order to append the{' '}
                                        <span className="font-semibold text-gray-700">
                                            {selectedCount} selected request{selectedCount !== 1 ? 's' : ''}
                                        </span>{' '}
                                        to.
                                    </p>

                                    <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-md divide-y divide-gray-100 mt-2">
                                        {mergeQuery.isLoading ? (
                                            <div className="p-4 text-center text-sm text-gray-400">Loading Work Orders...</div>
                                        ) : openWosForMerge.length === 0 ? (
                                            <div className="p-4 text-center text-sm text-gray-400">No open Work Orders found for this asset.</div>
                                        ) : (
                                            openWosForMerge.map(wo => (
                                                <div
                                                    key={wo.id}
                                                    onClick={() => setSelectedMergeWoId(wo.id)}
                                                    className={`p-3 text-sm cursor-pointer hover:bg-gray-50 flex items-start gap-2 ${selectedMergeWoId === wo.id ? 'bg-primary/5' : ''}`}
                                                >
                                                    <input
                                                        type="radio"
                                                        checked={selectedMergeWoId === wo.id}
                                                        onChange={() => setSelectedMergeWoId(wo.id)}
                                                        className="mt-0.5 accent-primary"
                                                    />
                                                    <div className="flex-1 min-w-0 flex flex-col">
                                                        <span className="font-medium text-gray-900">WO #{wo.id} — {wo.systemName ?? 'No System'}</span>
                                                        <span className="text-gray-500 truncate" title={wo.description}>{wo.description}</span>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="mt-2 flex gap-2 sm:gap-2">
                        {hasAttachedRequests || isMultipleAssets ? (
                            <button
                                onClick={() => setShowMergeDialog(false)}
                                className="w-full inline-flex items-center justify-center px-4 py-2.5 rounded-lg text-sm font-medium bg-gray-900 text-white hover:bg-gray-800 transition-colors"
                            >
                                Got it
                            </button>
                        ) : (
                            <>
                                <button
                                    onClick={() => setShowMergeDialog(false)}
                                    className="flex-1 inline-flex items-center justify-center px-4 py-2.5 rounded-lg text-sm font-medium bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    disabled={!selectedMergeWoId}
                                    onClick={() => {
                                        if (selectedMergeWoId) {
                                            const ids = selectedItems.map((r) => r.id)
                                            mutateMergeRequests({ requestIds: ids, woId: selectedMergeWoId })
                                        }
                                    }}
                                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white shadow-sm hover:bg-primary-dark transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Merge size={15} />
                                    Merge
                                </button>
                            </>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ─── Close Requests Dialog ─── */}
            <Dialog open={showCloseDialog} onOpenChange={setShowCloseDialog}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <div className="flex items-center gap-3 mb-1">
                            <div className={`flex items-center justify-center w-10 h-10 rounded-full shrink-0 ${hasAttachedRequests || isMultipleAssets ? 'bg-red-100' : 'bg-primary/10'}`}>
                                <XCircle size={20} className={hasAttachedRequests || isMultipleAssets ? 'text-red-600' : 'text-primary'} />
                            </div>
                            <DialogTitle className="text-base font-semibold text-gray-900">
                                {hasAttachedRequests || isMultipleAssets ? 'Cannot Close Requests' : 'Close Requests'}
                            </DialogTitle>
                        </div>
                        <DialogDescription className="text-sm text-gray-500 leading-relaxed pl-[52px]" asChild>
                            {hasAttachedRequests ? (
                                <div>
                                    One or more of the selected requests are currently <span className="font-semibold text-gray-700">Active</span> or <span className="font-semibold text-gray-700">Closed</span>.
                                    <br /><br />
                                    You cannot delete requests that are already attached to a Work Order.
                                </div>
                            ) : isMultipleAssets ? (
                                <div>
                                    You have selected requests from <span className="font-semibold text-gray-700">multiple different assets/systems</span>.
                                    <br /><br />
                                    Selected requests must belong to the <span className="font-semibold text-gray-700">same asset</span>. Please adjust your selection and try again.
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <p>
                                        Are you sure you want to close{' '}
                                        <span className="font-semibold text-gray-700">
                                            {selectedCount} selected request{selectedCount !== 1 ? 's' : ''}
                                        </span>?
                                    </p>
                                    <textarea
                                        placeholder="Add an engineer note (optional)"
                                        value={closeComment}
                                        onChange={(e) => setCloseComment(e.target.value)}
                                        rows={3}
                                        className="w-full text-sm border border-gray-300 rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary resize-none mt-2"
                                    />
                                    <p className="text-xs text-gray-400">
                                        If you leave a note, the request will be maintained and marked 'Closed'. If left empty, the request will be permanently deleted.
                                    </p>
                                </div>
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="mt-2 flex gap-2 sm:gap-2">
                        {hasAttachedRequests || isMultipleAssets ? (
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
                                        const ids = selectedItems.map((r) => r.id)
                                        mutateDeleteRequests({ requestIds: ids, engineerComment: closeComment })
                                    }}
                                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-red-600 text-white shadow-sm hover:bg-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500/40 focus:ring-offset-1"
                                >
                                    <XCircle size={15} />
                                    {closeComment.trim() ? 'Close' : 'Delete'}
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
                                    {selectedCount > 0 ? (
                                        <>
                                            A new Work Order will be created and linked to{' '}
                                            <span className="font-semibold text-gray-700">
                                                {selectedCount} selected request{selectedCount !== 1 ? 's' : ''}
                                            </span>
                                            . This action will commit the Work Order to the database.
                                        </>
                                    ) : (
                                        <>
                                            A new Work Order will be created for the currently selected asset without linking any existing request. This action will commit the Work Order to the database.
                                        </>
                                    )}
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

            <Await promise={requestsPromise} fallback={<TableSkeleton />}>
                {(requests) => (
                    <RequestsTableView
                        data={requests}
                        rowSelection={rowSelection}
                        setRowSelection={setRowSelection}
                        onSelectionChange={setSelectedItems}
                        canEditRequestComments={canEditRequestComments}
                        canEditRequestEngineerNotes={canEditRequestEngineerNotes}
                        canToggleMachineClinical={canToggleMachineClinical}
                        currentUserRole={currentPermissions?.role}
                        initialSearch={search}
                    />
                )}
            </Await>

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
