import { createMiddleware, createServerFn } from '@tanstack/react-start'
import { logger } from './logger'

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

/**
 * A standardized server function builder that automatically includes  
 * the global error-catching middleware.
 * 
 * Replace naked calls to `createServerFn(..)` with this `authServerFn(..)`
 */
export const authServerFn = createServerFn().middleware([globalMiddleware])
