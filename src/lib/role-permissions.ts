export type AppRole = 'admin' | 'engineer' | 'scientist' | 'user'

export type PermissionResource =
    | 'requests'
    | 'workOrders'
    | 'pmInstances'
    | 'assetsSystems'
    | 'pmTasks'

export type PermissionAction =
    | 'read'
    | 'create'
    | 'update'
    | 'delete'
    | 'assign'

export const ROLE_CAPABILITIES: Record<
    AppRole,
    Partial<Record<PermissionResource, PermissionAction[]>>
> = {
    admin: {
        requests: ['read', 'create', 'update', 'delete', 'assign'],
        workOrders: ['read', 'create', 'update', 'delete', 'assign'],
        pmInstances: ['read', 'create', 'update', 'delete', 'assign'],
        assetsSystems: ['read', 'create', 'update', 'delete'],
        pmTasks: ['read', 'create', 'update', 'delete'],
    },
    engineer: {
        requests: ['read', 'create', 'update', 'delete', 'assign'],
        workOrders: ['read', 'create', 'update', 'delete', 'assign'],
        pmInstances: ['read', 'create', 'update', 'delete', 'assign'],
        assetsSystems: ['read'],
        pmTasks: ['read'],
    },
    scientist: {
        requests: ['read', 'create'],
        workOrders: ['read'],
        pmInstances: ['read'],
        assetsSystems: ['read'],
        pmTasks: ['read'],
    },
    user: {
        requests: ['read', 'create'],
    },
}

export const ROLE_DETAILS: Record<AppRole, string[]> = {
    admin: [
        'Full access to requests, work orders, PMs, assets, systems, and PM tasks',
    ],
    engineer: [
        'Can create/edit operational records (requests, work orders, PM instances)',
        'Can view assets, systems, and PM tasks but cannot create/edit them',
    ],
    scientist: [
        'Can view all modules',
        'Can create requests only; cannot create/edit other records',
    ],
    user: [
        'Can create and view requests only',
        'No access to work orders, PMs, assets, systems, or PM tasks',
    ],
}

export function formatRoleLabel(role?: string | null): string {
    if (!role) return 'User'
    return role.charAt(0).toUpperCase() + role.slice(1)
}

export function canRole(
    role: AppRole,
    resource: PermissionResource,
    action: PermissionAction,
): boolean {
    const actions = ROLE_CAPABILITIES[role]?.[resource] ?? []
    return actions.includes(action)
}
