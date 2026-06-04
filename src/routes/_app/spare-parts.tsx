import { useCallback, useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { ArrowRightLeft, PlusCircle, Search, Trash2 } from 'lucide-react'
import TableSkeleton from '../../components/TableSkeleton'
import { useSetToolbar } from '../../components/ToolbarContext'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '../../components/ui/dialog'
import { fetchCurrentUserPermissions } from '../../data/current-user-permissions.api'
import {
    createSparePart,
    deleteSparePart,
    fetchSparePartOptions,
    fetchSpareParts,
    moveSpareParts,
    type SparePartRow,
} from '../../data/spare-parts.api'
import { SparePartsTableView } from '../../features/spare-parts/components/SparePartsTableView'
import {
    buildRedirectTargetFromLocation,
    UNAUTHORIZED_REDIRECT_NOTICE,
} from '../../lib/redirect-target'
import { canPermissionMap } from '../../lib/role-permissions'

export const Route = createFileRoute('/_app/spare-parts')({
    beforeLoad: ({ context, location }) => {
        const role = String((context as any).user?.role ?? '').toLowerCase()
        if (!role) {
            throw redirect({
                to: '/login',
                search: {
                    redirect: buildRedirectTargetFromLocation(location),
                },
            })
        }

        if (role === 'scientist' || role === 'therapist') {
            throw redirect({
                to: '/',
                search: {
                    notice: UNAUTHORIZED_REDIRECT_NOTICE,
                },
            })
        }
    },
    component: SparePartsPage,
})

function SparePartsPage() {
    const queryClient = useQueryClient()

    const [globalFilter, setGlobalFilter] = useState('')
    const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({})
    const [selectedParts, setSelectedParts] = useState<SparePartRow[]>([])
    const [createDialogOpen, setCreateDialogOpen] = useState(false)
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
    const [moveDialogOpen, setMoveDialogOpen] = useState(false)
    const [deleteTargets, setDeleteTargets] = useState<SparePartRow[]>([])

    const { data: currentPermissions } = useQuery({
        queryKey: ['current-user-permissions'],
        queryFn: () => fetchCurrentUserPermissions(),
    })

    const { data: spareParts = [], isLoading: isLoadingParts, error: sparePartsError } = useQuery({
        queryKey: ['spare-parts'],
        queryFn: () => fetchSpareParts(),
    })

    const { data: options, isLoading: isLoadingOptions, error: optionsError } = useQuery({
        queryKey: ['spare-parts-options'],
        queryFn: () => fetchSparePartOptions(),
    })

    const permissionMap = currentPermissions?.permissions
    const canCreateSpareParts = canPermissionMap(permissionMap, 'spareParts', 'create')
    const canUpdateSpareParts = canPermissionMap(permissionMap, 'spareParts', 'update')
    const canDeleteSpareParts = canPermissionMap(permissionMap, 'spareParts', 'delete')

    const [formState, setFormState] = useState({
        code: '',
        name: '',
        siteId: '',
        quantity: '0',
        locationId: '',
    })
    const [moveSiteId, setMoveSiteId] = useState('')

    const refresh = async () => {
        await queryClient.invalidateQueries({ queryKey: ['spare-parts'] })
    }

    const resetForm = useCallback(() => {
        setFormState({
            code: '',
            name: '',
            siteId: options?.sites[0]?.id ? String(options.sites[0].id) : '',
            quantity: '0',
            locationId: '',
        })
    }, [options])

    const createMutation = useMutation({
        mutationFn: async (payload: {
            code: string
            name: string
            siteId: number
            quantity: number
            locationId: number | null
        }) => createSparePart({ data: payload }),
        onSuccess: async () => {
            await refresh()
            resetForm()
            setCreateDialogOpen(false)
        },
        onError: (error: Error) => {
            alert(error.message || 'Failed to create spare part')
        },
    })

    const deleteMutation = useMutation({
        mutationFn: async (partIds: number[]) => {
            await Promise.all(partIds.map((partId) => deleteSparePart({ data: { partId } })))
        },
        onSuccess: async () => {
            await refresh()
            setDeleteDialogOpen(false)
            setDeleteTargets([])
            setRowSelection({})
        },
        onError: (error: Error) => {
            alert(error.message || 'Failed to delete spare part')
        },
    })

    const moveMutation = useMutation({
        mutationFn: async (payload: { partIds: number[]; siteId: number }) =>
            moveSpareParts({ data: payload }),
        onSuccess: async () => {
            await refresh()
            setMoveDialogOpen(false)
            setMoveSiteId('')
            setRowSelection({})
        },
        onError: (error: Error) => {
            alert(error.message || 'Failed to move spare parts')
        },
    })

    const requestDelete = useCallback((rows?: SparePartRow[] | SparePartRow | null) => {
        const targets = Array.isArray(rows)
            ? rows
            : rows
                ? [rows]
                : selectedParts

        if (targets.length === 0) return
        setDeleteTargets(targets)
        setDeleteDialogOpen(true)
    }, [selectedParts])

    const requestMove = useCallback(() => {
        if (selectedParts.length === 0) return
        setMoveSiteId(selectedParts[0]?.siteId ? String(selectedParts[0].siteId) : options?.sites[0]?.id ? String(options.sites[0].id) : '')
        setMoveDialogOpen(true)
    }, [options, selectedParts])

    const toolbarConfig = useMemo(
        () => ({
            title: 'Spare Parts',
            leftContent: (
                <div className="relative flex-1 min-w-64 max-w-sm">
                    <Search
                        size={16}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                    <input
                        id="spares-search"
                        type="text"
                        placeholder="Search code, name, or site…"
                        value={globalFilter}
                        onChange={(event) => setGlobalFilter(event.target.value)}
                        className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-4 text-sm text-gray-800 transition-colors placeholder:text-gray-400 focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/15"
                    />
                </div>
            ),
            rightContent: (
                <div className="flex items-center gap-2">
                    {canDeleteSpareParts && (
                        <button
                            type="button"
                            disabled={selectedParts.length === 0 || deleteMutation.isPending}
                            onClick={() => requestDelete(selectedParts)}
                            className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-600 shadow-sm transition-all hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                            <Trash2 size={16} />
                            Delete
                        </button>
                    )}
                    {canUpdateSpareParts && (
                        <button
                            type="button"
                            disabled={selectedParts.length === 0 || moveMutation.isPending || !options || options.sites.length === 0}
                            onClick={requestMove}
                            className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-600 shadow-sm transition-all hover:border-primary/30 hover:bg-primary/5 hover:text-primary-darker disabled:cursor-not-allowed disabled:opacity-30"
                        >
                            <ArrowRightLeft size={16} />
                            Move
                        </button>
                    )}
                    {canCreateSpareParts && (
                        <button
                            type="button"
                            disabled={createMutation.isPending || !options || options.sites.length === 0}
                            onClick={() => {
                                resetForm()
                                setCreateDialogOpen(true)
                            }}
                            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-30"
                        >
                            <PlusCircle size={16} />
                            New
                        </button>
                    )}
                </div>
            ),
        }),
        [
            canCreateSpareParts,
            canDeleteSpareParts,
            canUpdateSpareParts,
            createMutation.isPending,
            deleteMutation.isPending,
            globalFilter,
            moveMutation.isPending,
            options,
            requestMove,
            requestDelete,
            resetForm,
            selectedParts,
        ],
    )

    useSetToolbar(toolbarConfig)

    const handleCreateSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()

        if (!formState.siteId) {
            alert('Site is required')
            return
        }

        const quantity = Number.parseInt(formState.quantity, 10)

        createMutation.mutate({
            code: formState.code,
            name: formState.name,
            siteId: Number(formState.siteId),
            quantity: Number.isInteger(quantity) && quantity >= 0 ? quantity : 0,
            locationId: formState.locationId ? Number(formState.locationId) : null,
        })
    }

    if (isLoadingParts || isLoadingOptions || !options) {
        return <TableSkeleton />
    }

    if (sparePartsError || optionsError) {
        return (
            <div className="px-6 py-10 text-sm text-red-600">
                {(sparePartsError as Error | undefined)?.message
                    || (optionsError as Error | undefined)?.message
                    || 'Failed to load spare parts'}
            </div>
        )
    }

    return (
        <>
            <Dialog
                open={createDialogOpen}
                onOpenChange={(open) => {
                    setCreateDialogOpen(open)
                    if (!open) {
                        resetForm()
                    }
                }}
            >
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>New Spare Part</DialogTitle>
                        <DialogDescription>
                            Add a spare part record. Site and location use existing seeded values only.
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleCreateSubmit} className="space-y-4">
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <label className="flex flex-col gap-1.5 text-sm text-gray-600">
                                Code
                                <input
                                    value={formState.code}
                                    onChange={(event) => setFormState((prev) => ({ ...prev, code: event.target.value }))}
                                    className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/15"
                                    required
                                />
                            </label>

                            <label className="flex flex-col gap-1.5 text-sm text-gray-600">
                                Quantity
                                <input
                                    type="number"
                                    min={0}
                                    step={1}
                                    value={formState.quantity}
                                    onChange={(event) => setFormState((prev) => ({ ...prev, quantity: event.target.value }))}
                                    className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/15"
                                    required
                                />
                            </label>
                        </div>

                        <label className="flex flex-col gap-1.5 text-sm text-gray-600">
                            Name
                            <input
                                value={formState.name}
                                onChange={(event) => setFormState((prev) => ({ ...prev, name: event.target.value }))}
                                className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/15"
                                required
                            />
                        </label>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <label className="flex flex-col gap-1.5 text-sm text-gray-600">
                                Site
                                <select
                                    value={formState.siteId}
                                    onChange={(event) => setFormState((prev) => ({ ...prev, siteId: event.target.value }))}
                                    className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/15"
                                    required
                                >
                                    {options.sites.map((site) => (
                                        <option key={site.id} value={site.id}>
                                            {site.name}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label className="flex flex-col gap-1.5 text-sm text-gray-600">
                                Location
                                <select
                                    value={formState.locationId}
                                    onChange={(event) => setFormState((prev) => ({ ...prev, locationId: event.target.value }))}
                                    className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/15"
                                >
                                    <option value="">—</option>
                                    {options.locations.map((location) => (
                                        <option key={location.id} value={location.id}>
                                            {location.name}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </div>

                        <DialogFooter>
                            <button
                                type="button"
                                onClick={() => setCreateDialogOpen(false)}
                                className="inline-flex items-center justify-center rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={createMutation.isPending}
                                className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-30"
                            >
                                Create
                            </button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog
                open={deleteDialogOpen}
                onOpenChange={(open) => {
                    setDeleteDialogOpen(open)
                    if (!open) {
                        setDeleteTargets([])
                    }
                }}
            >
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Delete Spare Part</DialogTitle>
                        <DialogDescription>
                            Delete{' '}
                            <span className="font-semibold text-gray-700">
                                {deleteTargets.length === 1 ? deleteTargets[0]?.code : `${deleteTargets.length} spare parts`}
                            </span>{' '}
                            from the spare parts table?
                        </DialogDescription>
                    </DialogHeader>

                    <DialogFooter>
                        <button
                            type="button"
                            onClick={() => setDeleteDialogOpen(false)}
                            className="inline-flex items-center justify-center rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            disabled={deleteTargets.length === 0 || deleteMutation.isPending}
                            onClick={() => {
                                if (deleteTargets.length === 0) return
                                deleteMutation.mutate(deleteTargets.map((part) => part.id))
                            }}
                            className="inline-flex items-center justify-center rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                            Delete
                        </button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog
                open={moveDialogOpen}
                onOpenChange={(open) => {
                    setMoveDialogOpen(open)
                    if (!open) {
                        setMoveSiteId('')
                    }
                }}
            >
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Move Spare Parts</DialogTitle>
                        <DialogDescription>
                            Move <span className="font-semibold text-gray-700">{selectedParts.length} spare part{selectedParts.length === 1 ? '' : 's'}</span> to another site.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-2">
                        <label className="flex flex-col gap-1.5 text-sm text-gray-600">
                            Site
                            <select
                                value={moveSiteId}
                                onChange={(event) => setMoveSiteId(event.target.value)}
                                className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-800 focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/15"
                            >
                                <option value="">Select a site</option>
                                {options.sites.map((site) => (
                                    <option key={site.id} value={site.id}>
                                        {site.name}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>

                    <DialogFooter>
                        <button
                            type="button"
                            onClick={() => setMoveDialogOpen(false)}
                            className="inline-flex items-center justify-center rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            disabled={!moveSiteId || selectedParts.length === 0 || moveMutation.isPending}
                            onClick={() => {
                                if (!moveSiteId || selectedParts.length === 0) return
                                moveMutation.mutate({
                                    partIds: selectedParts.map((part) => part.id),
                                    siteId: Number(moveSiteId),
                                })
                            }}
                            className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-30"
                        >
                            Move
                        </button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <SparePartsTableView
                data={spareParts}
                siteOptions={options.sites}
                locationOptions={options.locations}
                rowSelection={rowSelection}
                setRowSelection={setRowSelection}
                onSelectionChange={setSelectedParts}
                globalFilter={globalFilter}
                onGlobalFilterChange={setGlobalFilter}
                canUpdateSpareParts={canUpdateSpareParts}
                canDeleteSpareParts={canDeleteSpareParts}
                onRefresh={refresh}
                onDelete={requestDelete}
            />
        </>
    )
}