const DEFAULT_REDIRECT_TARGET = '/'
const SCHEME_RE = /^[a-zA-Z][a-zA-Z\d+\-.]*:/

export const UNAUTHORIZED_REDIRECT_NOTICE = 'forbidden'

const tryDecodeURIComponent = (value: string) => {
    try {
        return decodeURIComponent(value)
    } catch {
        return value
    }
}

export function resolveSafeRedirectTarget(
    rawTarget: unknown,
    fallback: string = DEFAULT_REDIRECT_TARGET,
): string {
    if (typeof rawTarget !== 'string') return fallback

    const decoded = tryDecodeURIComponent(rawTarget)
    const candidate = decoded.trim()
    if (!candidate) return fallback

    if (!candidate.startsWith('/')) return fallback
    if (candidate.startsWith('//') || candidate.startsWith('/\\')) return fallback
    if (SCHEME_RE.test(candidate)) return fallback
    if (/[\u0000-\u001f\u007f]/.test(candidate)) return fallback

    const [pathOnly] = candidate.split(/[?#]/)
    if (pathOnly === '/login' || pathOnly.startsWith('/login/')) return fallback

    return candidate
}

type LocationLike = {
    href?: unknown
    pathname?: unknown
    searchStr?: unknown
    hash?: unknown
}

export function buildRedirectTargetFromLocation(
    location: LocationLike,
    fallback: string = DEFAULT_REDIRECT_TARGET,
): string {
    if (typeof location.href === 'string' && location.href.trim()) {
        return resolveSafeRedirectTarget(location.href, fallback)
    }

    const pathname = typeof location.pathname === 'string' ? location.pathname : fallback
    const searchStr = typeof location.searchStr === 'string' ? location.searchStr : ''
    const hash = typeof location.hash === 'string' ? location.hash : ''

    const normalizedPathname = pathname.startsWith('/') ? pathname : `/${pathname}`
    const normalizedSearch = !searchStr
        ? ''
        : searchStr.startsWith('?')
            ? searchStr
            : `?${searchStr}`
    const normalizedHash = !hash
        ? ''
        : hash.startsWith('#')
            ? hash
            : `#${hash}`

    return resolveSafeRedirectTarget(
        `${normalizedPathname}${normalizedSearch}${normalizedHash}`,
        fallback,
    )
}