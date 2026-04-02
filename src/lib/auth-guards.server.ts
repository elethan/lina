import { auth } from './auth'
import { getRequest } from '@tanstack/react-start/server'
import {
    canRole,
    type AppRole,
    type PermissionAction,
    type PermissionResource,
} from './role-permissions'

type SessionUser = {
    id: string
    email?: string | null
    role?: string | null
}

export async function requireSessionUser(): Promise<SessionUser> {
    const request = getRequest()
    if (!request) {
        throw new Error('Unauthorized')
    }
    const session = await auth.api.getSession({ headers: request.headers })
    if (!session?.user) {
        throw new Error('Unauthorized')
    }

    return session.user as SessionUser
}

export async function requireRole(...allowedRoles: AppRole[]) {
    const user = await requireSessionUser()
    const currentRole = (user.role ?? 'therapist') as AppRole

    if (!allowedRoles.includes(currentRole)) {
        throw new Error('Forbidden')
    }

    return user
}

export async function requirePermission(
    resource: PermissionResource,
    action: PermissionAction,
) {
    const user = await requireSessionUser()
    const currentRole = (user.role ?? 'therapist') as AppRole

    if (!canRole(currentRole, resource, action)) {
        throw new Error(`Forbidden: missing permission ${resource}.${action}`)
    }

    return user
}