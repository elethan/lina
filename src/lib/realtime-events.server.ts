import { logger } from './logger'
import { REALTIME_EVENT_TYPES, type RealtimeEvent } from './realtime-events'

type RealtimeListener = (event: RealtimeEvent) => void

const listeners = new Map<number, RealtimeListener>()
let nextSubscriberId = 1
let nextEventSequence = 1

export function createRealtimeEventId(prefix = 'rt'): string {
    const sequence = nextEventSequence++
    return `${prefix}-${Date.now()}-${sequence}`
}

function getEventLogMeta(event: RealtimeEvent): Record<string, unknown> {
    if (event.type === REALTIME_EVENT_TYPES.machineClinicalStatusChanged) {
        return {
            assetId: event.assetId,
            previousStatus: event.previousStatus,
            nextStatus: event.status,
            requestAction: event.requestAction,
            requestId: event.requestId,
            serialNumber: event.serialNumber,
            modelName: event.modelName,
        }
    }

    return {}
}

export function subscribeRealtimeEvents(listener: RealtimeListener) {
    const subscriberId = nextSubscriberId++
    listeners.set(subscriberId, listener)

    return () => {
        listeners.delete(subscriberId)
    }
}

export function publishRealtimeEvent(
    event: RealtimeEvent,
    meta: Record<string, unknown> = {},
) {
    let deliveredCount = 0

    for (const [subscriberId, listener] of listeners.entries()) {
        try {
            listener(event)
            deliveredCount++
        } catch (error) {
            logger.error('REALTIME_EVENT_DELIVERY_FAILED', {
                eventId: event.id,
                eventType: event.type,
                subscriberId,
                message: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                ...getEventLogMeta(event),
            })
        }
    }

    logger.info('REALTIME_EVENT_PUBLISHED', {
        eventId: event.id,
        eventType: event.type,
        subscriberCount: listeners.size,
        deliveredCount,
        ...getEventLogMeta(event),
        ...meta,
    })
}
