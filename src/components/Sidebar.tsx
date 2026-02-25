import { Link, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import {
    MessageSquareText,
    ClipboardList,
    CalendarCheck,
    Settings,
    ChevronLeft,
    ChevronRight,
    LogOut,
} from 'lucide-react'
import { authClient } from '../lib/auth-client'

const navItems = [
    { to: '/', label: 'Requests', icon: MessageSquareText },
    { to: '/work-orders' as string, label: 'Work Orders', icon: ClipboardList },
    { to: '/pms' as string, label: 'PMs', icon: CalendarCheck },
    { to: '/config' as string, label: 'Config', icon: Settings },
]

export default function Sidebar() {
    const [collapsed, setCollapsed] = useState(false)
    const router = useRouter()

    const handleSignOut = async () => {
        await authClient.signOut()
        router.navigate({ to: '/login' as string })
    }

    return (
        <aside
            className={`flex flex-col h-screen bg-white border-r border-gray-200 transition-all duration-300 ${collapsed ? 'w-16' : 'w-60'
                }`}
        >
            {/* Brand */}
            <div className="flex items-center gap-3 px-4 h-14 border-b border-gray-200">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary-darker text-white font-black text-sm shrink-0">
                    L
                </div>
                {!collapsed && (
                    <span className="text-lg font-bold text-gray-900 tracking-tight">
                        Lina
                    </span>
                )}
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-2 py-4 space-y-1">
                {navItems.map((item) => (
                    <Link
                        key={item.label}
                        to={item.to}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors group"
                        activeProps={{
                            className:
                                'flex items-center gap-3 px-3 py-2.5 rounded-lg bg-primary/10 text-primary-darker font-semibold hover:bg-primary/15 transition-colors',
                        }}
                        activeOptions={{ exact: true }}
                    >
                        <item.icon size={20} className="shrink-0" />
                        {!collapsed && (
                            <span className="text-sm font-medium">{item.label}</span>
                        )}
                    </Link>
                ))}
            </nav>

            {/* Bottom actions */}
            <div className="px-2 py-3 border-t border-gray-200 space-y-1">
                <button
                    onClick={handleSignOut}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors w-full"
                >
                    <LogOut size={20} className="shrink-0" />
                    {!collapsed && (
                        <span className="text-sm font-medium">Sign Out</span>
                    )}
                </button>

                <button
                    onClick={() => setCollapsed(!collapsed)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors w-full"
                >
                    {collapsed ? (
                        <ChevronRight size={20} className="shrink-0" />
                    ) : (
                        <>
                            <ChevronLeft size={20} className="shrink-0" />
                            <span className="text-sm font-medium">Collapse</span>
                        </>
                    )}
                </button>
            </div>
        </aside>
    )
}
