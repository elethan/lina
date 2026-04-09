import { authServerFn } from '../lib/server-utils'

type ClientErrorPayload = {
    event: string
    message: string
    metadata?: Record<string, unknown>
}

export const logClientError = authServerFn({ method: 'POST' })
    .inputValidator((data: ClientErrorPayload) => {
        const event = data.event?.trim()
        const message = data.message?.trim()

        if (!event) {
            throw new Error('Client log event is required')
        }
        if (!message) {
            throw new Error('Client log message is required')
        }

        return {
            event,
            message,
            metadata: data.metadata ?? undefined,
        }
    })
    .handler(async ({ data }) => {
        const { logger } = await import('../lib/logger')
        const { auth } = await import('../lib/auth')
        const { getRequest } = await import('@tanstack/react-start/server')

        let actorUserId: string | null = null
        let actorEmail: string | null = null
        let actorRole: string | null = null

        const request = getRequest()
        if (request) {
            try {
                const session = await auth.api.getSession({ headers: request.headers })
                if (session?.user) {
                    actorUserId = session.user.id
                    actorEmail = session.user.email ?? null
                    actorRole = (session.user as any).role ?? null
                }
            } catch {
                // Best effort only: lack of session should not block error reporting.
            }
        }

        logger.error(data.event, {
            message: data.message,
            actorUserId,
            actorEmail,
            actorRole,
            metadata: data.metadata ?? null,
        })

        return { ok: true }
    })
