import { auth } from './auth'

export type AppRole = 'admin' | 'engineer' | 'scientist' | 'user'

type SessionUser = {
    id: string
    email?: string | null
    role?: string | null
}

function resolveHeaders(context: any): Headers {
    if (context?.request?.headers instanceof Headers) {
        return context.request.headers
    }

    if (context?.headers instanceof Headers) {
        return context.headers
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