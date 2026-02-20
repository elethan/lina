import {
    HeadContent,
    Outlet,
    Scripts,
    createRootRouteWithContext,
    redirect,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { auth } from '../lib/auth'

import TanStackQueryProvider from '../integrations/tanstack-query/root-provider'
import TanStackQueryDevtools from '../integrations/tanstack-query/devtools'

import appCss from '../styles.css?url'

import type { QueryClient } from '@tanstack/react-query'

interface MyRouterContext {
    queryClient: QueryClient
}

const fetchSession = createServerFn({ method: 'GET' }).handler(async () => {
    const request = getRequest()
    if (!request) return null
    try {
        const session = await auth.api.getSession({ headers: request.headers })
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
            <TanStackDevtools
                config={{ position: 'bottom-right' }}
                plugins={[
                    { name: 'Tanstack Router', render: <TanStackRouterDevtoolsPanel /> },
                    TanStackQueryDevtools,
                ]}
            />
        </TanStackQueryProvider>
    )
}
