import { ChevronDown, ChevronUp } from 'lucide-react'
import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import type {
  AssetStatusDashboardEditableField,
  AssetStatusDashboardRow,
} from '../../../data/dashboard.api'
import { getDashboardStatusLight } from '../format'

export const DASHBOARD_DETAIL_GRID_CONFIG = {
  columns: 3,
  rows: 3,
} as const

type DashboardDetailDraft = Record<AssetStatusDashboardEditableField, string>

type DashboardDetailFieldConfig = {
  field: AssetStatusDashboardEditableField
  label: string
  inputType: 'date' | 'text'
  inputMode?: 'decimal'
  step?: string
  placeholder?: string
}

const DASHBOARD_DETAIL_FIELDS: DashboardDetailFieldConfig[] = [
  { field: 'catDate', label: 'CAT Date', inputType: 'date' },
  { field: 'gunDate', label: 'Gun Date', inputType: 'date' },
  { field: 'mirrorDate', label: 'Mirror Date', inputType: 'date' },
  { field: 'ionDate', label: 'Ion Date', inputType: 'date' },
  { field: 'magnetronDate', label: 'Magnetron Date', inputType: 'date' },
  { field: 'thyratronDate', label: 'Thyratron Date', inputType: 'date' },
  {
    field: 'htHours',
    label: 'HT Hours',
    inputType: 'text',
    inputMode: 'decimal',
    placeholder: '0.0',
  },
]

const DASHBOARD_DETAIL_SLOT_COUNT =
  DASHBOARD_DETAIL_GRID_CONFIG.columns * DASHBOARD_DETAIL_GRID_CONFIG.rows

function toDateInputValue(value: string | null): string {
  if (!value) return ''

  const ymd = value.match(/^(\d{4}-\d{2}-\d{2})/)
  if (ymd) return ymd[1]

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toISOString().slice(0, 10)
}

function buildDetailDraft(row: AssetStatusDashboardRow): DashboardDetailDraft {
  return {
    catDate: toDateInputValue(row.catDate),
    gunDate: toDateInputValue(row.gunDate),
    mirrorDate: toDateInputValue(row.mirrorDate),
    ionDate: toDateInputValue(row.ionDate),
    magnetronDate: toDateInputValue(row.magnetronDate),
    thyratronDate: toDateInputValue(row.thyratronDate),
    htHours: row.htHours == null ? '' : String(row.htHours),
  }
}

function normalizeEditableInput(
  field: AssetStatusDashboardEditableField,
  rawValue: string,
): { valid: boolean; value: string | null } {
  const trimmed = rawValue.trim()

  if (!trimmed) {
    return { valid: true, value: null }
  }

  if (field === 'htHours') {
    const parsed = Number(trimmed)
    if (!Number.isFinite(parsed) || parsed < 0) {
      return { valid: false, value: null }
    }

    return {
      valid: true,
      value: Number.isInteger(parsed) ? String(parsed) : String(parsed),
    }
  }

  return { valid: true, value: trimmed }
}

export function AssetStatusCard({
  row,
  isExpanded,
  isCompressed = false,
  onToggle,
  onCommitField,
  isFieldSaving,
}: {
  row: AssetStatusDashboardRow
  isExpanded: boolean
  isCompressed?: boolean
  onToggle: () => void
  onCommitField?: (payload: {
    assetId: number
    field: AssetStatusDashboardEditableField
    value: string | null
  }) => Promise<void>
  isFieldSaving?: (payload: {
    assetId: number
    field: AssetStatusDashboardEditableField
  }) => boolean
}) {
  const statusLight = getDashboardStatusLight(row.status)
  const isExpandedLayout = isExpanded
  const serverDraft = useMemo(() => buildDetailDraft(row), [
    row.assetId,
    row.catDate,
    row.gunDate,
    row.mirrorDate,
    row.ionDate,
    row.magnetronDate,
    row.thyratronDate,
    row.htHours,
  ])
  const [draftValues, setDraftValues] = useState<DashboardDetailDraft>(serverDraft)

  useEffect(() => {
    setDraftValues(serverDraft)
  }, [serverDraft])

  const detailCells = useMemo(() => {
    const padded = [...DASHBOARD_DETAIL_FIELDS] as Array<DashboardDetailFieldConfig | null>
    while (padded.length < DASHBOARD_DETAIL_SLOT_COUNT) {
      padded.push(null)
    }
    return padded
  }, [])

  const dotSizeClass = isExpandedLayout
    ? 'h-14 w-14'
    : isCompressed
      ? 'h-9 w-9'
      : 'h-12 w-12'

  const siteClassName = isExpandedLayout
    ? 'text-[clamp(1.2rem,2.8vh,2.2rem)] font-black text-gray-900 truncate leading-tight tracking-tight'
    : isCompressed
      ? 'text-sm font-bold text-gray-900 truncate leading-tight'
      : 'text-[clamp(1.05rem,2.2vh,1.75rem)] font-extrabold text-gray-900 truncate leading-tight'

  const modelClassName = isExpandedLayout
    ? 'text-[clamp(1rem,2.1vh,1.45rem)] text-gray-700 truncate mt-1'
    : 'text-[clamp(0.95rem,1.8vh,1.2rem)] text-gray-600 truncate mt-0.5'

  const serialClassName = isExpandedLayout
    ? 'text-[clamp(0.9rem,1.7vh,1.2rem)] text-gray-700 truncate mt-1 font-semibold'
    : isCompressed
      ? 'text-[11px] text-gray-500 truncate mt-1 font-semibold'
      : 'text-[clamp(0.85rem,1.4vh,1.05rem)] text-gray-500 truncate mt-1 font-semibold'

  const commitField = async (field: AssetStatusDashboardEditableField) => {
    if (!onCommitField) return

    const next = normalizeEditableInput(field, draftValues[field])
    const prev = normalizeEditableInput(field, serverDraft[field])

    if (!next.valid) {
      setDraftValues((current) => ({
        ...current,
        [field]: serverDraft[field],
      }))
      return
    }

    if (next.value === prev.value) {
      return
    }

    try {
      await onCommitField({
        assetId: row.assetId,
        field,
        value: next.value,
      })
    } catch {
      setDraftValues((current) => ({
        ...current,
        [field]: serverDraft[field],
      }))
    }
  }

  const handleFieldKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
    field: AssetStatusDashboardEditableField,
  ) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      event.currentTarget.blur()
      return
    }

    if (event.key === 'Escape') {
      setDraftValues((current) => ({
        ...current,
        [field]: serverDraft[field],
      }))
      event.currentTarget.blur()
    }
  }

  return (
    <article
      className={`h-full min-h-0 rounded-xl border bg-white shadow-sm transition-colors flex flex-col overflow-hidden ${
        isExpanded ? 'border-primary/40' : 'border-gray-200 hover:border-gray-300'
      }`}
    >
      <div className={`h-full flex items-start gap-3 ${isCompressed || isExpanded ? 'p-3' : 'p-4'}`}>
        <button
          type="button"
          onClick={onToggle}
          className={`min-w-0 text-left ${isExpanded ? 'w-[clamp(8.75rem,18vw,14rem)] shrink-0' : 'flex-1'}`}
          aria-expanded={isExpanded}
        >
          <div className="min-w-0">
            <p className={siteClassName}>
              {row.siteName ?? 'No site'}
            </p>
            {!isCompressed && (
              <p className={modelClassName}>
                {row.modelName ?? 'Unknown model'}
              </p>
            )}
            <p className={serialClassName}>
              SN: {row.serialNumber}
            </p>
          </div>
        </button>

        {isExpanded && !isCompressed && (
          <dl
            className="flex-1 min-w-0 grid gap-2"
            style={{
              gridTemplateColumns: `repeat(${DASHBOARD_DETAIL_GRID_CONFIG.columns}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${DASHBOARD_DETAIL_GRID_CONFIG.rows}, minmax(0, 1fr))`,
            }}
          >
            {detailCells.map((item, index) => {
                if (!item) {
                  return (
                    <div
                      key={`detail-empty-${index}`}
                      className="rounded-md border border-gray-100/60 bg-gray-50/30 min-h-16 h-full"
                      aria-hidden
                    />
                  )
                }

                return (
                  <InlineDetailItem
                    key={item.field}
                    label={item.label}
                    value={draftValues[item.field]}
                    inputType={item.inputType}
                    inputMode={item.inputMode}
                    step={item.step}
                    placeholder={item.placeholder}
                    isSaving={isFieldSaving?.({ assetId: row.assetId, field: item.field }) ?? false}
                    onChange={(next) =>
                      setDraftValues((current) => ({
                        ...current,
                        [item.field]: next,
                      }))
                    }
                    onBlur={() => void commitField(item.field)}
                    onKeyDown={(event) => handleFieldKeyDown(event, item.field)}
                  />
                )
            })}
          </dl>
        )}

        <div
          className="shrink-0 w-[4.75rem] flex flex-col items-center gap-1"
        >
          <div className="flex items-center gap-2">
            <div className={`${dotSizeClass} rounded-full ${statusLight.dotClassName} ring-4 ${statusLight.ringClassName}`} />
            <button
              type="button"
              onClick={onToggle}
              className="inline-flex items-center justify-center rounded-md p-1 hover:bg-gray-100 transition-colors"
              aria-label={isExpanded ? 'Collapse card details' : 'Expand card details'}
            >
              {isExpanded ? (
                <ChevronUp size={16} className="text-gray-500" />
              ) : (
                <ChevronDown size={16} className="text-gray-500" />
              )}
            </button>
          </div>

          <p className={`text-[10px] leading-tight text-center font-semibold uppercase ${statusLight.textClassName}`}>
            {statusLight.label}
          </p>
        </div>
      </div>
    </article>
  )
}

function InlineDetailItem({
  label,
  value,
  inputType,
  inputMode,
  step,
  placeholder,
  isSaving,
  onChange,
  onBlur,
  onKeyDown,
}: {
  label: string
  value: string
  inputType: 'date' | 'text'
  inputMode?: 'decimal'
  step?: string
  placeholder?: string
  isSaving: boolean
  onChange: (value: string) => void
  onBlur: () => void
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
}) {
  return (
    <div
      className={`rounded-md border bg-gray-50 px-2.5 py-2 min-w-0 min-h-16 h-full flex flex-col justify-between ${
        isSaving ? 'border-primary/40 ring-1 ring-primary/30' : 'border-gray-200'
      }`}
    >
      <dt className="text-xs leading-tight text-gray-700 font-semibold truncate">{label}</dt>
      <dd className="mt-1.5 min-w-0">
        <input
          type={inputType}
          inputMode={inputMode}
          step={step}
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          className="h-8 w-full rounded-sm border border-gray-200 bg-white px-2 text-sm font-semibold text-gray-800 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
        />
      </dd>
    </div>
  )
}
