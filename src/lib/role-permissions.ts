export type AppRole = 'admin' | 'engineer' | 'scientist' | 'therapist'

export const APP_ROLES = [
    'admin',
    'engineer',
    'scientist',
    'therapist',
] as const

export type PermissionResource =
    | 'requests'
    | 'workOrders'
    | 'pmInstances'
    | 'assetsSystems'
    | 'pmTasks'

export const PERMISSION_RESOURCES = [
    'requests',
    'workOrders',
    'pmInstances',
    'assetsSystems',
    'pmTasks',
] as const

export type PermissionAction =
    | 'read'
    | 'create'
    | 'update'
    | 'delete'
    | 'assign'

export type RolePermissionMap = Partial<
    Record<PermissionResource, PermissionAction[]>
>

export const PERMISSION_ACTIONS = [
    'read',
    'create',
    'update',
    'delete',
    'assign',
] as const

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
        workOrders: ['read', 'update'],
        pmInstances: ['read', 'update'],
        assetsSystems: ['read'],
        pmTasks: ['read'],
    },
    therapist: {
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
        'Can create requests and update existing work orders',
        'Can execute and edit existing PM instances',
        'Cannot create, delete, or assign work orders',
        'Can view assets and systems but cannot create/edit them',
    ],
    therapist: [
        'Can create and view requests only',
        'No access to work orders, PMs, assets, systems, or PM tasks',
    ],
}

export function formatRoleLabel(role?: string | null): string {
    if (!role) return 'Therapist'
    return role.charAt(0).toUpperCase() + role.slice(1)
}

export function normalizeAppRole(role?: string | null): AppRole {
    if (role && APP_ROLES.includes(role as AppRole)) {
        return role as AppRole
    }

    return 'therapist'
}

export function canRole(
    role: AppRole,
    resource: PermissionResource,
    action: PermissionAction,
): boolean {
    const actions = ROLE_CAPABILITIES[role]?.[resource] ?? []
    return actions.includes(action)
}

export function canPermissionMap(
    permissions: RolePermissionMap | undefined,
    resource: PermissionResource,
    action: PermissionAction,
): boolean {
    const actions = permissions?.[resource] ?? []
    return actions.includes(action)
}
