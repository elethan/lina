export const MACHINE_CLINICAL_STATUS = {
    clinical: 'Clinical',
    nonClinical: 'Non-Clinical',
} as const

export type MachineClinicalStatus =
    (typeof MACHINE_CLINICAL_STATUS)[keyof typeof MACHINE_CLINICAL_STATUS]

const NON_CLINICAL_MACHINE_STATUS_VALUES = new Set([
    'down',
    'non-clinical',
    'nonclinical',
])

export function isNonClinicalMachineStatus(status: string | null | undefined): boolean {
    return NON_CLINICAL_MACHINE_STATUS_VALUES.has(status?.trim().toLowerCase() ?? '')
}

export function normalizeMachineClinicalStatus(
    status: string | null | undefined,
): MachineClinicalStatus {
    return isNonClinicalMachineStatus(status)
        ? MACHINE_CLINICAL_STATUS.nonClinical
        : MACHINE_CLINICAL_STATUS.clinical
}

export function getNextMachineClinicalStatus(
    status: string | null | undefined,
): MachineClinicalStatus {
    return isNonClinicalMachineStatus(status)
        ? MACHINE_CLINICAL_STATUS.clinical
        : MACHINE_CLINICAL_STATUS.nonClinical
}

export function getMachineClinicalStatusLabel(
    status: string | null | undefined,
    options?: { uppercase?: boolean },
): string {
    const label = normalizeMachineClinicalStatus(status)
    return options?.uppercase ? label.toUpperCase() : label
}