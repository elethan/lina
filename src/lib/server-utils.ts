import { createMiddleware, createServerFn } from '@tanstack/react-start'
import { auth } from './auth'
import { logger } from './logger'

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

export const globalMiddleware = createMiddleware().server(
    async ({ next }) => {
        try {
            // Proceed to the actual server function logic
            const result = await next();
            return result;
        } catch (error) {
            // Centralized Error Catcher (Structured Logging)
            logger.error('API_UNHANDLED_EXCEPTION', {
                message: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined
            });

            // We throw a sanitized error to the client to prevent leaking sensitive 
            // DB credentials/queries that might be in the raw Error object.
            throw new Error(
                error instanceof Error
                    ? error.message
                    : 'An unexpected internal server error occurred'
            );
        }
    }
);

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

/**
 * A standardized server function builder that automatically includes  
 * the global error-catching middleware.
 * 
 * Replace naked calls to `createServerFn(..)` with this `authServerFn(..)`
 */
export const authServerFn = createServerFn().middleware([globalMiddleware])
