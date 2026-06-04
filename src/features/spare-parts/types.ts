export type SparePartsSearchParams = {
    search?: string
}

export type SparePartFormState = {
    code: string
    name: string
    siteId: string
    quantity: string
    locationId: string
}

export const EMPTY_SPARE_PART_FORM: SparePartFormState = {
    code: '',
    name: '',
    siteId: '',
    quantity: '0',
    locationId: '',
}