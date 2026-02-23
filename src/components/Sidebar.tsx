import { Link, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import {
    Box,
    Users,
    Wrench,
    ChevronLeft,
    ChevronRight,
    LogOut,
} from 'lucide-react'
import { authClient } from '../lib/auth-client'

const navItems = [
    { to: '/', label: 'Assets', icon: Box },
    { to: '/users' as string, label: 'Users', icon: Users },
    { to: '/parts' as string, label: 'Parts', icon: Wrench },
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
            className={`flex flex-col h-screen bg-slate-900 border-r border-slate-700/50 transition-all duration-300 ${collapsed ? 'w-16' : 'w-60'
                }`}
        >
            {/* Brand */}
            <div className="flex items-center gap-3 px-4 h-14 border-b border-slate-700/50">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 text-white font-black text-sm shrink-0">
                    L
                </div>
                {!collapsed && (
                    <span className="text-lg font-bold text-white tracking-tight">
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
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors group"
                        activeProps={{
                            className:
                                'flex items-center gap-3 px-3 py-2.5 rounded-lg bg-cyan-600/20 text-cyan-400 hover:bg-cyan-600/30 transition-colors',
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
            <div className="px-2 py-3 border-t border-slate-700/50 space-y-1">
                <button
                    onClick={handleSignOut}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-colors w-full"
                >
                    <LogOut size={20} className="shrink-0" />
                    {!collapsed && (
                        <span className="text-sm font-medium">Sign Out</span>
                    )}
                </button>

                <button
                    onClick={() => setCollapsed(!collapsed)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors w-full"
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
