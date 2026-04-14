import { authServerFn } from '../lib/server-utils'
import {
    PERMISSION_RESOURCES,
    normalizeAppRole,
    type AppRole,
    type RolePermissionMap,
} from '../lib/role-permissions'

export type CurrentUserPermissionsPayload = {
    role: AppRole
    permissions: RolePermissionMap
}

export const fetchCurrentUserPermissions = authServerFn({ method: 'GET' }).handler(
    async (): Promise<CurrentUserPermissionsPayload> => {
        const [{ requireSessionUser }, { getRoleCapabilities }] = await Promise.all([
            import('../lib/auth-guards.server'),
            import('../lib/role-permissions.server'),
        ])

        const user = await requireSessionUser()
        const role = normalizeAppRole(user.role)
        const matrix = await getRoleCapabilities()
        const rolePermissions = matrix[role] ?? {}

        const permissions: RolePermissionMap = {}
        for (const resource of PERMISSION_RESOURCES) {
            permissions[resource] = [...(rolePermissions[resource] ?? [])]
        }

        return { role, permissions }
    },
)
