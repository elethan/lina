import { logClientError } from '../data/logging.api'

const CLIENT_ERROR_DEDUPE_WINDOW_MS = 5000
const lastLogAt = new Map<string, number>()
const lastNoticeAt = new Map<string, number>()

export type ClientErrorNotice = {
    id: number
    title: string
    message: string
}

const noticeListeners = new Set<(notice: ClientErrorNotice) => void>()
let nextNoticeId = 1

function isWithinDedupeWindow(key: string): boolean {
    const now = Date.now()
    const previous = lastLogAt.get(key) ?? 0
    if (now - previous < CLIENT_ERROR_DEDUPE_WINDOW_MS) {
        return true
    }
    lastLogAt.set(key, now)
    return false
}

function isWithinNoticeDedupeWindow(key: string): boolean {
    const now = Date.now()
    const previous = lastNoticeAt.get(key) ?? 0
    if (now - previous < CLIENT_ERROR_DEDUPE_WINDOW_MS) {
        return true
    }
    lastNoticeAt.set(key, now)
    return false
}

export function getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message
    if (typeof error === 'string') return error
    try {
        return JSON.stringify(error)
    } catch {
        return 'Unknown error'
    }
}

export function isNetworkLikeError(message: string): boolean {
    const value = message.toLowerCase()
    return (
        value.includes('network') ||
        value.includes('failed to fetch') ||
        value.includes('fetch failed') ||
        value.includes('timed out') ||
        value.includes('econnrefused') ||
        value.includes('enotfound')
    )
}

export function classifyClientErrorEvent(scope: 'QUERY' | 'MUTATION', error: unknown): string {
    return isNetworkLikeError(getErrorMessage(error))
        ? `CLIENT_NETWORK_${scope}_ERROR`
        : `CLIENT_DATA_${scope}_ERROR`
}

export function subscribeClientErrorNotices(
    listener: (notice: ClientErrorNotice) => void,
) {
    noticeListeners.add(listener)
    return () => {
        noticeListeners.delete(listener)
    }
}

export function pushClientErrorNotice(title: string, message: string) {
    const noticeKey = `${title}|${message}`
    if (isWithinNoticeDedupeWindow(noticeKey)) {
        return
    }

    const notice: ClientErrorNotice = {
        id: nextNoticeId++,
        title,
        message,
    }

    noticeListeners.forEach((listener) => listener(notice))
}

export async function reportClientError(
    event: string,
    error: unknown,
    metadata?: Record<string, unknown>,
) {
    const message = getErrorMessage(error)
    const dedupeKey = `${event}|${message}`
    if (isWithinDedupeWindow(dedupeKey)) {
        return
    }

    try {
        await logClientError({
            data: {
                event,
                message,
                metadata,
            },
        })
    } catch {
        // Never throw from telemetry reporting.
    }
}
