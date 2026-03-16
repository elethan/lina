import {
    HeadContent,
    Outlet,
    Scripts,
    createRootRouteWithContext,
    redirect,
} from '@tanstack/react-router'
import { Suspense, lazy } from 'react'
import { authServerFn } from '../lib/server-utils'
import { getRequest } from '@tanstack/react-start/server'

import TanStackQueryProvider from '../integrations/tanstack-query/root-provider'

import appCss from '../styles.css?url'

import type { QueryClient } from '@tanstack/react-query'

interface MyRouterContext {
    queryClient: QueryClient
}

const AppDevtools = import.meta.env.DEV
    ? lazy(() => import('../components/AppDevtools'))
    : null

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
            {AppDevtools ? (
                <Suspense fallback={null}>
                    <AppDevtools />
                </Suspense>
            ) : null}
        </TanStackQueryProvider>
    )
}
