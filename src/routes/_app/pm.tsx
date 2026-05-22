import { createFileRoute, redirect, Await } from '@tanstack/react-router'
import TableSkeleton from '../../components/TableSkeleton'
import { useCallback, useMemo, useState } from 'react'
import {
    Calendar,
    CheckCircle2,
    Search,
    PlusCircle,
    Trash2,
    Copy,
} from 'lucide-react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useRouter, useNavigate, useRouteContext } from '@tanstack/react-router'
import { useSetToolbar } from '../../components/ToolbarContext'
import { canPermissionMap } from '../../lib/role-permissions'
import {
    buildRedirectTargetFromLocation,
    UNAUTHORIZED_REDIRECT_NOTICE,
} from '../../lib/redirect-target'
import { fetchCurrentUserPermissions } from '../../data/current-user-permissions.api'
import {
    fetchPmRows,
    fetchPmFormOptions,
    savePm,
    duplicatePmInstance,
    deletePmInstance,
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
import type { PmSearchParams } from '../../features/pm/types'
import {
    getDefaultDateFromMonthsAgo,
    getSuggestedStartDate,
} from '../../features/pm/format'
import { PmExecutionDialog } from '../../features/pm/components/PmExecutionDialog'
import { PmTableView } from '../../features/pm/components/PmTableView'

const getDefaultDateFrom = () => getDefaultDateFromMonthsAgo(13)

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
    beforeLoad: ({ context, location }) => {
        const user = (context as any).user
        const role = user?.role as string | undefined
        if (!role) {
            throw redirect({
                to: '/login',
                search: {
                    redirect: buildRedirectTargetFromLocation(location),
                },
            })
        }
        if (!['admin', 'engineer', 'scientist'].includes(role)) {
            throw redirect({
                to: '/',
                search: {
                    notice: UNAUTHORIZED_REDIRECT_NOTICE,
                },
            })
        }
    },
    loaderDeps: ({ search }) => ({
        dateFrom: search.dateFrom,
        dateTo: search.dateTo,
    }),
    loader: async ({ deps }) => {
        const options = await fetchPmFormOptions()
        return {
            rows: fetchPmRows({ data: { dateFrom: deps.dateFrom, dateTo: deps.dateTo } }),
            options,
        }
    },
    component: PreventiveMaintenancePage,
})

function PreventiveMaintenancePage() {
    const { rows: rowsPromise, options } = Route.useLoaderData()
    const navigate = useNavigate({ from: '/pm' })
    const router = useRouter()
    const { user } = useRouteContext({ from: '/_app' })
    const { data: currentPermissions } = useQuery({
        queryKey: ['current-user-permissions'],
        queryFn: () => fetchCurrentUserPermissions(),
    })
    const searchParams = Route.useSearch()
    const {
        search: globalFilter = '',
        dateFrom = '',
        dateTo = '',
    } = searchParams

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

    const [selectedPm, setSelectedPm] = useState<PmRow | null>(null)
    const selectedPmId = selectedPm?.id ?? null
    const [showDuplicateDialog, setShowDuplicateDialog] = useState(false)
    const [showNewDialog, setShowNewDialog] = useState(false)
    const [duplicateDate, setDuplicateDate] = useState('')
    const [duplicateError, setDuplicateError] = useState<string | null>(null)
    const [newPmError, setNewPmError] = useState<string | null>(null)
    const [showExecutionDialog, setShowExecutionDialog] = useState(false)
    const [showDeleteDialog, setShowDeleteDialog] = useState(false)
    const [deleteError, setDeleteError] = useState<string | null>(null)
    const [newAssetId, setNewAssetId] = useState<number | ''>('')
    const [newSystemId, setNewSystemId] = useState<number | ''>('')
    const [newSiteId, setNewSiteId] = useState<number | ''>('')
    const [newIntervalMonths, setNewIntervalMonths] = useState<number | ''>('')
    const [newStartAt, setNewStartAt] = useState<string>('')
    const [newEngineerId, setNewEngineerId] = useState<number | ''>('')
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
            setNewSiteId('')
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

    const { mutate: mutateDeletePm, isPending: isDeletingPm } = useMutation({
        mutationFn: async () => {
            if (!selectedPm) {
                throw new Error('Select a PM record first')
            }
            return deletePmInstance({ data: { pmId: selectedPm.id } })
        },
        onSuccess: async () => {
            setShowDeleteDialog(false)
            setDeleteError(null)
            setSelectedPm(null)
            await router.invalidate()
        },
        onError: (error) => {
            setDeleteError(error instanceof Error ? error.message : 'Unable to delete PM')
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

    const hasSelection = !!selectedPm
    const permissionMap = currentPermissions?.permissions
    const canManagePm = canPermissionMap(permissionMap, 'pmInstances', 'update')
    const canCreatePmPermission = canPermissionMap(permissionMap, 'pmInstances', 'create')
    const canCreatePm = canCreatePmPermission && !!newAssetId && !!newSystemId && !!newIntervalMonths && !!newStartAt
    const canDeletePm = canPermissionMap(permissionMap, 'pmInstances', 'delete')

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
                        disabled={!canCreatePmPermission}
                        onClick={() => {
                            setNewPmError(null)
                            setNewSiteId('')
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
                        Edit
                    </button>
                    <button
                        id="btn-duplicate-pm"
                        disabled={!hasSelection || !canCreatePmPermission}
                        onClick={handleOpenDuplicateDialog}
                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-white text-gray-600 border border-gray-200 shadow-sm hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all w-32 whitespace-nowrap"
                    >
                        <Copy size={16} />
                        Duplicate
                    </button>
                    <button
                        id="btn-delete-pm"
                        disabled={!hasSelection || !canDeletePm}
                        onClick={() => {
                            setDeleteError(null)
                            setShowDeleteDialog(true)
                        }}
                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-white text-red-600 border border-gray-200 shadow-sm hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all w-32 whitespace-nowrap"
                    >
                        <Trash2 size={16} />
                        Delete
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
            handleOpenDuplicateDialog,
            canCreatePmPermission,
            canDeletePm,
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
                        <div className="space-y-1.5 md:col-span-2">
                            <label htmlFor="pm-new-site" className="text-sm font-medium text-gray-700">Site</label>
                            <select
                                id="pm-new-site"
                                value={newSiteId}
                                onChange={(e) => {
                                    setNewSiteId(e.target.value ? Number(e.target.value) : '')
                                    setNewAssetId('')
                                    setNewSystemId('')
                                }}
                                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
                            >
                                <option value="">All sites</option>
                                {options.sites.map((site) => (
                                    <option key={site.id} value={site.id}>{site.label}</option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-1.5">
                            <label htmlFor="pm-new-asset" className="text-sm font-medium text-gray-700">Asset *</label>
                            <select
                                id="pm-new-asset"
                                value={newAssetId}
                                onChange={(e) => {
                                    setNewAssetId(e.target.value ? Number(e.target.value) : '')
                                    setNewSystemId('')
                                }}
                                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
                            >
                                <option value="">Select asset</option>
                                {options.assets
                                    .filter((a) => !newSiteId || a.siteId === newSiteId)
                                    .map((asset) => (
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
                                {options.systems
                                    .filter((s) => !newAssetId || (options.assetSystemIds[newAssetId] ?? []).includes(s.id))
                                    .map((system) => (
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

            <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-base font-semibold text-gray-900">
                            Delete PM?
                        </DialogTitle>
                        <DialogDescription className="text-sm text-gray-500 leading-relaxed">
                            This will permanently delete the PM record and all associated task results. This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>

                    {deleteError && <p className="text-sm text-red-600">{deleteError}</p>}

                    <DialogFooter>
                        <button
                            onClick={() => setShowDeleteDialog(false)}
                            className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => mutateDeletePm()}
                            disabled={isDeletingPm}
                            className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                            {isDeletingPm ? 'Deleting...' : 'Delete PM'}
                        </button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ─── Table ─── */}
            <Await promise={rowsPromise} fallback={<TableSkeleton />}>
                {(rows) => (
                    <PmTableView
                        data={rows}
                        selectedPmId={selectedPmId}
                        onSelectionChange={setSelectedPm}
                        initialSearch={searchParams}
                    />
                )}
            </Await>
        </>
    )
}
