import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'

import {
  ASSET_STATUS_DASHBOARD_QUERY_KEY,
  type AssetStatusDashboardRow,
} from '../data/dashboard.api'
import { reportClientError } from '../lib/client-error-logger'
import {
  REALTIME_EVENT_TYPES,
  type MachineClinicalStatusChangedEvent,
  type RealtimeEvent,
} from '../lib/realtime-events'

function isMachineClinicalStatusChangedEvent(
  event: RealtimeEvent,
): event is MachineClinicalStatusChangedEvent {
  return (
    event.type === REALTIME_EVENT_TYPES.machineClinicalStatusChanged &&
    typeof event.assetId === 'number'
  )
}

export default function RealtimeEventSubscriber() {
  const queryClient = useQueryClient()
  const router = useRouter()

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.EventSource === 'undefined') {
      return
    }

    const eventSource = new window.EventSource('/api/realtime')
    let errorReportedForConnection = false
    let hasOpened = false

    const patchMachineClinicalStatusCache = (event: MachineClinicalStatusChangedEvent) => {
      queryClient.setQueryData(['machine-clinical-status', event.assetId], {
        assetId: event.assetId,
        status: event.status,
      })

      queryClient.setQueryData(
        ['machine-clinical-asset-context', event.assetId],
        (current: { assetId: number; status: string } | undefined) => current
          ? { ...current, status: event.status }
          : current,
      )

      queryClient.setQueriesData(
        { queryKey: ['machine-clinical-assets-by-site'] },
        (current: Array<{ assetId: number; status: string }> | undefined) => current?.map((asset) => (
          asset.assetId === event.assetId
            ? { ...asset, status: event.status }
            : asset
        )),
      )

      queryClient.setQueriesData(
        { queryKey: ['siteEquipment'] },
        (current: { assets?: Array<{ assetId: number; status: string }> } | undefined) => current
          ? {
            ...current,
            assets: current.assets?.map((asset) => (
              asset.assetId === event.assetId
                ? { ...asset, status: event.status }
                : asset
            )),
          }
          : current,
      )

      queryClient.setQueriesData(
        { queryKey: ASSET_STATUS_DASHBOARD_QUERY_KEY },
        (current: AssetStatusDashboardRow[] | undefined) => current?.map((asset) => (
          asset.assetId === event.assetId
            ? { ...asset, status: event.status }
            : asset
        )),
      )
    }

    const invalidateMachineClinicalStatus = (event: MachineClinicalStatusChangedEvent) => {
      patchMachineClinicalStatusCache(event)
      void queryClient.invalidateQueries({ queryKey: ['machine-clinical-status', event.assetId] })
      void queryClient.invalidateQueries({ queryKey: ['machine-clinical-asset-context', event.assetId] })
      void queryClient.invalidateQueries({ queryKey: ['machine-clinical-assets-by-site'] })
      void queryClient.invalidateQueries({ queryKey: ['siteEquipment'] })
      void queryClient.invalidateQueries({ queryKey: ['assets-admin-data'] })
      void queryClient.invalidateQueries({ queryKey: ASSET_STATUS_DASHBOARD_QUERY_KEY })
      void router.invalidate()
    }

    const handleMachineClinicalStatusChanged = (message: MessageEvent<string>) => {
      try {
        const event = JSON.parse(message.data) as RealtimeEvent
        if (!isMachineClinicalStatusChangedEvent(event)) return

        invalidateMachineClinicalStatus(event)
      } catch (error) {
        void reportClientError('CLIENT_REALTIME_EVENT_PARSE_ERROR', error, {
          eventType: REALTIME_EVENT_TYPES.machineClinicalStatusChanged,
        })
      }
    }

    const handleOpen = () => {
      const isReconnect = hasOpened
      hasOpened = true
      errorReportedForConnection = false
      if (!isReconnect) return

      void queryClient.invalidateQueries({ queryKey: ['machine-clinical-status'] })
      void queryClient.invalidateQueries({ queryKey: ASSET_STATUS_DASHBOARD_QUERY_KEY })
      void router.invalidate()
    }

    const handleError = () => {
      if (eventSource.readyState !== window.EventSource.CLOSED) return

      if (hasOpened && !errorReportedForConnection) {
        errorReportedForConnection = true
        void reportClientError(
          'CLIENT_REALTIME_STREAM_ERROR',
          new Error('Realtime event stream disconnected'),
          { readyState: eventSource.readyState },
        )
      }

      void queryClient.invalidateQueries({ queryKey: ['machine-clinical-status'] })
      void queryClient.invalidateQueries({ queryKey: ASSET_STATUS_DASHBOARD_QUERY_KEY })
      void router.invalidate()
    }

    eventSource.addEventListener('open', handleOpen)
    eventSource.addEventListener(
      REALTIME_EVENT_TYPES.machineClinicalStatusChanged,
      handleMachineClinicalStatusChanged as EventListener,
    )
    eventSource.addEventListener('error', handleError)

    return () => {
      eventSource.removeEventListener('open', handleOpen)
      eventSource.removeEventListener(
        REALTIME_EVENT_TYPES.machineClinicalStatusChanged,
        handleMachineClinicalStatusChanged as EventListener,
      )
      eventSource.removeEventListener('error', handleError)
      eventSource.close()
    }
  }, [queryClient, router])

  return null
}
