import { auth } from './auth'
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

function resolveHeaders(context: any): Headers {
    const fromRequest = context?.request?.headers
    if (fromRequest) {
        return new Headers(fromRequest)
    }

    const fromContext = context?.headers
    if (fromContext) {
        return new Headers(fromContext)
    }

    return new Headers()
}

export async function requireSessionUser(context: any): Promise<SessionUser> {
    const headers = resolveHeaders(context)
    const session = await auth.api.getSession({ headers })
    if (!session?.user) {
        throw new Error('Unauthorized')
    }

    return session.user as SessionUser
}

export async function requireRole(context: any, ...allowedRoles: AppRole[]) {
    const user = await requireSessionUser(context)
    const currentRole = (user.role ?? 'user') as AppRole

    if (!allowedRoles.includes(currentRole)) {
        throw new Error('Forbidden')
    }

    return user
}

export async function requirePermission(
    context: any,
    resource: PermissionResource,
    action: PermissionAction,
) {
    const user = await requireSessionUser(context)
    const currentRole = (user.role ?? 'user') as AppRole

    if (!canRole(currentRole, resource, action)) {
        throw new Error(`Forbidden: missing permission ${resource}.${action}`)
    }

    return user
}