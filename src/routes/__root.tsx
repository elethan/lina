import {
    HeadContent,
    Outlet,
    Scripts,
    createRootRouteWithContext,
    redirect,
} from '@tanstack/react-router'
import { authServerFn } from '../lib/server-utils'
import { getRequest } from '@tanstack/react-start/server'

import TanStackQueryProvider from '../integrations/tanstack-query/root-provider'

import appCss from '../styles.css?url'

import type { QueryClient } from '@tanstack/react-query'

interface MyRouterContext {
    queryClient: QueryClient
}

const fetchSession = authServerFn({ method: 'GET' }).handler(async () => {
    const { fetchSessionFromHeaders } = await import('../lib/session.server')

    const request = getRequest()
    if (!request) return null
    try {
        const session = await fetchSessionFromHeaders(request.headers)
        return session
    } catch {
        return null
    }
})

export const Route = createRootRouteWithContext<MyRouterContext>()({
    beforeLoad: async ({ location }) => {
        // Allow login page and API routes without auth
        if (
            location.pathname.startsWith('/login') ||
            location.pathname.startsWith('/api')
        ) {
            return { user: null }
        }

        const session = await fetchSession()

        if (!session?.user) {
            throw redirect({
                to: '/login' as string,
            })
        }

        return { user: session.user }
    },
    head: () => ({
        meta: [
            { charSet: 'utf-8' },
            { name: 'viewport', content: 'width=device-width, initial-scale=1' },
            { title: 'Lina' },
        ],
        links: [{ rel: 'stylesheet', href: appCss }],
    }),
    component: RootComponent,
    notFoundComponent: RootNotFound,
    shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <head>
                <HeadContent />
            </head>
            <body>
                {children}
                <Scripts />
            </body>
        </html>
    )
}

function RootComponent() {
    return (
        <TanStackQueryProvider>
            <Outlet />
        </TanStackQueryProvider>
    )
}

function RootNotFound() {
    return (
        <div className="min-h-screen bg-gray-50 text-gray-900 flex items-center justify-center p-6">
            <div className="w-full max-w-xl rounded-2xl border border-gray-200 bg-white shadow-sm p-8 text-center">
                <h1 className="text-2xl font-semibold">Page not found</h1>
                <p className="mt-2 text-sm text-gray-600">
                    The page you requested does not exist or may have moved.
                </p>
                <a
                    href="/"
                    className="mt-6 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-dark transition-colors"
                >
                    Go to Requests
                </a>
            </div>
        </div>
    )
}
