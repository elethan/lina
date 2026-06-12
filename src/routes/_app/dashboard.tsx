import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { useCallback, useMemo, useState } from 'react'
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
  const [savingFieldKeys, setSavingFieldKeys] = useState<Set<string>>(new Set())

  const toolbarConfig = useMemo(
    () => ({
      title: 'Dashboard',
      leftContent: null,
      rightContent: null,
    }),
    [],
  )

  useSetToolbar(toolbarConfig)

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
    [updateDetailMutation],
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
      onDetailCommit={handleDetailCommit}
      isDetailSaving={isDetailSaving}
    />
  )
}
