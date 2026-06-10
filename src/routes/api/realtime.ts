import { createFileRoute } from '@tanstack/react-router'

import { auth } from '../../lib/auth'
import { logger } from '../../lib/logger'
import { subscribeRealtimeEvents } from '../../lib/realtime-events.server'
import type { RealtimeEvent } from '../../lib/realtime-events'

const HEARTBEAT_INTERVAL_MS = 25000

function getActorMeta(user: {
    id: string
    name?: string | null
    email?: string | null
    role?: string | null
}) {
    return {
        actorUserId: user.id,
        actorName: user.name?.trim() || user.email || null,
        actorEmail: user.email ?? null,
        actorRole: user.role ?? null,
    }
}

function formatSseEvent(event: RealtimeEvent): string {
    return [
        `id: ${event.id}`,
        `event: ${event.type}`,
        `data: ${JSON.stringify(event)}`,
        '',
        '',
    ].join('\n')
}

export const Route = createFileRoute('/api/realtime')({
    server: {
        handlers: {
            GET: async ({ request }: { request: Request }) => {
                const session = await auth.api.getSession({ headers: request.headers })
                const requestUrl = new URL(request.url)

                if (!session?.user) {
                    logger.warn('REALTIME_STREAM_AUTH_REJECTED', {
                        path: requestUrl.pathname,
                    })

                    return new Response('Unauthorized', { status: 401 })
                }

                const actorMeta = getActorMeta(session.user)
                const streamId = `sse-${Date.now()}-${Math.random().toString(36).slice(2)}`
                const encoder = new TextEncoder()

                let cleanup: () => void = () => undefined

                const stream = new ReadableStream<Uint8Array>({
                    start(controller) {
                        let closed = false
                        const cleanupHandles: {
                            heartbeatTimer?: ReturnType<typeof setInterval>
                            unsubscribe?: () => void
                        } = {}

                        const close = () => {
                            if (closed) return
                            closed = true

                            if (cleanupHandles.heartbeatTimer) {
                                clearInterval(cleanupHandles.heartbeatTimer)
                            }

                            cleanupHandles.unsubscribe?.()

                            try {
                                controller.close()
                            } catch {
                                // Stream may already be closed by the runtime.
                            }
                        }

                        cleanup = close

                        const write = (chunk: string) => {
                            if (closed) return

                            try {
                                controller.enqueue(encoder.encode(chunk))
                            } catch (error) {
                                logger.error('REALTIME_STREAM_WRITE_FAILED', {
                                    streamId,
                                    message: error instanceof Error ? error.message : String(error),
                                    stack: error instanceof Error ? error.stack : undefined,
                                    ...actorMeta,
                                })
                                close()
                            }
                        }

                        write(`: connected ${new Date().toISOString()}\n\n`)
                        if (closed) return

                        cleanupHandles.unsubscribe = subscribeRealtimeEvents(
                            (event) => write(formatSseEvent(event)),
                        )

                        cleanupHandles.heartbeatTimer = setInterval(() => {
                            write(`: heartbeat ${new Date().toISOString()}\n\n`)
                        }, HEARTBEAT_INTERVAL_MS)

                        request.signal.addEventListener('abort', () => close(), { once: true })
                    },
                    cancel() {
                        cleanup()
                    },
                })

                return new Response(stream, {
                    headers: {
                        'Content-Type': 'text/event-stream; charset=utf-8',
                        'Cache-Control': 'no-cache, no-transform',
                        Connection: 'keep-alive',
                        'X-Accel-Buffering': 'no',
                    },
                })
            },
        },
    },
})
