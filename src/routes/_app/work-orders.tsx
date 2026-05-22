import { Await, createFileRoute, redirect, useNavigate, useRouter, useRouteContext } from '@tanstack/react-router'
import TableSkeleton from '../../components/TableSkeleton'
import { useMemo, useState } from 'react'
import { Calendar, Play, Search, XCircle } from 'lucide-react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useSetToolbar } from '../../components/ToolbarContext'
import { canPermissionMap } from '../../lib/role-permissions'
import { UNAUTHORIZED_REDIRECT_NOTICE } from '../../lib/redirect-target'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '../../components/ui/dialog'
import { deleteWorkOrders, fetchWorkOrders, type WorkOrderRow } from '../../data/workorders.api'
import { fetchEngineers } from '../../data/engineers.api'
import { fetchCurrentUserPermissions } from '../../data/current-user-permissions.api'
import type { WoSearchParams } from '../../features/work-orders/types'
import { getDefaultDateFrom } from '../../features/work-orders/format'
import { WorkOrdersTableView } from '../../features/work-orders/components/WorkOrdersTableView'
import { WorkOrderExecutionDialog } from '../../features/work-orders/components/WorkOrderExecutionDialog'

export const Route = createFileRoute('/_app/work-orders')({
    validateSearch: (search: Record<string, unknown>): WoSearchParams => ({
        search: typeof search.search === 'string' ? search.search : undefined,
        dateFrom: typeof search.dateFrom === 'string' ? search.dateFrom : getDefaultDateFrom(),
        dateTo: typeof search.dateTo === 'string' ? search.dateTo : undefined,
        status: typeof search.status === 'string' ? search.status : 'Open',
        engineerId: search.engineerId ? Number(search.engineerId) : undefined,
        newWoId: search.newWoId ? Number(search.newWoId) : undefined,
    }),
    beforeLoad: ({ context }) => {
        const user = (context as any).user
        if (user?.role === 'therapist') {
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
        const engineers = await fetchEngineers()
        return {
            workOrders: fetchWorkOrders({ data: { dateFrom: deps.dateFrom, dateTo: deps.dateTo } }),
            engineers,
        }
    },
    component: WorkOrdersPage,
})

function WorkOrdersPage() {
    const { workOrders: workOrdersPromise, engineers: engineersList } = Route.useLoaderData()
    const navigate = useNavigate({ from: '/work-orders' })
    const router = useRouter()
    const { user } = useRouteContext({ from: '/_app' })
    const searchParams = Route.useSearch()
    const { search: globalFilter = '', dateFrom = '', dateTo = '' } = searchParams
    const { data: currentPermissions } = useQuery({
        queryKey: ['current-user-permissions'],
        queryFn: () => fetchCurrentUserPermissions(),
    })
    const permissionMap = currentPermissions?.permissions
    const canDeleteWorkOrders = canPermissionMap(permissionMap, 'workOrders', 'delete')
    const canUpdateWorkOrders = canPermissionMap(permissionMap, 'workOrders', 'update')

    const setGlobalFilter = (value: string) =>
        navigate({ search: (prev: WoSearchParams) => ({ ...prev, search: value || undefined }) })
    const setDateFrom = (value: string) =>
        navigate({ search: (prev: WoSearchParams) => ({ ...prev, dateFrom: value || undefined }) })
    const setDateTo = (value: string) =>
        navigate({ search: (prev: WoSearchParams) => ({ ...prev, dateTo: value || undefined }) })

    const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({})
    const [selectedWos, setSelectedWos] = useState<WorkOrderRow[]>([])
    const [showDeleteDialog, setShowDeleteDialog] = useState(false)
    const selectedCount = selectedWos.length

    const [showExecutionDialog, setShowExecutionDialog] = useState(false)
    const [activeWoToExecute, setActiveWoToExecute] = useState<WorkOrderRow | null>(null)

    const { mutate: mutateDelete } = useMutation({
        mutationFn: async ({ action }: { action: 'delete' | 'keep' }) => {
            const woIds = selectedWos.map((w) => w.id)
            return await deleteWorkOrders({ data: { woIds, requestAction: action } })
        },
        onSuccess: () => {
            router.invalidate()
            setRowSelection({})
            setShowDeleteDialog(false)
        },
    })

    const selectedWo = selectedWos[0] ?? null
    const isStarted = !!(selectedWo && selectedWo.startAt)
    const isClosed = selectedWo?.status === 'Closed'

    const toolbarConfig = useMemo(
        () => ({
            title: 'Work Orders',
            leftContent: (
                <>
                    <div className="relative flex-1 min-w-64 max-w-sm">
                        <Search
                            size={16}
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                        />
                        <input
                            id="wo-search"
                            type="text"
                            placeholder="Search asset, site, or description…"
                            value={globalFilter}
                            onChange={(e) => setGlobalFilter(e.target.value)}
                            className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15 transition-colors"
                        />
                    </div>

                    <div className="flex items-center gap-2 text-sm">
                        <Calendar size={16} className="text-gray-400" />
                        <input
                            id="wo-date-from"
                            type="date"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                            className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-gray-600 text-sm focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15 transition-colors"
                        />
                        <span className="text-gray-400">to</span>
                        <input
                            id="wo-date-to"
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
                        id="btn-start-wo"
                        disabled={selectedCount !== 1 || !canUpdateWorkOrders}
                        onClick={() => {
                            if (selectedWo) {
                                setActiveWoToExecute(selectedWo)
                                setShowExecutionDialog(true)
                            }
                        }}
                        className="inline-flex items-center justify-center gap-2 px-8 py-2.5 rounded-lg text-sm font-medium bg-primary text-white shadow-sm hover:bg-primary-dark disabled:opacity-30 disabled:cursor-not-allowed transition-all w-40"
                    >
                        <Play size={16} />
                        {isClosed ? 'View' : isStarted ? 'Continue' : 'Start'}
                    </button>
                    {canDeleteWorkOrders && (
                        <button
                            id="btn-close-wo"
                            disabled={selectedCount === 0}
                            onClick={() => setShowDeleteDialog(true)}
                            className="inline-flex items-center justify-center gap-2 px-8 py-2.5 rounded-lg text-sm font-medium bg-white text-gray-600 border border-gray-200 shadow-sm hover:bg-red-50 hover:text-red-600 hover:border-red-200 disabled:opacity-30 disabled:cursor-not-allowed transition-all w-40"
                        >
                            <XCircle size={16} />
                            Close
                        </button>
                    )}
                </div>
            ),
        }),
        [
            globalFilter,
            dateFrom,
            dateTo,
            selectedCount,
            isClosed,
            isStarted,
            canDeleteWorkOrders,
            canUpdateWorkOrders,
            selectedWo,
        ],
    )

    useSetToolbar(toolbarConfig)

    return (
        <>
            {canDeleteWorkOrders && (
                <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <div className="flex items-center gap-3 mb-1">
                                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-red-100 shrink-0">
                                    <XCircle size={20} className="text-red-600" />
                                </div>
                                <DialogTitle className="text-base font-semibold text-gray-900">
                                    Close Work Order
                                </DialogTitle>
                            </div>
                            <DialogDescription className="text-sm text-gray-500 leading-relaxed pl-[52px]">
                                You are about to delete{' '}
                                <span className="font-semibold text-gray-700">
                                    {selectedCount} Work Order{selectedCount !== 1 ? 's' : ''}
                                </span>
                                .
                                <br />
                                <br />
                                What would you like to do with the User Requests associated with{' '}
                                {selectedCount === 1 ? 'this' : 'these'} Work Order
                                {selectedCount !== 1 ? 's' : ''}?
                            </DialogDescription>
                        </DialogHeader>
                        <div className="flex flex-col gap-2 mt-4 pl-[52px]">
                            <button
                                onClick={() => mutateDelete({ action: 'delete' })}
                                className="inline-flex w-full items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-red-600 text-white shadow-sm hover:bg-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500/40"
                            >
                                Delete WO & Requests
                            </button>
                            <button
                                onClick={() => mutateDelete({ action: 'keep' })}
                                className="inline-flex w-full items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-white text-gray-700 border border-gray-200 shadow-sm hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-200"
                            >
                                Delete WO only (Keep Requests)
                            </button>
                            <button
                                onClick={() => setShowDeleteDialog(false)}
                                className="mt-2 inline-flex w-full items-center justify-center px-4 py-2.5 rounded-lg text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors focus:outline-none"
                            >
                                Cancel
                            </button>
                        </div>
                    </DialogContent>
                </Dialog>
            )}
            <Await promise={workOrdersPromise} fallback={<TableSkeleton />}>
                {(workOrders) => (
                    <WorkOrdersTableView
                        data={workOrders}
                        engineers={engineersList}
                        rowSelection={rowSelection}
                        setRowSelection={setRowSelection}
                        onSelectionChange={setSelectedWos}
                        initialSearch={searchParams}
                    />
                )}
            </Await>

            <WorkOrderExecutionDialog
                wo={activeWoToExecute}
                open={showExecutionDialog}
                onOpenChange={setShowExecutionDialog}
                engineers={engineersList}
                currentUserId={user?.id || null}
                currentUserName={user?.name || user?.email || null}
                canUpdateWorkOrders={canUpdateWorkOrders}
                onCloseComplete={() => setShowExecutionDialog(false)}
            />
        </>
    )
}
