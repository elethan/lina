import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, redirect, useRouteContext } from '@tanstack/react-router'
import {
  type ColumnDef,
  type ColumnResizeMode,
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { Search, PlusCircle, Pencil, ArchiveX, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSetToolbar } from '../../components/ToolbarContext'
import { Button } from '../../components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog'
import { Input } from '../../components/ui/input'
import {
  createAssetAdmin,
  createAssetSystemLinkAdmin,
  createSiteAdmin,
  deleteAssetAdmin,
  deleteAssetSystemEntryAdmin,
  deleteSiteAdmin,
  decommissionAssetAdmin,
  previewCloseWarningsAdmin,
  type AssetSystemLinkRow,
  fetchAssetsAdminData,
  updateAssetAdmin,
  updateAssetSystemLinkAdmin,
  updateSiteAdmin,
  type AssetAdminRow,
  type SiteAdminRow,
} from '../../data/assets.api'

type DialogMode = 'create' | 'edit'
type AssetStatus = 'Operational' | 'De-commissioned'

type AssetFormState = {
  serialNumber: string
  modelName: string
  warrantyYears: string
  catDate: string
  installationDate: string
  status: AssetStatus
  siteId: string
  systemIds: number[]
}

type SystemFormState = {
  systemId: string
  serialNumber: string
  swVersion: string
  userCredentials: string
  adminCredentials: string
  status: AssetStatus
}

type CloseTarget =
  | {
      kind: 'system'
      label: string
      assetId: number
      systemId: number
    }
  | {
      kind: 'asset'
      label: string
      assetId: number
    }
  | {
      kind: 'site'
      label: string
      siteId: number
    }

const siteColumnHelper = createColumnHelper<SiteAdminRow>()
const assetColumnHelper = createColumnHelper<AssetAdminRow>()
const systemColumnHelper = createColumnHelper<AssetSystemLinkRow>()

const EMPTY_ASSET_FORM: AssetFormState = {
  serialNumber: '',
  modelName: '',
  warrantyYears: '',
  catDate: '',
  installationDate: '',
  status: 'Operational',
  siteId: '',
  systemIds: [],
}

const EMPTY_SYSTEM_FORM: SystemFormState = {
  systemId: '',
  serialNumber: '',
  swVersion: '',
  userCredentials: '',
  adminCredentials: '',
  status: 'Operational',
}

function toYmd(value: string | null): string {
  if (!value) return '—'

  const ymd = value.match(/^(\d{4}-\d{2}-\d{2})/)
  if (ymd) return ymd[1]

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toISOString().slice(0, 10)
}

function toDateInputValue(value: string | null): string {
  if (!value) return ''
  return toYmd(value)
}

export const Route = createFileRoute('/_app/assets' as any)({
  beforeLoad: ({ context }) => {
    const role = String((context as any).user?.role ?? '').toLowerCase()
    if (!role) {
      throw redirect({ to: '/login' })
    }
    if (!['admin', 'engineer', 'scientist'].includes(role)) {
      throw redirect({ to: '/' })
    }
  },
  component: AssetsPage,
})

function statusBadge(status: string) {
  if (status === 'De-commissioned') {
    return 'inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200'
  }
  return 'inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary-darker border border-primary/20'
}

function AssetsPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [selectedSiteId, setSelectedSiteId] = useState<number | null>(null)
  const [selectedAssetId, setSelectedAssetId] = useState<number | null>(null)
  const [selectedSystemKey, setSelectedSystemKey] = useState<string | null>(null)

  const [siteDialogOpen, setSiteDialogOpen] = useState(false)
  const [siteDialogMode, setSiteDialogMode] = useState<DialogMode>('create')
  const [siteFormName, setSiteFormName] = useState('')
  const [editingSiteId, setEditingSiteId] = useState<number | null>(null)

  const [systemDialogOpen, setSystemDialogOpen] = useState(false)
  const [systemDialogMode, setSystemDialogMode] = useState<DialogMode>('create')
  const [systemForm, setSystemForm] = useState<SystemFormState>(EMPTY_SYSTEM_FORM)
  const [editingSystemId, setEditingSystemId] = useState<number | null>(null)

  const [assetDialogOpen, setAssetDialogOpen] = useState(false)
  const [assetDialogMode, setAssetDialogMode] = useState<DialogMode>('create')
  const [editingAssetId, setEditingAssetId] = useState<number | null>(null)
  const [assetForm, setAssetForm] = useState<AssetFormState>(EMPTY_ASSET_FORM)

  const [closeDialogOpen, setCloseDialogOpen] = useState(false)
  const [pendingCloseTarget, setPendingCloseTarget] = useState<CloseTarget | null>(null)
  const [closeWarnings, setCloseWarnings] = useState<string[]>([])
  const [isLoadingCloseWarnings, setIsLoadingCloseWarnings] = useState(false)

  const [systemColumnResizeMode] = useState<ColumnResizeMode>('onChange')

  const { user } = useRouteContext({ from: '/_app' })
  const canWrite = String(user?.role ?? '').toLowerCase() === 'admin'

  const { data, isLoading } = useQuery({
    queryKey: ['assets-admin-data'],
    queryFn: () => fetchAssetsAdminData(),
  })

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['assets-admin-data'] })
  }

  const createSiteMutation = useMutation({
    mutationFn: async (name: string) => createSiteAdmin({ data: { name } }),
    onSuccess: refresh,
    onError: (e: Error) => alert(e.message || 'Failed to create site'),
  })

  const updateSiteMutation = useMutation({
    mutationFn: async (payload: { siteId: number; name: string }) => updateSiteAdmin({ data: payload }),
    onSuccess: refresh,
    onError: (e: Error) => alert(e.message || 'Failed to update site'),
  })

  const createSystemMutation = useMutation({
    mutationFn: async (payload: {
      assetId: number
      systemId: number
      serialNumber?: string | null
      swVersion?: string | null
      userCredentials?: string | null
      adminCredentials?: string | null
      status?: AssetStatus
    }) => createAssetSystemLinkAdmin({ data: payload }),
    onSuccess: refresh,
    onError: (e: Error) => alert(e.message || 'Failed to add system link'),
  })

  const createAssetMutation = useMutation({
    mutationFn: async (payload: {
      serialNumber: string
      modelName?: string
      warrantyYears?: number | null
      catDate?: string | null
      installationDate?: string | null
      status: AssetStatus
      siteId: number
      systemIds: number[]
    }) => createAssetAdmin({ data: payload }),
    onSuccess: refresh,
    onError: (e: Error) => alert(e.message || 'Failed to create asset'),
  })

  const updateAssetMutation = useMutation({
    mutationFn: async (payload: {
      assetId: number
      serialNumber: string
      modelName?: string
      warrantyYears?: number | null
      catDate?: string | null
      installationDate?: string | null
      status: AssetStatus
      siteId: number
      systemIds: number[]
    }) => updateAssetAdmin({ data: payload }),
    onSuccess: refresh,
    onError: (e: Error) => alert(e.message || 'Failed to update asset'),
  })

  const decommissionAssetMutation = useMutation({
    mutationFn: async (assetId: number) => decommissionAssetAdmin({ data: { assetId } }),
    onSuccess: refresh,
    onError: (e: Error) => alert(e.message || 'Failed to de-commission asset'),
  })

  const deleteSiteMutation = useMutation({
    mutationFn: async (siteId: number) => deleteSiteAdmin({ data: { siteId } }),
    onSuccess: refresh,
    onError: (e: Error) => alert(e.message || 'Failed to delete site'),
  })

  const deleteAssetMutation = useMutation({
    mutationFn: async (assetId: number) => deleteAssetAdmin({ data: { assetId } }),
    onSuccess: refresh,
    onError: (e: Error) => alert(e.message || 'Failed to delete asset'),
  })

  const deleteSystemLinkMutation = useMutation({
    mutationFn: async (payload: { assetId: number; systemId: number }) => deleteAssetSystemEntryAdmin({ data: payload }),
    onSuccess: refresh,
    onError: (e: Error) => alert(e.message || 'Failed to delete asset-system entry'),
  })

  const previewCloseWarningsMutation = useMutation({
    mutationFn: async (payload: { kind: 'asset' | 'system'; assetId: number; systemId?: number } | { kind: 'site'; siteId: number }) =>
      previewCloseWarningsAdmin({ data: payload }),
    onError: (e: Error) => alert(e.message || 'Failed to load deletion warnings'),
  })

  const updateSystemLinkMutation = useMutation({
    mutationFn: async (payload: {
      assetId: number
      systemId: number
      serialNumber?: string | null
      swVersion?: string | null
      userCredentials?: string | null
      adminCredentials?: string | null
      status: AssetStatus
    }) => updateAssetSystemLinkAdmin({ data: payload }),
    onSuccess: refresh,
    onError: (e: Error) => alert(e.message || 'Failed to update system link'),
  })

  const sites = data?.sites ?? []
  const systems = data?.systems ?? []
  const assets = data?.assets ?? []
  const q = search.trim().toLowerCase()

  const openCreateSiteDialog = () => {
    setSiteDialogMode('create')
    setEditingSiteId(null)
    setSiteFormName('')
    setSiteDialogOpen(true)
  }

  const openEditSiteDialog = (site: SiteAdminRow) => {
    setSiteDialogMode('edit')
    setEditingSiteId(site.id)
    setSiteFormName(site.name)
    setSiteDialogOpen(true)
  }

  const openCreateSystemDialog = () => {
    setSystemDialogMode('create')
    setEditingSystemId(null)
    setSystemForm(EMPTY_SYSTEM_FORM)
    setSystemDialogOpen(true)
  }

  const openEditSystemDialog = (system: AssetSystemLinkRow) => {
    setSystemDialogMode('edit')
    setEditingSystemId(system.systemId)
    setSystemForm({
      systemId: String(system.systemId),
      serialNumber: system.serialNumber ?? '',
      swVersion: system.swVersion ?? '',
      userCredentials: system.userCredentials ?? '',
      adminCredentials: system.adminCredentials ?? '',
      status: system.status === 'De-commissioned' ? 'De-commissioned' : 'Operational',
    })
    setSystemDialogOpen(true)
  }

  const openCreateAssetDialog = () => {
    setAssetDialogMode('create')
    setEditingAssetId(null)
    setAssetForm({
      ...EMPTY_ASSET_FORM,
      siteId: selectedSiteId ? String(selectedSiteId) : '',
    })
    setAssetDialogOpen(true)
  }

  const openEditAssetDialog = (asset: AssetAdminRow) => {
    setAssetDialogMode('edit')
    setEditingAssetId(asset.id)
    setAssetForm({
      serialNumber: asset.serialNumber,
      modelName: asset.modelName ?? '',
      warrantyYears: asset.warrantyYears === null ? '' : String(asset.warrantyYears),
      catDate: toDateInputValue(asset.catDate),
      installationDate: toDateInputValue(asset.installationDate),
      status: asset.status === 'De-commissioned' ? 'De-commissioned' : 'Operational',
      siteId: asset.siteId === null ? '' : String(asset.siteId),
      systemIds: [...asset.systemIds],
    })
    setAssetDialogOpen(true)
  }

  const toggleAssetSystem = (systemId: number) => {
    setAssetForm((prev) => {
      const hasSystem = prev.systemIds.includes(systemId)
      return {
        ...prev,
        systemIds: hasSystem
          ? prev.systemIds.filter((id) => id !== systemId)
          : [...prev.systemIds, systemId],
      }
    })
  }

  const handleSiteSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const name = siteFormName.trim()
    if (!name) {
      alert('Site name is required')
      return
    }

    try {
      if (siteDialogMode === 'create') {
        await createSiteMutation.mutateAsync(name)
      } else {
        if (!editingSiteId) {
          alert('Missing site ID')
          return
        }
        await updateSiteMutation.mutateAsync({ siteId: editingSiteId, name })
      }
      setSiteDialogOpen(false)
    } catch {
      // Error is surfaced by mutation onError.
    }
  }

  const handleSystemSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const linkPayload = {
      serialNumber: systemForm.serialNumber.trim() || null,
      swVersion: systemForm.swVersion.trim() || null,
      userCredentials: systemForm.userCredentials.trim() || null,
      adminCredentials: systemForm.adminCredentials.trim() || null,
      status: systemDialogMode === 'create' ? 'Operational' as AssetStatus : systemForm.status,
    }

    try {
      if (systemDialogMode === 'create') {
        if (!selectedAssetId) {
          alert('Select an asset first')
          return
        }

        const systemId = Number(systemForm.systemId)
        if (!systemId) {
          alert('Select a system')
          return
        }

        if (selectedAsset?.systemIds.includes(systemId)) {
          alert('This system is already linked to the selected asset')
          return
        }

        await createSystemMutation.mutateAsync({
          assetId: selectedAssetId,
          systemId,
          ...linkPayload,
        })
      } else {
        if (!editingSystemId) {
          alert('Missing system ID')
          return
        }

        if (selectedAssetId) {
          await updateSystemLinkMutation.mutateAsync({
            assetId: selectedAssetId,
            systemId: editingSystemId,
            ...linkPayload,
          })
        }
      }
      setSystemDialogOpen(false)
    } catch {
      // Error is surfaced by mutation onError.
    }
  }

  const handleAssetSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const serialNumber = assetForm.serialNumber.trim()
    if (!serialNumber) {
      alert('Serial number is required')
      return
    }

    const siteId = Number(assetForm.siteId)
    if (!siteId) {
      alert('Site is required')
      return
    }

    if (assetForm.systemIds.length === 0) {
      alert('At least one system is required')
      return
    }

    const warrantyRaw = assetForm.warrantyYears.trim()
    let warrantyYears: number | null = null
    if (warrantyRaw !== '') {
      const parsedWarranty = Number(warrantyRaw)
      if (!Number.isInteger(parsedWarranty) || parsedWarranty < 0) {
        alert('Warranty years must be a non-negative integer')
        return
      }
      warrantyYears = parsedWarranty
    }

    const payload = {
      serialNumber,
      modelName: assetForm.modelName.trim() || undefined,
      warrantyYears,
      catDate: assetForm.catDate || null,
      installationDate: assetForm.installationDate || null,
      status: assetForm.status,
      siteId,
      systemIds: assetForm.systemIds,
    }

    try {
      if (assetDialogMode === 'create') {
        await createAssetMutation.mutateAsync(payload)
      } else {
        if (!editingAssetId) {
          alert('Missing asset ID')
          return
        }
        await updateAssetMutation.mutateAsync({
          assetId: editingAssetId,
          ...payload,
        })
      }
      setAssetDialogOpen(false)
    } catch {
      // Error is surfaced by mutation onError.
    }
  }

  const toolbarConfig = useMemo(() => ({
    title: 'Assets',
    leftContent: (
      <div className="relative flex-1 min-w-64 max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          id="assets-search"
          type="text"
          placeholder="Search sites, assets, systems..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setSelectedSiteId(null)
            setSelectedAssetId(null)
            setSelectedSystemKey(null)
          }}
          className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15 transition-colors"
        />
      </div>
    ),
    rightContent: canWrite ? (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={openCreateSiteDialog}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-white text-gray-700 border border-gray-200 shadow-sm hover:bg-gray-50 transition-colors"
        >
          <PlusCircle size={16} />
          Add Site
        </button>
        <button
          type="button"
          onClick={openCreateSystemDialog}
          disabled={selectedAssetId === null}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-white text-gray-700 border border-gray-200 shadow-sm hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
        >
          <PlusCircle size={16} />
          Add System
        </button>
        <button
          type="button"
          onClick={openCreateAssetDialog}
          disabled={selectedSiteId === null}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white shadow-sm hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-primary"
        >
          <PlusCircle size={16} />
          Add Asset
        </button>
      </div>
    ) : null,
  }), [
    search,
    canWrite,
    selectedAssetId,
    selectedSiteId,
  ])

  useSetToolbar(toolbarConfig)

  const filteredSites = useMemo(
    () => (q ? sites.filter((site) => site.name.toLowerCase().includes(q)) : sites),
    [q, sites],
  )

  const filteredAssets = useMemo(
    () => (q
      ? assets.filter((asset) =>
          `${asset.serialNumber} ${asset.modelName ?? ''} ${asset.siteName ?? ''} ${asset.status} ${asset.systemNames.join(' ')}`
            .toLowerCase()
            .includes(q),
        )
      : assets),
    [assets, q],
  )

  const selectedSite = useMemo(
    () => (selectedSiteId === null ? null : sites.find((site) => site.id === selectedSiteId) ?? null),
    [selectedSiteId, sites],
  )

  const visibleAssets = useMemo(() => {
    if (selectedSiteId === null) return filteredAssets
    return filteredAssets.filter((asset) => asset.siteId === selectedSiteId)
  }, [filteredAssets, selectedSiteId])

  const selectedAsset = useMemo(
    () => (selectedAssetId === null ? null : visibleAssets.find((asset) => asset.id === selectedAssetId) ?? null),
    [selectedAssetId, visibleAssets],
  )

  const visibleSystems = useMemo(() => {
    const allLinks = assets.flatMap((asset) => asset.systemLinks)

    const searchFiltered = q
      ? allLinks.filter((system) =>
          `${system.systemName} ${system.serialNumber ?? ''} ${system.swVersion ?? ''} ${system.userCredentials ?? ''} ${system.adminCredentials ?? ''} ${system.status}`
            .toLowerCase()
            .includes(q),
        )
      : allLinks

    if (selectedAssetId !== null) {
      return searchFiltered.filter((system) => system.assetId === selectedAssetId)
    }

    if (selectedSiteId !== null) {
      return []
    }

    return searchFiltered
  }, [assets, q, selectedAssetId, selectedSiteId])

  useEffect(() => {
    if (selectedSiteId !== null && !filteredSites.some((site) => site.id === selectedSiteId)) {
      setSelectedSiteId(null)
      setSelectedAssetId(null)
      setSelectedSystemKey(null)
      return
    }

    if (selectedSiteId !== null) {
      const assetsForSite = filteredAssets.filter((asset) => asset.siteId === selectedSiteId)
      if (assetsForSite.length === 0) {
        if (selectedAssetId !== null) setSelectedAssetId(null)
        if (selectedSystemKey !== null) setSelectedSystemKey(null)
        return
      }

      if (selectedAssetId !== null && !assetsForSite.some((asset) => asset.id === selectedAssetId)) {
        setSelectedAssetId(null)
        if (selectedSystemKey !== null) setSelectedSystemKey(null)
      }
    }

    if (selectedSiteId === null && selectedAssetId !== null && !filteredAssets.some((asset) => asset.id === selectedAssetId)) {
      setSelectedAssetId(null)
      setSelectedSystemKey(null)
    }
  }, [filteredAssets, filteredSites, selectedAssetId, selectedSiteId, selectedSystemKey])

  useEffect(() => {
    if (selectedSystemKey === null) return
    if (!visibleSystems.some((system) => `${system.assetId}-${system.systemId}` === selectedSystemKey)) {
      setSelectedSystemKey(null)
    }
  }, [selectedSystemKey, visibleSystems])

  const handleCloseSelected = async () => {
    if (!pendingCloseTarget) return

    try {
      if (pendingCloseTarget.kind === 'system') {
        await deleteSystemLinkMutation.mutateAsync({
          assetId: pendingCloseTarget.assetId,
          systemId: pendingCloseTarget.systemId,
        })
        setSelectedSystemKey(null)
      } else if (pendingCloseTarget.kind === 'asset') {
        await deleteAssetMutation.mutateAsync(pendingCloseTarget.assetId)
        setSelectedAssetId(null)
        setSelectedSystemKey(null)
      } else {
        await deleteSiteMutation.mutateAsync(pendingCloseTarget.siteId)
        setSelectedSiteId(null)
        setSelectedAssetId(null)
        setSelectedSystemKey(null)
      }
      setCloseDialogOpen(false)
      setPendingCloseTarget(null)
      setCloseWarnings([])
    } catch {
      // Error is surfaced by mutation onError.
    }
  }

  useEffect(() => {
    if (!closeDialogOpen || pendingCloseTarget === null) {
      setIsLoadingCloseWarnings(false)
      return
    }

    let active = true
    setIsLoadingCloseWarnings(true)

    const payload = pendingCloseTarget.kind === 'asset'
      ? {
          kind: 'asset' as const,
          assetId: pendingCloseTarget.assetId,
        }
      : pendingCloseTarget.kind === 'system'
        ? {
          kind: 'system' as const,
          assetId: pendingCloseTarget.assetId,
          systemId: pendingCloseTarget.systemId,
        }
        : {
          kind: 'site' as const,
          siteId: pendingCloseTarget.siteId,
        }

    previewCloseWarningsMutation
      .mutateAsync(payload)
      .then((result) => {
        if (!active) return
        setCloseWarnings(result.warnings ?? [])
      })
      .catch(() => {
        if (!active) return
        setCloseWarnings([])
      })
      .finally(() => {
        if (!active) return
        setIsLoadingCloseWarnings(false)
      })

    return () => {
      active = false
    }
  }, [closeDialogOpen, pendingCloseTarget])

  const siteColumns = useMemo<ColumnDef<SiteAdminRow, any>[]>(() => {
    const columns: ColumnDef<SiteAdminRow, any>[] = [
      siteColumnHelper.accessor('name', {
        header: 'Site',
        cell: (info) => <span className="text-gray-800 font-medium">{info.getValue()}</span>,
      }),
    ]

    if (canWrite) {
      columns.push(
        siteColumnHelper.display({
          id: 'actions',
          header: () => <div className="text-right">Actions</div>,
          cell: ({ row }) => (
            <div className="inline-flex gap-2 justify-end w-full">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  openEditSiteDialog(row.original)
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                <Pencil size={14} />
                Edit
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  const target: CloseTarget = {
                    kind: 'site',
                    label: row.original.name,
                    siteId: row.original.id,
                  }
                  setCloseWarnings([])
                  setIsLoadingCloseWarnings(true)
                  setPendingCloseTarget(target)
                  setCloseDialogOpen(true)
                }}
                className="inline-flex items-center justify-center p-2 rounded-md border border-red-200 text-red-700 hover:bg-red-50"
                title={`Delete site ${row.original.name}`}
                aria-label={`Delete site ${row.original.name}`}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ),
        }),
      )
    }

    return columns
  }, [canWrite])

  const assetColumns = useMemo<ColumnDef<AssetAdminRow, any>[]>(() => {
    const columns: ColumnDef<AssetAdminRow, any>[] = [
      assetColumnHelper.accessor('serialNumber', {
        header: 'Serial No.',
        cell: (info) => <span className="font-mono text-xs text-gray-900">{info.getValue()}</span>,
      }),
      assetColumnHelper.accessor('modelName', {
        header: 'Model',
        cell: (info) => <span>{info.getValue() ?? '—'}</span>,
      }),
      assetColumnHelper.accessor('siteName', {
        header: 'Site',
        cell: (info) => <span>{info.getValue() ?? '—'}</span>,
      }),
      assetColumnHelper.accessor('status', {
        header: 'Status',
        cell: (info) => <span className={statusBadge(info.getValue())}>{info.getValue()}</span>,
      }),
    ]

    if (canWrite) {
      columns.push(
        assetColumnHelper.display({
          id: 'actions',
          header: () => <div className="text-right">Actions</div>,
          cell: ({ row }) => (
            <div className="inline-flex gap-2 justify-end w-full">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  openEditAssetDialog(row.original)
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                <Pencil size={14} />
                Edit
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  const target: CloseTarget = {
                    kind: 'asset',
                    label: row.original.serialNumber,
                    assetId: row.original.id,
                  }
                  setCloseWarnings([])
                  setIsLoadingCloseWarnings(true)
                  setPendingCloseTarget(target)
                  setCloseDialogOpen(true)
                }}
                className="inline-flex items-center justify-center p-2 rounded-md border border-red-200 text-red-700 hover:bg-red-50"
                title={`Delete asset ${row.original.serialNumber}`}
                aria-label={`Delete asset ${row.original.serialNumber}`}
              >
                <Trash2 size={14} />
              </button>
              {row.original.status !== 'De-commissioned' && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    if (confirm('De-commission this asset?')) {
                      decommissionAssetMutation.mutate(row.original.id)
                    }
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-red-200 text-red-700 hover:bg-red-50"
                >
                  <ArchiveX size={14} />
                  De-commission
                </button>
              )}
            </div>
          ),
        }),
      )
    }

    return columns
  }, [canWrite])

  const systemColumns = useMemo<ColumnDef<AssetSystemLinkRow, any>[]>(() => {
    const columns: ColumnDef<AssetSystemLinkRow, any>[] = [
      systemColumnHelper.accessor('systemName', {
        header: 'System',
        size: 140,
        cell: (info) => <span className="text-gray-800 font-medium">{info.getValue()}</span>,
      }),
      systemColumnHelper.accessor('serialNumber', {
        header: 'Serial Number',
        size: 130,
        cell: (info) => <span>{info.getValue() ?? '—'}</span>,
      }),
      systemColumnHelper.accessor('swVersion', {
        header: 'SW Version',
        size: 130,
        cell: (info) => <span>{info.getValue() ?? '—'}</span>,
      }),
      systemColumnHelper.accessor('userCredentials', {
        header: 'User Credentials',
        size: 180,
        cell: (info) => <span>{info.getValue() ?? '—'}</span>,
      }),
      systemColumnHelper.accessor('adminCredentials', {
        header: 'Admin Credentials',
        size: 180,
        cell: (info) => <span>{info.getValue() ?? '—'}</span>,
      }),
      systemColumnHelper.accessor('status', {
        header: 'Status',
        size: 140,
        cell: (info) => <span className={statusBadge(info.getValue())}>{info.getValue()}</span>,
      }),
    ]

    if (canWrite) {
      columns.push(
        systemColumnHelper.display({
          id: 'actions',
          header: () => <div className="text-right">Actions</div>,
          size: 120,
          cell: ({ row }) => (
            <div className="inline-flex gap-2 justify-end w-full">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  openEditSystemDialog(row.original)
                }}
                disabled={selectedAssetId === null}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
              >
                <Pencil size={14} />
                Edit
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  const target: CloseTarget = {
                    kind: 'system',
                    label: row.original.systemName,
                    assetId: row.original.assetId,
                    systemId: row.original.systemId,
                  }
                  setCloseWarnings([])
                  setIsLoadingCloseWarnings(true)
                  setPendingCloseTarget(target)
                  setCloseDialogOpen(true)
                }}
                className="inline-flex items-center justify-center p-2 rounded-md border border-red-200 text-red-700 hover:bg-red-50"
                title={`Delete system ${row.original.systemName}`}
                aria-label={`Delete system ${row.original.systemName}`}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ),
        }),
      )
    }

    return columns
  }, [canWrite, selectedAssetId])

  const sitesTable = useReactTable({
    data: filteredSites,
    columns: siteColumns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => String(row.id),
  })

  const assetsTable = useReactTable({
    data: visibleAssets,
    columns: assetColumns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => String(row.id),
  })

  const systemsTable = useReactTable({
    data: visibleSystems,
    columns: systemColumns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => `${row.assetId}-${row.systemId}`,
    columnResizeMode: systemColumnResizeMode,
    enableColumnResizing: true,
  })

  const detailFields = useMemo(() => {
    if (!selectedAsset) return [] as Array<{ label: string; value: string }>

    return [
      { label: 'Serial Number', value: selectedAsset.serialNumber },
      { label: 'Model Name', value: selectedAsset.modelName ?? '—' },
      { label: 'Warranty Years', value: selectedAsset.warrantyYears === null ? '—' : String(selectedAsset.warrantyYears) },
      { label: 'CAT Date', value: toYmd(selectedAsset.catDate) },
      { label: 'Installation Date', value: toYmd(selectedAsset.installationDate) },
      { label: 'Status', value: selectedAsset.status },
      { label: 'Site Name', value: selectedAsset.siteName ?? '—' },
    ]
  }, [selectedAsset])

  return (
    <>
      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        <section className="grid grid-cols-1 gap-5 xl:grid-cols-12">
          <section className="rounded-xl border border-gray-200 bg-white overflow-hidden xl:col-span-3">
            <div className="px-4 py-3 border-b border-gray-200">
              <h2 className="text-sm font-semibold text-gray-900">Sites</h2>
              <p className="text-xs text-gray-500">
                {selectedSite ? `Selected: ${selectedSite.name}` : 'Select a site to focus the asset list.'}
              </p>
            </div>
            <div className="h-[13rem] overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  {sitesTable.getHeaderGroups().map((headerGroup) => (
                    <tr key={headerGroup.id}>
                      {headerGroup.headers.map((header) => (
                        <th key={header.id} className="sticky top-0 z-10 text-left px-4 py-2 font-semibold text-gray-600 bg-gray-50">
                          {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td className="px-4 py-4 text-gray-400" colSpan={sitesTable.getAllLeafColumns().length || 1}>
                        Loading sites...
                      </td>
                    </tr>
                  ) : sitesTable.getRowModel().rows.length === 0 ? (
                    <tr>
                      <td className="px-4 py-4 text-gray-400" colSpan={sitesTable.getAllLeafColumns().length || 1}>
                        No sites found.
                      </td>
                    </tr>
                  ) : (
                    sitesTable.getRowModel().rows.map((row) => (
                      <tr
                        key={row.id}
                        onClick={() => {
                          setSelectedSiteId(row.original.id)
                          setSelectedAssetId(null)
                          setSelectedSystemKey(null)
                        }}
                        className={`border-b border-gray-100 last:border-b-0 cursor-pointer transition-colors ${selectedSiteId === row.original.id ? 'bg-primary/5 hover:bg-primary/8' : 'hover:bg-gray-50'}`}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <td key={cell.id} className="px-4 py-3 text-gray-700">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white overflow-hidden xl:col-span-9">
            <div className="px-4 py-3 border-b border-gray-200">
              <h2 className="text-sm font-semibold text-gray-900">Assets</h2>
              <p className="text-xs text-gray-500">
                {selectedSite
                  ? `Showing assets for ${selectedSite.name}.`
                  : 'All assets are shown. Select a site to narrow this list.'}
              </p>
            </div>
            <div className="h-[13rem] overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  {assetsTable.getHeaderGroups().map((headerGroup) => (
                    <tr key={headerGroup.id}>
                      {headerGroup.headers.map((header) => (
                        <th key={header.id} className="sticky top-0 z-10 text-left px-4 py-2 font-semibold text-gray-600 bg-gray-50">
                          {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td className="px-4 py-4 text-gray-400" colSpan={assetsTable.getAllLeafColumns().length || 1}>
                        Loading assets...
                      </td>
                    </tr>
                  ) : assetsTable.getRowModel().rows.length === 0 ? (
                    <tr>
                      <td className="px-4 py-4 text-gray-400" colSpan={assetsTable.getAllLeafColumns().length || 1}>
                        No assets found.
                      </td>
                    </tr>
                  ) : (
                    assetsTable.getRowModel().rows.map((row) => (
                      <tr
                        key={row.id}
                        onClick={() => {
                          setSelectedAssetId(row.original.id)
                          setSelectedSystemKey(null)
                        }}
                        className={`border-b border-gray-100 last:border-b-0 cursor-pointer transition-colors ${selectedAssetId === row.original.id ? 'bg-primary/5 hover:bg-primary/8' : 'hover:bg-gray-50'}`}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <td key={cell.id} className="px-4 py-3 text-gray-700 align-top">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200">
            <h2 className="text-sm font-semibold text-gray-900">Asset Details</h2>
            <p className="text-xs text-gray-500">
              {selectedAsset ? `Details for ${selectedAsset.serialNumber}` : 'Select an asset to see its details.'}
            </p>
          </div>
          <div className="p-4">
            {!selectedAsset ? (
              <p className="text-sm text-gray-500">No asset selected.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                {detailFields.map((field) => (
                  <div key={field.label} className="rounded-lg border border-gray-200 bg-gray-50/40 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{field.label}</p>
                    {field.label === 'Status' ? (
                      <div className="mt-1">
                        <span className={statusBadge(field.value)}>{field.value}</span>
                      </div>
                    ) : (
                      <p className="mt-1 text-sm text-gray-900 break-words">{field.value}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200">
            <h2 className="text-sm font-semibold text-gray-900">Systems</h2>
            <p className="text-xs text-gray-500">
              {selectedAsset
                ? `Showing systems for ${selectedAsset.serialNumber}.`
                : selectedSite
                  ? `Select an asset to view systems for ${selectedSite.name}.`
                  : 'Showing all systems. Select an asset to view/edit link-specific fields.'}
            </p>
          </div>
          <div className="h-[24rem] overflow-auto">
            <table className="min-w-full text-sm" style={{ width: systemsTable.getTotalSize() }}>
              <thead className="bg-gray-50 border-b border-gray-200">
                {systemsTable.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <th
                        key={header.id}
                        style={{ width: header.getSize() }}
                        className="sticky top-0 z-10 text-left px-4 py-2 font-semibold text-gray-600 bg-gray-50 relative"
                      >
                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
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
              <tbody>
                {isLoading ? (
                  <tr>
                    <td className="px-4 py-4 text-gray-400" colSpan={systemsTable.getAllLeafColumns().length || 1}>
                      Loading systems...
                    </td>
                  </tr>
                ) : systemsTable.getRowModel().rows.length === 0 ? (
                  <tr>
                    <td className="px-4 py-4 text-gray-400" colSpan={systemsTable.getAllLeafColumns().length || 1}>
                      {selectedAsset
                        ? 'No systems found for this asset.'
                        : selectedSite
                          ? 'Select an asset to view systems for this site.'
                          : 'No systems found.'}
                    </td>
                  </tr>
                ) : (
                  systemsTable.getRowModel().rows.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => {
                        setSelectedSystemKey(`${row.original.assetId}-${row.original.systemId}`)
                      }}
                      className={`border-b border-gray-100 last:border-b-0 cursor-pointer transition-colors ${selectedSystemKey === `${row.original.assetId}-${row.original.systemId}` ? 'bg-primary/5 hover:bg-primary/8' : 'hover:bg-gray-50'}`}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} style={{ width: cell.column.getSize() }} className="px-4 py-3 text-gray-700 align-top">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <Dialog open={siteDialogOpen} onOpenChange={setSiteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{siteDialogMode === 'create' ? 'Add Site' : 'Edit Site'}</DialogTitle>
            <DialogDescription>Provide site details. All fields except IDs are editable.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSiteSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="site-name" className="text-sm font-medium text-gray-700">Name</label>
              <Input
                id="site-name"
                value={siteFormName}
                onChange={(e) => setSiteFormName(e.target.value)}
                placeholder="Enter site name"
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSiteDialogOpen(false)}>Cancel</Button>
              <Button type="submit">{siteDialogMode === 'create' ? 'Create Site' : 'Save Changes'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={systemDialogOpen} onOpenChange={setSystemDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{systemDialogMode === 'create' ? 'Add System' : 'Edit System'}</DialogTitle>
            <DialogDescription>Provide system and link details. IDs are managed automatically.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSystemSubmit} className="space-y-4">
            {systemDialogMode === 'create' ? (
              <div className="space-y-1.5">
                <label htmlFor="system-select" className="text-sm font-medium text-gray-700">System</label>
                <select
                  id="system-select"
                  value={systemForm.systemId}
                  onChange={(e) => setSystemForm((prev) => ({ ...prev, systemId: e.target.value }))}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  required
                >
                  <option value="">Select system</option>
                  {systems.map((system) => (
                    <option key={system.id} value={system.id}>{system.name}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">System</label>
                <Input
                  value={visibleSystems.find((s) => s.systemId === editingSystemId)?.systemName ?? '—'}
                  disabled
                />
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="system-serial" className="text-sm font-medium text-gray-700">Serial Number</label>
                <Input
                  id="system-serial"
                  value={systemForm.serialNumber}
                  onChange={(e) => setSystemForm((prev) => ({ ...prev, serialNumber: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="system-sw" className="text-sm font-medium text-gray-700">SW Version</label>
                <Input
                  id="system-sw"
                  value={systemForm.swVersion}
                  onChange={(e) => setSystemForm((prev) => ({ ...prev, swVersion: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <label htmlFor="system-user-cred" className="text-sm font-medium text-gray-700">User Credentials</label>
                <Input
                  id="system-user-cred"
                  value={systemForm.userCredentials}
                  onChange={(e) => setSystemForm((prev) => ({ ...prev, userCredentials: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <label htmlFor="system-admin-cred" className="text-sm font-medium text-gray-700">Admin Credentials</label>
                <Input
                  id="system-admin-cred"
                  value={systemForm.adminCredentials}
                  onChange={(e) => setSystemForm((prev) => ({ ...prev, adminCredentials: e.target.value }))}
                />
              </div>
              {systemDialogMode === 'edit' && (
                <div className="space-y-1.5 md:col-span-2">
                  <label htmlFor="system-status" className="text-sm font-medium text-gray-700">Status</label>
                  <select
                    id="system-status"
                    value={systemForm.status}
                    onChange={(e) => setSystemForm((prev) => ({ ...prev, status: e.target.value as AssetStatus }))}
                    className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  >
                    <option value="Operational">Operational</option>
                    <option value="De-commissioned">De-commissioned</option>
                  </select>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSystemDialogOpen(false)}>Cancel</Button>
              <Button type="submit">{systemDialogMode === 'create' ? 'Create System' : 'Save Changes'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={assetDialogOpen} onOpenChange={setAssetDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{assetDialogMode === 'create' ? 'Add Asset' : 'Edit Asset'}</DialogTitle>
            <DialogDescription>Provide all asset fields except IDs.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAssetSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="asset-serial" className="text-sm font-medium text-gray-700">Serial Number</label>
                <Input
                  id="asset-serial"
                  value={assetForm.serialNumber}
                  onChange={(e) => setAssetForm((prev) => ({ ...prev, serialNumber: e.target.value }))}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="asset-model" className="text-sm font-medium text-gray-700">Model Name</label>
                <Input
                  id="asset-model"
                  value={assetForm.modelName}
                  onChange={(e) => setAssetForm((prev) => ({ ...prev, modelName: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="asset-warranty" className="text-sm font-medium text-gray-700">Warranty Years</label>
                <Input
                  id="asset-warranty"
                  type="number"
                  min={0}
                  step={1}
                  value={assetForm.warrantyYears}
                  onChange={(e) => setAssetForm((prev) => ({ ...prev, warrantyYears: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="asset-status" className="text-sm font-medium text-gray-700">Status</label>
                <select
                  id="asset-status"
                  value={assetForm.status}
                  onChange={(e) => setAssetForm((prev) => ({ ...prev, status: e.target.value as AssetStatus }))}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <option value="Operational">Operational</option>
                  <option value="De-commissioned">De-commissioned</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="asset-cat-date" className="text-sm font-medium text-gray-700">CAT Date</label>
                <Input
                  id="asset-cat-date"
                  type="date"
                  value={assetForm.catDate}
                  onChange={(e) => setAssetForm((prev) => ({ ...prev, catDate: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="asset-install-date" className="text-sm font-medium text-gray-700">Installation Date</label>
                <Input
                  id="asset-install-date"
                  type="date"
                  value={assetForm.installationDate}
                  onChange={(e) => setAssetForm((prev) => ({ ...prev, installationDate: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <label htmlFor="asset-site" className="text-sm font-medium text-gray-700">Site</label>
                <select
                  id="asset-site"
                  value={assetForm.siteId}
                  onChange={(e) => setAssetForm((prev) => ({ ...prev, siteId: e.target.value }))}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  required
                >
                  <option value="">Select site</option>
                  {sites.map((site) => (
                    <option key={site.id} value={site.id}>{site.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">Systems</p>
              <div className="max-h-44 overflow-auto rounded-md border border-gray-200 p-2 space-y-1.5">
                {systems.length === 0 ? (
                  <p className="text-sm text-gray-500 px-1 py-2">No systems available.</p>
                ) : (
                  systems.map((system) => {
                    const checked = assetForm.systemIds.includes(system.id)
                    return (
                      <label key={system.id} className="flex items-center gap-2 px-1 py-1 rounded hover:bg-gray-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleAssetSystem(system.id)}
                          className="h-4 w-4"
                        />
                        <span className="text-sm text-gray-800">{system.name}</span>
                        <span className={statusBadge(system.status)}>{system.status}</span>
                      </label>
                    )
                  })
                )}
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAssetDialogOpen(false)}>Cancel</Button>
              <Button type="submit">{assetDialogMode === 'create' ? 'Create Asset' : 'Save Changes'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={closeDialogOpen} onOpenChange={(open) => {
        setCloseDialogOpen(open)
        if (!open) {
          setPendingCloseTarget(null)
          setCloseWarnings([])
          setIsLoadingCloseWarnings(false)
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Selection</DialogTitle>
            <DialogDescription>
              {pendingCloseTarget === null
                ? 'No target selected.'
                : pendingCloseTarget.kind === 'system'
                  ? `Delete system ${pendingCloseTarget.label} from the selected asset?`
                  : pendingCloseTarget.kind === 'asset'
                    ? `Delete asset ${pendingCloseTarget.label}?`
                    : `Delete site ${pendingCloseTarget.label}?`}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            {pendingCloseTarget?.kind === 'system'
              ? 'This deletes the selected asset-systems entry for that asset.'
              : 'This action permanently deletes the selected record.'}
          </p>
          {isLoadingCloseWarnings ? (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              Checking related history...
            </p>
          ) : closeWarnings.length > 0 ? (
            <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 space-y-1">
              {closeWarnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCloseDialogOpen(false)}>Cancel</Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleCloseSelected}
              disabled={
                pendingCloseTarget === null ||
                isLoadingCloseWarnings ||
                deleteSiteMutation.isPending ||
                deleteAssetMutation.isPending ||
                deleteSystemLinkMutation.isPending
              }
            >
              {deleteSiteMutation.isPending || deleteAssetMutation.isPending || deleteSystemLinkMutation.isPending
                ? 'Deleting...'
                : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
