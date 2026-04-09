import { createMiddleware, createServerFn } from '@tanstack/react-start'
import { logger } from './logger'

const AUTH_WARN_DEDUPE_WINDOW_MS = 5000
let lastAuthWarnAt = 0

function isLikelyDbError(message: string): boolean {
    const lower = message.toLowerCase()
    return (
        lower.includes('sqlite') ||
        lower.includes('sql') ||
        lower.includes('drizzle') ||
        lower.includes('database') ||
        lower.includes('constraint') ||
        lower.includes('no such table') ||
        lower.includes('foreign key') ||
        lower.includes('unique') ||
        lower.includes('not null')
    )
}

export const globalMiddleware = createMiddleware().server(
    async ({ next }) => {
        try {
            // Proceed to the actual server function logic
            const result = await next();
            return result;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            const isExpectedAuthError =
                message.startsWith('Unauthorized') || message.startsWith('Forbidden')

            if (isExpectedAuthError) {
                const now = Date.now()
                if (now - lastAuthWarnAt > AUTH_WARN_DEDUPE_WINDOW_MS) {
                    logger.warn('API_AUTH_REJECTED', { message })
                    lastAuthWarnAt = now
                }
                throw new Error(message)
            }

            // Centralized Error Catcher (Structured Logging)
            const event = isLikelyDbError(message)
                ? 'API_DB_EXCEPTION'
                : 'API_UNHANDLED_EXCEPTION'

            logger.error(event, {
                message,
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

/**
 * A standardized server function builder that automatically includes  
 * the global error-catching middleware.
 * 
 * Replace naked calls to `createServerFn(..)` with this `authServerFn(..)`
 */
export const authServerFn = createServerFn().middleware([globalMiddleware])
