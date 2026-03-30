import { Outlet, createFileRoute } from '@tanstack/react-router'
import Sidebar from '../components/Sidebar'

export const Route = createFileRoute('/_app')({
    beforeLoad: ({ context }) => {
        // Pass user down to child routes for role-based guards
        return { user: (context as any).user }
    },
    component: AppLayout,
})

function AppLayout() {
    const { user } = Route.useRouteContext()

    return (
        <div className="flex h-screen bg-gray-50">
            <Sidebar userRole={user?.role ?? 'user'} />
            <main className="flex-1 flex flex-col overflow-hidden">
                <Outlet />
            </main>
        </div>
    )
}
