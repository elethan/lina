import { createColumnHelper, type ColumnDef } from '@tanstack/react-table'
import { CheckCircle2, AlertCircle } from 'lucide-react'
import type { PmRow } from '../../data/pm.api'

const columnHelper = createColumnHelper<PmRow>()

export const pmColumns: ColumnDef<PmRow, any>[] = [
    columnHelper.accessor('id', {
        header: 'PM #',
        cell: (info) => (
            <span className="font-semibold text-primary-darker font-mono text-xs">
                PM-{String(info.getValue()).padStart(4, '0')}
            </span>
        ),
        size: 80,
        enableResizing: false,
    }),
    columnHelper.accessor('serialNumber', {
        header: 'Serial No.',
        cell: (info) => (
            <span className="font-medium font-mono text-md text-gray-900">
                {info.getValue() ?? '—'}
            </span>
        ),
        size: 80,
    }),
    columnHelper.accessor('siteName', {
        header: ({ column, table }) => {
            const siteOptions = ((table.options.meta as any)?.siteOptions ?? []) as string[]

            return (
                <div className="flex flex-col gap-1">
                    <span>Site</span>
                    <select
                        value={(column.getFilterValue() ?? '') as string}
                        onChange={(e) => column.setFilterValue(e.target.value || undefined)}
                        className="text-xs py-1 px-1.5 border border-primary-200 rounded bg-white text-gray-700 font-normal focus:outline-none focus:border-primary/60 outline-none w-full max-w-40"
                    >
                        <option value="">All</option>
                        {siteOptions.map((site) => (
                            <option key={site} value={site}>
                                {site}
                            </option>
                        ))}
                    </select>
                </div>
            )
        },
        cell: (info) => (
            <span className="font-medium font-mono text-md text-gray-900">
                {info.getValue() ?? '—'}
            </span>
        ),
        filterFn: (row, columnId, filterValue) => {
            if (!filterValue) return true
            return row.getValue(columnId) === filterValue
        },
        size: 80,
    }),
    columnHelper.accessor('systemName', {
        header: ({ column, table }) => {
            const systemOptions = ((table.options.meta as any)?.systemOptions ?? []) as string[]

            return (
                <div className="flex flex-col gap-1">
                    <span>System</span>
                    <select
                        value={(column.getFilterValue() ?? '') as string}
                        onChange={(e) => column.setFilterValue(e.target.value || undefined)}
                        className="text-xs py-1 px-1.5 border border-primary-200 rounded bg-white text-gray-700 font-normal focus:outline-none focus:border-primary/60 outline-none w-full max-w-32"
                    >
                        <option value="">All</option>
                        {systemOptions.map((system) => (
                            <option key={system} value={system}>
                                {system}
                            </option>
                        ))}
                    </select>
                </div>
            )
        },
        cell: (info) => info.getValue() ?? '—',
        filterFn: (row, columnId, filterValue) => {
            if (!filterValue) return true
            return row.getValue(columnId) === filterValue
        },
        size: 100,
        enableResizing: false,
    }),
    columnHelper.accessor('intervalMonths', {
        header: 'Interval',
        cell: (info) => {
            const months = info.getValue()
            return months ? `${months} month${months > 1 ? 's' : ''}` : '—'
        },
        size: 80,
    }),
    columnHelper.accessor('engineerName', {
        header: 'Engineer',
        cell: (info) => info.getValue() ?? <span className="text-gray-400 italic text-xs">Unassigned</span>,
    }),
    columnHelper.accessor('startAt', {
        header: 'Scheduled',
        cell: (info) => {
            const value = info.getValue()
            if (!value) return <span className="text-gray-300">—</span>
            return (
                <span className="text-gray-600 text-xs">
                    {new Date(value).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        timeZone: 'UTC',
                    })}
                </span>
            )
        },
        size: 120,
    }),
    columnHelper.accessor('completedAt', {
        header: ({ column }) => (
            <div className="flex flex-col gap-1">
                <span>Completed</span>
                <select
                    value={(column.getFilterValue() ?? 'pending') as string}
                    onChange={(e) =>
                        column.setFilterValue(
                            e.target.value === 'all' ? undefined : e.target.value,
                        )
                    }
                    className="text-xs py-1 px-1.5 border border-primary-200 rounded bg-green-50 text-gray-700 font-normal focus:outline-none focus:border-primary/60 outline-none w-full max-w-26 truncate"
                >
                    <option value="all">All</option>
                    <option value="pending">Pending</option>
                    <option value="completed">Completed</option>
                </select>
            </div>
        ),
        cell: (info) => {
            const value = info.getValue()
            if (!value) {
                return (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary-darker border border-primary/20">
                        <AlertCircle size={12} />
                        Pending
                    </span>
                )
            }
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500 border border-gray-200">
                    <CheckCircle2 size={12} />
                    {new Date(value).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        timeZone: 'UTC',
                    })}
                </span>
            )
        },
        filterFn: (row, columnId, filterValue) => {
            if (!filterValue || filterValue === 'all') return true
            const value = row.getValue(columnId)
            if (filterValue === 'pending') return !value
            if (filterValue === 'completed') return !!value
            return true
        },
        size: 100,
    }),
]
