export type RequestsUrlState = {
  search?: string
  dateFrom?: string
  dateTo?: string
  status?: string
  siteId?: number
  assetId?: number
}

const REQUESTS_URL_STATE_KEY = 'lina:requests-url-state'

const toOptionalNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

export const pickRequestsUrlState = (search: Record<string, unknown>): RequestsUrlState => ({
  search: typeof search.search === 'string' ? search.search : undefined,
  dateFrom: typeof search.dateFrom === 'string' ? search.dateFrom : undefined,
  dateTo: typeof search.dateTo === 'string' ? search.dateTo : undefined,
  status: typeof search.status === 'string' ? search.status : undefined,
  siteId: toOptionalNumber(search.siteId ?? search.siteID),
  assetId: toOptionalNumber(search.assetId ?? search.assetID),
})

export function saveRequestsUrlState(state: RequestsUrlState): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(REQUESTS_URL_STATE_KEY, JSON.stringify(state))
  } catch {
    // Ignore storage failures (private mode/quota/etc.)
  }
}

export function loadRequestsUrlState(): RequestsUrlState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(REQUESTS_URL_STATE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return pickRequestsUrlState(parsed)
  } catch {
    return null
  }
}
