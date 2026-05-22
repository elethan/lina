import { createColumnHelper, type ColumnDef, type FilterFn } from '@tanstack/react-table'
import { rankItem } from '@tanstack/match-sorter-utils'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import type { WorkOrderRow } from '../../data/workorders.api'
import { HydratedDateText } from '../../components/HydratedDateText'

export const fuzzyFilter: FilterFn<WorkOrderRow> = (row, columnId, value, addMeta) => {
    const itemRank = rankItem(row.getValue(columnId), value)
    addMeta({ itemRank })
    return itemRank.passed
}

const columnHelper = createColumnHelper<WorkOrderRow>()

export const workOrderColumns: ColumnDef<WorkOrderRow, any>[] = [
    columnHelper.accessor('id', {
        header: 'WO #',
        cell: (info) => (
            <span className="font-semibold text-primary-darker font-mono text-xs">
                WO-{String(info.getValue()).padStart(4, '0')}
            </span>
        ),
        size: 100,
        enableResizing: false,
    }),
    columnHelper.accessor('status', {
        header: ({ column }) => {
            return (
                <div className="flex flex-col gap-1">
                    <span>Status</span>
                    <select
                        value={(column.getFilterValue() ?? 'All') as string}
                        onChange={(e) => column.setFilterValue(e.target.value === 'All' ? 'All' : e.target.value)}
                        className="text-xs py-1 px-1.5 border border-primary-200 rounded bg-white text-gray-700 font-normal focus:outline-none focus:border-primary/60 outline-none w-full max-w-28 truncate"
                    >
                        <option value="All">All</option>
                        <option value="Open">Open</option>
                        <option value="Closed">Closed</option>
                    </select>
                </div>
            )
        },
        cell: (info) => {
            const status = info.getValue()
            const config: Record<string, { colors: string; icon: typeof CheckCircle2 }> = {
                Open: {
                    colors: 'bg-primary/10 text-primary-darker border border-primary/20',
                    icon: AlertCircle,
                },
                Closed: {
                    colors: 'bg-gray-100 text-gray-500 border border-gray-200',
                    icon: CheckCircle2,
                },
            }
            const { colors, icon: Icon } = config[status] ?? {
                colors: 'bg-gray-100 text-gray-600',
                icon: AlertCircle,
            }
            return (
                <span
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${colors}`}
                >
                    <Icon size={12} />
                    {status}
                </span>
            )
        },
        filterFn: (row, columnId, filterValue) => {
            if (!filterValue || filterValue === 'All') return true
            return row.getValue(columnId) === filterValue
        },
        size: 130,
    }),

    columnHelper.accessor('siteName', {
        header: 'Site',
        cell: (info) => (
            <span className="font-medium font-mono text-md text-gray-900">
                {info.getValue() ?? '—'}
            </span>
        ),
        filterFn: fuzzyFilter,
    }),

    columnHelper.accessor('description', {
        header: 'Description',
        cell: (info) => {
            const text = info.getValue()
            return (
                <div className="text-gray-500 whitespace-pre-wrap break-words min-h-[40px]">
                    {text}
                </div>
            )
        },
        size: 300,
        enableResizing: false,
    }),
    columnHelper.accessor('requestCount', {
        header: 'Requests',
        cell: (info) => {
            const count = info.getValue()
            return count > 0 ? (
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary-darker text-xs font-semibold">
                    {count}
                </span>
            ) : (
                <span className="text-gray-300 text-xs">0</span>
            )
        },
        size: 90,
        enableResizing: false,
    }),
    columnHelper.accessor('engineerId', {
        header: ({ column, table }) => {
            const engineers = (table.options.meta as any)?.engineersList ?? []
            return (
                <div className="flex flex-col gap-1">
                    <span>Engineer</span>
                    <select
                        value={(column.getFilterValue() ?? '') as string}
                        onChange={(e) => column.setFilterValue(e.target.value ? Number(e.target.value) : undefined)}
                        className="text-xs py-1 px-1.5 border border-primary-200 rounded bg-white text-gray-700 font-normal focus:outline-none focus:border-primary/60 outline-none w-full max-w-28 truncate"
                    >
                        <option value="">All</option>
                        {engineers.map((eng: { id: number; name: string }) => (
                            <option key={eng.id} value={eng.id}>
                                {eng.name}
                            </option>
                        ))}
                    </select>
                </div>
            )
        },
        cell: (info) => {
            const id = info.getValue()
            const name = info.row.original.engineerName
            if (!id || !name) {
                return <span className="text-gray-400 italic text-xs">Unassigned</span>
            }
            return (
                <div className="flex flex-wrap gap-1">
                    <span className="inline-flex px-2 py-0.5 rounded-md bg-gray-100 text-gray-700 text-xs font-medium">
                        {name}
                    </span>
                </div>
            )
        },
        filterFn: (row, columnId, filterValue) => {
            if (filterValue === undefined || filterValue === null || filterValue === '') return true
            return row.getValue(columnId) === filterValue
        },
    }),
    columnHelper.accessor('startAt', {
        header: 'Start Date',
        cell: (info) => {
            const date = info.getValue()
            if (!date) return <span className="text-gray-300 italic text-xs">Not started</span>
            return (
                <span className="text-gray-600 text-xs">
                    <HydratedDateText value={date} dateOnly />
                </span>
            )
        },
        size: 120,
    }),
    columnHelper.accessor('endAt', {
        header: 'End Date',
        cell: (info) => {
            const date = info.getValue()
            if (!date) return <span className="text-gray-300">—</span>
            return (
                <span className="text-green-600 text-xs font-medium">
                    <HydratedDateText value={date} dateOnly />
                </span>
            )
        },
        size: 110,
    }),
    columnHelper.accessor('serialNumber', {
        header: 'Serial No.',
        cell: (info) => (
            <span className="font-medium font-mono text-md text-gray-900">
                {info.getValue() ?? '—'}
            </span>
        ),
        filterFn: fuzzyFilter,
    }),
    columnHelper.accessor('systemName', {
        header: 'System',
        cell: (info) => (
            <span className="font-medium font-mono text-md text-gray-900">
                {info.getValue() ?? '—'}
            </span>
        ),
    }),
    columnHelper.accessor('createdAt', {
        header: 'Created',
        cell: (info) => {
            const date = info.getValue()
            if (!date) return <span className="text-gray-300">—</span>
            return (
                <span className="text-gray-400 text-xs">
                    <HydratedDateText value={date} dateOnly />
                </span>
            )
        },
        size: 110,
    }),
]
