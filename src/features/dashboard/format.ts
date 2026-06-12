import { toYmd } from '../assets/format'
import {
  getMachineClinicalStatusLabel,
  isNonClinicalMachineStatus,
} from '../../lib/machine-clinical-status'

type DashboardStatusLight = {
  dotClassName: string
  ringClassName: string
  textClassName: string
  label: string
}

export function getDashboardStatusLight(status: string): DashboardStatusLight {
  const normalized = status.trim().toLowerCase()

  if (normalized === 'de-commissioned' || normalized === 'decommissioned') {
    return {
      dotClassName: 'bg-gray-400',
      ringClassName: 'ring-gray-200',
      textClassName: 'text-gray-600',
      label: 'De-commissioned',
    }
  }

  if (isNonClinicalMachineStatus(status)) {
    return {
      dotClassName: 'bg-red-500',
      ringClassName: 'ring-red-200',
      textClassName: 'text-red-700',
      label: getMachineClinicalStatusLabel(status),
    }
  }

  return {
    dotClassName: 'bg-emerald-500',
    ringClassName: 'ring-emerald-200',
    textClassName: 'text-emerald-700',
    label: getMachineClinicalStatusLabel(status),
  }
}

export function formatDashboardDate(value: string | null): string {
  return toYmd(value)
}

export function formatDashboardHours(value: number | null): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '—'
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}
