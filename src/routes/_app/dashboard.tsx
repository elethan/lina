import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useCallback, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { useSetToolbar } from '../../components/ToolbarContext'
import {
  ASSET_STATUS_DASHBOARD_QUERY_KEY,
  fetchAssetStatusDashboard,
  type AssetStatusDashboardEditableField,
  updateAssetStatusDashboardField,
} from '../../data/dashboard.api'
import { fetchCurrentUserPermissions } from '../../data/current-user-permissions.api'
import { AssetStatusDashboard } from '../../features/dashboard/components/AssetStatusDashboard'
import { canPermissionMap } from '../../lib/role-permissions'
import {
  buildRedirectTargetFromLocation,
  UNAUTHORIZED_REDIRECT_NOTICE,
} from '../../lib/redirect-target'

function toSavingFieldKey(assetId: number, field: AssetStatusDashboardEditableField) {
  return `${assetId}:${field}`
}

export const Route = createFileRoute('/_app/dashboard')({
  validateSearch: (search: Record<string, unknown>): { search?: string } => ({
    search: typeof search.search === 'string' ? search.search : undefined,
  }),
  beforeLoad: async ({ context, location }) => {
    const role = String((context as any).user?.role ?? '').toLowerCase()

    if (!role) {
      throw redirect({
        to: '/login',
        search: {
          redirect: buildRedirectTargetFromLocation(location),
        },
      })
    }

    const currentPermissions = await fetchCurrentUserPermissions()
    const canReadDashboard = canPermissionMap(
      currentPermissions.permissions,
      'dashboard',
      'read',
    )

    if (!canReadDashboard) {
      throw redirect({
        to: '/',
        search: {
          notice: UNAUTHORIZED_REDIRECT_NOTICE,
        },
      })
    }
  },
  component: DashboardPage,
})

function DashboardPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate({ from: '/dashboard' })
  const { search: globalFilter = '' } = Route.useSearch()
  const [savingFieldKeys, setSavingFieldKeys] = useState<Set<string>>(new Set())

  const setGlobalFilter = (value: string) =>
    navigate({ search: (prev) => ({ ...prev, search: value || undefined }) })

  const toolbarConfig = useMemo(
    () => ({
      title: 'Dashboard',
      leftContent: (
        <div className="relative flex-1 min-w-64 max-w-sm">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            id="dashboard-search"
            type="text"
            placeholder="Search serial number or site…"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15 transition-colors"
          />
        </div>
      ),
      rightContent: null,
    }),
    [globalFilter],
  )

  useSetToolbar(toolbarConfig)

  const { data: currentPermissions } = useQuery({
    queryKey: ['current-user-permissions'],
    queryFn: () => fetchCurrentUserPermissions(),
  })
  const permissionMap = currentPermissions?.permissions
  const canUpdateDashboard = canPermissionMap(permissionMap, 'dashboard', 'update')

  const updateDetailMutation = useMutation({
    mutationFn: async (payload: {
      assetId: number
      field: AssetStatusDashboardEditableField
      value: string | null
    }) => updateAssetStatusDashboardField({ data: payload }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ASSET_STATUS_DASHBOARD_QUERY_KEY })
    },
  })

  const handleDetailCommit = useCallback(
    async (payload: {
      assetId: number
      field: AssetStatusDashboardEditableField
      value: string | null
    }) => {
      if (!canUpdateDashboard) return

      const savingKey = toSavingFieldKey(payload.assetId, payload.field)
      setSavingFieldKeys((previous) => {
        const next = new Set(previous)
        next.add(savingKey)
        return next
      })

      try {
        await updateDetailMutation.mutateAsync(payload)
      } finally {
        setSavingFieldKeys((previous) => {
          const next = new Set(previous)
          next.delete(savingKey)
          return next
        })
      }
    },
    [canUpdateDashboard, updateDetailMutation],
  )

  const isDetailSaving = useCallback(
    (assetId: number, field: AssetStatusDashboardEditableField) =>
      savingFieldKeys.has(toSavingFieldKey(assetId, field)),
    [savingFieldKeys],
  )

  const { data, isLoading, error } = useQuery({
    queryKey: ASSET_STATUS_DASHBOARD_QUERY_KEY,
    queryFn: () => fetchAssetStatusDashboard(),
  })

  return (
    <AssetStatusDashboard
      rows={data ?? []}
      isLoading={isLoading}
      errorMessage={error instanceof Error ? error.message : null}
      canEditDetails={canUpdateDashboard}
      onDetailCommit={canUpdateDashboard ? handleDetailCommit : undefined}
      isDetailSaving={isDetailSaving}
      filterText={globalFilter || undefined}
    />
  )
}
