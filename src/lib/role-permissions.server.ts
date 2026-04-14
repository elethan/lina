import {
    APP_ROLES,
    PERMISSION_ACTIONS,
    PERMISSION_RESOURCES,
    ROLE_CAPABILITIES,
    type AppRole,
    type PermissionAction,
    type PermissionResource,
} from './role-permissions'

type CapabilityMatrix = Record<
    AppRole,
    Partial<Record<PermissionResource, PermissionAction[]>>
>

type RolePermissionRow = {
    role: string
    resource: string
    action: string
}

const CACHE_TTL_MS = 60_000
const roleSet = new Set<AppRole>(APP_ROLES)
const resourceSet = new Set<PermissionResource>(PERMISSION_RESOURCES)
const actionSet = new Set<PermissionAction>(PERMISSION_ACTIONS)

let cachedCapabilities: CapabilityMatrix | null = null
let cachedAt = 0
let loadingPromise: Promise<CapabilityMatrix> | null = null

function cloneDefaultCapabilities(): CapabilityMatrix {
    const clone = {} as CapabilityMatrix

    for (const role of APP_ROLES) {
        clone[role] = {}
        const resources = ROLE_CAPABILITIES[role]

        for (const resource of Object.keys(resources) as PermissionResource[]) {
            const actions = resources[resource] ?? []
            clone[role][resource] = [...actions]
        }
    }

    return clone
}

function flattenDefaultCapabilities() {
    const rows: Array<{
        role: AppRole
        resource: PermissionResource
        action: PermissionAction
    }> = []

    for (const role of APP_ROLES) {
        const resources = ROLE_CAPABILITIES[role]
        for (const resource of Object.keys(resources) as PermissionResource[]) {
            const actions = resources[resource] ?? []
            for (const action of actions) {
                rows.push({ role, resource, action })
            }
        }
    }

    return rows
}

function isValidRolePermissionRow(
    row: RolePermissionRow,
): row is { role: AppRole; resource: PermissionResource; action: PermissionAction } {
    return (
        roleSet.has(row.role as AppRole) &&
        resourceSet.has(row.resource as PermissionResource) &&
        actionSet.has(row.action as PermissionAction)
    )
}

function matrixFromRows(rows: RolePermissionRow[]): CapabilityMatrix {
    const matrix = {} as CapabilityMatrix
    let validRowCount = 0

    for (const role of APP_ROLES) {
        matrix[role] = {}
    }

    for (const row of rows) {
        if (!isValidRolePermissionRow(row)) continue
        validRowCount += 1

        const actions = matrix[row.role][row.resource] ?? []
        if (!actions.includes(row.action)) {
            matrix[row.role][row.resource] = [...actions, row.action]
        }
    }

    if (validRowCount === 0) {
        return cloneDefaultCapabilities()
    }

    return matrix
}

async function loadCapabilitiesFromDb(): Promise<CapabilityMatrix> {
    const [{ db }, { rolePermissions }] = await Promise.all([
        import('../db/client'),
        import('../db/schema'),
    ])

    const existing = await db
        .select({ role: rolePermissions.role })
        .from(rolePermissions)
        .limit(1)

    if (existing.length === 0) {
        const seedRows = flattenDefaultCapabilities()
        await db.insert(rolePermissions).values(seedRows).onConflictDoNothing()
    }

    const rows = await db
        .select({
            role: rolePermissions.role,
            resource: rolePermissions.resource,
            action: rolePermissions.action,
        })
        .from(rolePermissions)

    if (rows.length === 0) {
        return cloneDefaultCapabilities()
    }

    return matrixFromRows(rows)
}

export async function getRoleCapabilities(options?: {
    forceRefresh?: boolean
}): Promise<CapabilityMatrix> {
    const forceRefresh = options?.forceRefresh ?? false
    const isExpired = Date.now() - cachedAt > CACHE_TTL_MS

    if (!forceRefresh && cachedCapabilities && !isExpired) {
        return cachedCapabilities
    }

    if (loadingPromise) {
        return loadingPromise
    }

    loadingPromise = loadCapabilitiesFromDb().then((capabilities) => {
        cachedCapabilities = capabilities
        cachedAt = Date.now()
        return capabilities
    })

    try {
        return await loadingPromise
    } finally {
        loadingPromise = null
    }
}

export function invalidateRoleCapabilitiesCache() {
    cachedCapabilities = null
    cachedAt = 0
}

export async function canRoleConfigured(
    role: AppRole,
    resource: PermissionResource,
    action: PermissionAction,
): Promise<boolean> {
    const capabilities = await getRoleCapabilities()
    const actions = capabilities[role]?.[resource] ?? []
    return actions.includes(action)
}
