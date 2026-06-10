import type { ReactNode } from 'react'
import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import {
  classifyClientErrorEvent,
  getErrorMessage,
  isNetworkLikeError,
  pushClientErrorNotice,
  reportClientError,
} from '../../lib/client-error-logger'
import ClientErrorToast from '../../components/ClientErrorToast'

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
      {children}
      <ClientErrorToast />
    </QueryClientProvider>
  )
}
