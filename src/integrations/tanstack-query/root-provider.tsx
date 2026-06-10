import { useEffect, type ReactNode } from 'react'
import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import {
  classifyClientErrorEvent,
  getErrorMessage,
  isNetworkLikeError,
  pushClientErrorNotice,
  reportClientError,
} from '../../lib/client-error-logger'
import ClientErrorToast from '../../components/ClientErrorToast'
import {
  REALTIME_EVENT_TYPES,
  type MachineClinicalStatusChangedEvent,
  type RealtimeEvent,
} from '../../lib/realtime-events'

let context:
  | {
      queryClient: QueryClient
    }
  | undefined

export function getContext() {
  if (context) {
    return context
  }

  const queryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        const message = getErrorMessage(error)
        if (message.startsWith('Unauthorized') || message.startsWith('Forbidden')) {
          return
        }

        const networkLike = isNetworkLikeError(message)

        let queryKey = 'unknown'
        try {
          queryKey = JSON.stringify(query.queryKey)
        } catch {
          queryKey = 'unserializable-query-key'
        }

        void reportClientError(classifyClientErrorEvent('QUERY', error), error, {
          queryKey,
        })

        pushClientErrorNotice(
          networkLike ? 'Network Issue' : 'Data Refresh Failed',
          networkLike
            ? 'Could not reach the server while refreshing data.'
            : 'A data request failed. Try refreshing the page.',
        )
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        const message = getErrorMessage(error)
        if (message.startsWith('Unauthorized') || message.startsWith('Forbidden')) {
          return
        }

        const networkLike = isNetworkLikeError(message)

        let mutationKey = 'unknown'
        try {
          mutationKey = JSON.stringify(mutation.options.mutationKey ?? [])
        } catch {
          mutationKey = 'unserializable-mutation-key'
        }

        void reportClientError(classifyClientErrorEvent('MUTATION', error), error, {
          mutationKey,
        })

        pushClientErrorNotice(
          networkLike ? 'Network Issue' : 'Save Failed',
          networkLike
            ? 'Could not reach the server while saving your change.'
            : 'The update failed. Please try again.',
        )
      },
    }),
  })

  context = {
    queryClient,
  }

  return context
}

export default function TanStackQueryProvider({
  children,
}: {
  children: ReactNode
}) {
  const { queryClient } = getContext()

  return (
    <QueryClientProvider client={queryClient}>
      <RealtimeEventSubscriber queryClient={queryClient} />
      {children}
      <ClientErrorToast />
    </QueryClientProvider>
  )
}

function isMachineClinicalStatusChangedEvent(
  event: RealtimeEvent,
): event is MachineClinicalStatusChangedEvent {
  return (
    event.type === REALTIME_EVENT_TYPES.machineClinicalStatusChanged &&
    typeof event.assetId === 'number'
  )
}

function RealtimeEventSubscriber({
  queryClient,
}: {
  queryClient: QueryClient
}) {
  const router = useRouter()

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.EventSource === 'undefined') {
      return
    }

    const eventSource = new window.EventSource('/api/realtime')
    let errorReportedForConnection = false
    let hasOpened = false

    const invalidateMachineClinicalStatus = (event: MachineClinicalStatusChangedEvent) => {
      void queryClient.invalidateQueries({ queryKey: ['machine-clinical-status', event.assetId] })
      void queryClient.invalidateQueries({ queryKey: ['machine-clinical-asset-context', event.assetId] })
      void queryClient.invalidateQueries({ queryKey: ['machine-clinical-assets-by-site'] })
      void queryClient.invalidateQueries({ queryKey: ['siteEquipment'] })
      void queryClient.invalidateQueries({ queryKey: ['assets-admin-data'] })
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
      void router.invalidate()
    }

    const handleError = () => {
      if (!errorReportedForConnection) {
        errorReportedForConnection = true
        void reportClientError(
          'CLIENT_REALTIME_STREAM_ERROR',
          new Error('Realtime event stream disconnected'),
          { readyState: eventSource.readyState },
        )
      }

      if (eventSource.readyState !== window.EventSource.CLOSED) return

      pushClientErrorNotice(
        'Realtime Updates Paused',
        'Live machine status updates disconnected. Refreshing visible data now.',
      )
      void queryClient.invalidateQueries({ queryKey: ['machine-clinical-status'] })
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
