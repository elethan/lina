import { Link, useRouter } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import {
    MessageSquareText,
    ClipboardList,
    CalendarCheck2,
    Boxes,
    ShieldCheck,
    SlidersHorizontal,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    LogOut,
} from 'lucide-react'
import { authClient } from '../lib/auth-client'
import {
    canPermissionMap,
    canRole,
    normalizeAppRole,
    type PermissionResource,
    ROLE_DETAILS,
    formatRoleLabel,
} from '../lib/role-permissions'
import { useQuery } from '@tanstack/react-query'
import { fetchCurrentUserPermissions } from '../data/current-user-permissions.api'
import { loadRequestsUrlState, pickRequestsUrlState, saveRequestsUrlState, type RequestsUrlState } from '../lib/requests-url-state'

const navItems = [
    { to: '/', label: 'Requests', icon: MessageSquareText, resource: 'requests' as PermissionResource },
    { to: '/work-orders' as string, label: 'Work Orders', icon: ClipboardList, resource: 'workOrders' as PermissionResource },
    { to: '/pm' as string, label: 'PM', icon: CalendarCheck2, resource: 'pmInstances' as PermissionResource },
    { to: '/assets' as string, label: 'Assets', icon: Boxes, resource: 'assetsSystems' as PermissionResource },
    { to: '/config' as string, label: 'Config', icon: SlidersHorizontal, adminOnly: true },
]

type SidebarProps = {
    userRole: string
}

export default function Sidebar({ userRole }: SidebarProps) {
    const [collapsed, setCollapsed] = useState(false)
    const [showRoleMenu, setShowRoleMenu] = useState(false)
    const [showRoleDetails, setShowRoleDetails] = useState(false)
    const router = useRouter()
    const roleMenuRef = useRef<HTMLDivElement | null>(null)

    const roleLabel = formatRoleLabel(userRole)
    const currentRole = normalizeAppRole(userRole)
    const currentPath = router.state.location.pathname
    const [savedRequestsSearch, setSavedRequestsSearch] = useState<RequestsUrlState | null>(null)
    const { data: currentPermissions } = useQuery({
        queryKey: ['current-user-permissions'],
        queryFn: () => fetchCurrentUserPermissions(),
    })

    useEffect(() => {
        setSavedRequestsSearch(loadRequestsUrlState())
    }, [])

    useEffect(() => {
        if (currentPath !== '/') return

        const next = pickRequestsUrlState(router.state.location.search as Record<string, unknown>)
        saveRequestsUrlState(next)
        setSavedRequestsSearch(next)
    }, [currentPath, router.state.location.search])

    useEffect(() => {
        if (!showRoleMenu) return

        const onPointerDown = (event: MouseEvent) => {
            const target = event.target as Node
            if (!roleMenuRef.current?.contains(target)) {
                setShowRoleMenu(false)
                setShowRoleDetails(false)
            }
        }

        document.addEventListener('mousedown', onPointerDown)
        return () => document.removeEventListener('mousedown', onPointerDown)
    }, [showRoleMenu])

    useEffect(() => {
        if (collapsed) {
            setShowRoleMenu(false)
            setShowRoleDetails(false)
        }
    }, [collapsed])

    const visibleNavItems = navItems.filter((item) =>
        item.adminOnly
            ? (currentPermissions?.role ?? currentRole) === 'admin'
            : currentPermissions
                ? canPermissionMap(currentPermissions.permissions, item.resource, 'read')
                : canRole(currentRole, item.resource, 'read')
    )

    const handleSignOut = async () => {
        await authClient.signOut()
        router.navigate({ to: '/login' as string })
    }

    const isNavItemActive = (to: string) => {
        if (to === '/') {
            return currentPath === '/'
        }

        return currentPath === to || currentPath.startsWith(`${to}/`)
    }

    return (
        <aside
            className={`flex flex-col h-screen bg-white border-r border-gray-200 transition-all duration-300 ${collapsed ? 'w-14' : 'w-52'
                }`}
        >
            {/* Brand */}
            <div className="relative flex items-center gap-2 px-4 h-16 border-b border-gray-200">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary-darker text-white font-black text-sm shrink-0">
                    L
                </div>
                {!collapsed && (
                    <>
                        <span className="text-lg font-bold text-gray-900 tracking-tight">
                            Lina
                        </span>

                        <div className="ml-auto relative" ref={roleMenuRef}>
                            <button
                                type="button"
                                onClick={() => {
                                    setShowRoleMenu((prev) => !prev)
                                    if (showRoleMenu) {
                                        setShowRoleDetails(false)
                                    }
                                }}
                                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-primary/30 bg-primary/10 text-[11px] font-semibold uppercase tracking-wide text-primary-darker hover:bg-primary/15 transition-colors"
                                aria-label="Open role menu"
                            >
                                {roleLabel}
                                <ChevronDown size={12} />
                            </button>

                            {showRoleMenu && (
                                <div className="absolute top-0 left-full ml-2 z-20 w-52 rounded-lg border border-gray-200 bg-white shadow-md p-2">
                                    <div className="px-2 py-1.5 text-[11px] uppercase tracking-wide text-gray-400">
                                        Signed In As
                                    </div>
                                    <div className="px-2 pb-2 text-sm font-semibold text-gray-800">
                                        {roleLabel}
                                    </div>
                                    <div className="h-px bg-gray-100 my-1" />
                                    <button
                                        onClick={() => setShowRoleDetails((prev) => !prev)}
                                        className="w-full flex items-center gap-2 px-2 py-2 rounded-md text-sm text-gray-600 hover:bg-gray-100 transition-colors"
                                    >
                                        <ShieldCheck size={14} />
                                        Role details
                                    </button>

                                    {showRoleDetails && (
                                        <div className="mt-1 mb-1 px-2 py-2 rounded-md bg-gray-50 border border-gray-100 space-y-1">
                                            {(ROLE_DETAILS[userRole as keyof typeof ROLE_DETAILS] ?? ROLE_DETAILS.therapist).map((item) => (
                                                <p key={item} className="text-xs text-gray-600 leading-relaxed">
                                                    {item}
                                                </p>
                                            ))}
                                        </div>
                                    )}

                                    <button
                                        onClick={handleSignOut}
                                        className="w-full flex items-center gap-2 px-2 py-2 rounded-md text-sm text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors"
                                    >
                                        <LogOut size={14} />
                                        Sign Out
                                    </button>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-2 py-4 space-y-1">
                {visibleNavItems.map((item) =>
                    item.to === '/' ? (
                        <Link
                            key={item.label}
                            to="/"
                            search={savedRequestsSearch ?? true}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${isNavItemActive(item.to)
                                ? 'bg-primary/10 text-primary-darker font-semibold'
                                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                                }`}
                            activeOptions={{ exact: true }}
                        >
                            <item.icon size={20} className="shrink-0" />
                            {!collapsed && (
                                <span className="text-sm font-medium">{item.label}</span>
                            )}
                        </Link>
                    ) : (
                        <Link
                            key={item.label}
                            to={item.to}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${isNavItemActive(item.to)
                                ? 'bg-primary/10 text-primary-darker font-semibold'
                                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                                }`}
                            activeOptions={{ exact: true }}
                        >
                            <item.icon size={20} className="shrink-0" />
                            {!collapsed && (
                                <span className="text-sm font-medium">{item.label}</span>
                            )}
                        </Link>
                    )
                )}
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
