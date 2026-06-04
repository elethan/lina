export type RequestSearchParams = {
    search?: string
    dateFrom?: string
    dateTo?: string
    status?: string
    siteId?: number
    assetId?: number
    notice?: string
}

export type { MachineClinicalStatus } from '../../lib/machine-clinical-status'

export type RequestsTableMeta = {
    canEditRequestComments?: boolean
    canEditRequestEngineerNotes?: boolean
    saveRequestComment?: (requestId: number, commentText: string) => Promise<void>
    saveRequestEngineerComment?: (requestId: number, engineerComment: string | null) => Promise<void>
    isDateTimeHydrated?: boolean
}
