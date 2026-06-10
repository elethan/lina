import type { MachineClinicalStatus } from './machine-clinical-status'

export const REALTIME_EVENT_TYPES = {
    machineClinicalStatusChanged: 'machineClinicalStatus.changed',
} as const

export type MachineClinicalStatusChangedEvent = {
    id: string
    type: typeof REALTIME_EVENT_TYPES.machineClinicalStatusChanged
    assetId: number
    previousStatus: MachineClinicalStatus
    status: MachineClinicalStatus
    requestAction: 'created-non-clinical-request' | 'updated-non-clinical-request-end' | 'none'
    requestId: number | null
    changedAt: string
    serialNumber: string
    modelName: string | null
}

export type RealtimeEvent = MachineClinicalStatusChangedEvent
