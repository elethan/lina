export type DialogMode = 'create' | 'edit'
export type AssetStatus = 'Operational' | 'De-commissioned'

export type AssetFormState = {
    serialNumber: string
    modelName: string
    warrantyYears: string
    catDate: string
    installationDate: string
    status: AssetStatus
    siteId: string
    systemIds: number[]
}

export type SystemFormState = {
    systemId: string
    serialNumber: string
    swVersion: string
    userCredentials: string
    adminCredentials: string
    status: AssetStatus
}

export type CloseTarget =
    | {
        kind: 'system'
        label: string
        assetId: number
        systemId: number
    }
    | {
        kind: 'asset'
        label: string
        assetId: number
    }
    | {
        kind: 'site'
        label: string
        siteId: number
    }

export const EMPTY_ASSET_FORM: AssetFormState = {
    serialNumber: '',
    modelName: '',
    warrantyYears: '',
    catDate: '',
    installationDate: '',
    status: 'Operational',
    siteId: '',
    systemIds: [],
}

export const EMPTY_SYSTEM_FORM: SystemFormState = {
    systemId: '',
    serialNumber: '',
    swVersion: '',
    userCredentials: '',
    adminCredentials: '',
    status: 'Operational',
}
