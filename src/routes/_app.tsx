import { Outlet, createFileRoute } from '@tanstack/react-router'
import Sidebar from '../components/Sidebar'
import Toolbar from '../components/Toolbar'
import { ToolbarProvider } from '../components/ToolbarContext'

export const Route = createFileRoute('/_app')({
    component: AppLayout,
})

function AppLayout() {
    return (
        <ToolbarProvider>
            <div className="flex h-screen bg-gray-50">
                <Sidebar />
                <main className="flex-1 flex flex-col overflow-hidden">
                    <Toolbar />
                    <Outlet />
                </main>
            </div>
        </ToolbarProvider>
    )
}
