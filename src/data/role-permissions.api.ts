import { authServerFn } from '../lib/server-utils'
import {
    APP_ROLES,
    PERMISSION_ACTIONS,
    PERMISSION_RESOURCES,
    type AppRole,
    type PermissionAction,
    type PermissionResource,
} from '../lib/role-permissions'

export type RolePermissionEntry = {
    role: AppRole
    resource: PermissionResource
    action: PermissionAction
}

export type RolePermissionsConfigPayload = {
    roles: AppRole[]
    resources: PermissionResource[]
    actions: PermissionAction[]
    rows: RolePermissionEntry[]
}

const roleSet = new Set<AppRole>(APP_ROLES)
const resourceSet = new Set<PermissionResource>(PERMISSION_RESOURCES)
const actionSet = new Set<PermissionAction>(PERMISSION_ACTIONS)

function normalizeRows(rows: unknown): RolePermissionEntry[] {
    if (!Array.isArray(rows)) {
        throw new Error('rows must be an array')
    }

    const normalized: RolePermissionEntry[] = []
    const seen = new Set<string>()

    for (const row of rows) {
        const candidate = row as {
            role?: unknown
            resource?: unknown
            action?: unknown
        }

        if (
            !roleSet.has(candidate.role as AppRole) ||
            !resourceSet.has(candidate.resource as PermissionResource) ||
            !actionSet.has(candidate.action as PermissionAction)
        ) {
            continue
        }

        const normalizedRow: RolePermissionEntry = {
            role: candidate.role as AppRole,
            resource: candidate.resource as PermissionResource,
            action: candidate.action as PermissionAction,
        }

        const key = `${normalizedRow.role}:${normalizedRow.resource}:${normalizedRow.action}`
        if (!seen.has(key)) {
            seen.add(key)
            normalized.push(normalizedRow)
        }
    }

    return normalized
}

export const fetchRolePermissionsConfig = authServerFn({ method: 'GET' }).handler(
    async (): Promise<RolePermissionsConfigPayload> => {
        const { requireRole } = await import('../lib/auth-guards.server')
        await requireRole('admin')

        const { getRoleCapabilities } = await import('../lib/role-permissions.server')
        const matrix = await getRoleCapabilities({ forceRefresh: true })

        const rows: RolePermissionEntry[] = []
        for (const role of APP_ROLES) {
            for (const resource of PERMISSION_RESOURCES) {
                const actions = matrix[role]?.[resource] ?? []
                for (const action of actions) {
                    rows.push({ role, resource, action })
                }
            }
        }

        return {
            roles: [...APP_ROLES],
            resources: [...PERMISSION_RESOURCES],
            actions: [...PERMISSION_ACTIONS],
            rows,
        }
    },
)

export const saveRolePermissionsConfig = authServerFn({ method: 'POST' })
    .inputValidator((data: { rows: unknown }) => ({ rows: normalizeRows(data.rows) }))
    .handler(async ({ data }) => {
        const { requireRole } = await import('../lib/auth-guards.server')
        const user = await requireRole('admin')

        const [{ db }, { rolePermissions }, { invalidateRoleCapabilitiesCache }] = await Promise.all([
            import('../db/client'),
            import('../db/schema'),
            import('../lib/role-permissions.server'),
        ])

        db.transaction((tx) => {
            tx.delete(rolePermissions).run()
            if (data.rows.length > 0) {
                tx.insert(rolePermissions).values(data.rows).run()
            }
        })

        invalidateRoleCapabilitiesCache()

        const { logger } = await import('../lib/logger')
        logger.info('ROLE_PERMISSIONS_CONFIG_UPDATED', {
            count: data.rows.length,
            actorUserId: user.id,
            actorEmail: user.email ?? null,
            actorRole: user.role ?? null,
        })

        return {
            success: true,
            count: data.rows.length,
        }
    })
