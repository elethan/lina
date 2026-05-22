export type PmSearchParams = {
    search?: string
    dateFrom?: string
    dateTo?: string
    completedAt?: 'pending' | 'completed' | 'all'
    siteName?: string
    systemName?: string
}

export type TaskStatus = 'Pass' | 'Fail' | 'N/A'
