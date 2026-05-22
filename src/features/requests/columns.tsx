import {
    createColumnHelper,
    type ColumnDef,
    type FilterFn,
} from '@tanstack/react-table'
import { rankItem } from '@tanstack/match-sorter-utils'
import type { RequestRow } from '../../data/requests.api'
import type { RequestsTableMeta } from './types'
import { formatDateTimeForDisplay } from './format'
import { EditableRequestCommentCell } from './components/EditableRequestCommentCell'
import { EditableRequestEngineerNoteCell } from './components/EditableRequestEngineerNoteCell'

export const fuzzyFilter: FilterFn<RequestRow> = (row, columnId, value, addMeta) => {
    const itemRank = rankItem(row.getValue(columnId), value)
    addMeta({ itemRank })
    return itemRank.passed
}

const columnHelper = createColumnHelper<RequestRow>()

export const requestColumns: ColumnDef<RequestRow, any>[] = [
    columnHelper.display({
        id: 'select',
        header: ({ table }) => (
            <input
                type="checkbox"
                className="accent-primary rounded"
                checked={table.getIsAllRowsSelected()}
                onChange={table.getToggleAllRowsSelectedHandler()}
            />
        ),
        cell: ({ row }) => (
            <input
                type="checkbox"
                className="accent-primary rounded"
                checked={row.getIsSelected()}
                onChange={row.getToggleSelectedHandler()}
            />
        ),
        size: 40,
        enableResizing: false,
    }),
    columnHelper.accessor('id', {
        header: '#',
        cell: (info) => (
            <span className="text-gray-400 font-mono text-xs">
                {info.getValue()}
            </span>
        ),
        size: 60,
        enableResizing: false,
    }),
    columnHelper.accessor('siteName', {
        header: 'Site',
        cell: (info) => info.getValue() ?? '—',
        filterFn: fuzzyFilter,
        size: 120,
    }),
    columnHelper.accessor('systemName', {
        header: 'System',
        cell: (info) => info.getValue() ?? '—',
        size: 70,
    }),
    columnHelper.accessor('commentText', {
        header: 'Comment',
        cell: (info) => {
            const text = info.getValue()
            const tableMeta = info.table.options.meta as RequestsTableMeta | undefined

            return (
                <EditableRequestCommentCell
                    requestId={info.row.original.id}
                    value={text}
                    editable={Boolean(tableMeta?.canEditRequestComments)}
                    onSave={tableMeta?.saveRequestComment}
                />
            )
        },
        size: 300,
        enableResizing: false,
    }),
    columnHelper.accessor('createdAt', {
        header: 'Date Created',
        cell: (info) => {
            const date = info.getValue()
            if (!date) return '—'
            return new Date(date).toLocaleDateString('en-GB', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                timeZone: 'UTC',
            })
        },
    }),
    columnHelper.accessor('status', {
        header: ({ column }) => (
            <div className="flex flex-col gap-1">
                <span>Status</span>
                <select
                    value={(column.getFilterValue() ?? 'Open') as string}
                    onChange={(e) => column.setFilterValue(e.target.value === 'All' ? undefined : e.target.value)}
                    className="text-xs py-1 px-1.5 border border-primary-200 rounded bg-green-50 text-gray-700 font-normal focus:outline-none focus:border-primary/60 outline-none w-full max-w-20 "
                >
                    <option value="All">All</option>
                    <option value="Open">Open</option>
                    <option value="Active">Active</option>
                    <option value="Closed">Closed</option>
                </select>
            </div>
        ),
        cell: (info) => {
            const status = info.getValue()
            const colors: Record<string, string> = {
                Open: 'bg-primary/10 text-primary-darker border border-primary/20',
                Active: 'bg-blue-100 text-blue-700 border border-blue-200',
                Closed: 'bg-gray-100 text-gray-500 border border-gray-200',
            }
            return (
                <span
                    className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${colors[status] ?? 'bg-gray-100 text-gray-600'}`}
                >
                    {status}
                </span>
            )
        },
        filterFn: (row, columnId, filterValue) => {
            if (!filterValue || filterValue === 'All') return true
            return row.getValue(columnId) === filterValue
        },
        size: 100,
    }),
    columnHelper.accessor('reportedBy', {
        header: 'Reported By',
        cell: (info) => info.getValue(),
    }),
    columnHelper.accessor('engineerComment', {
        header: 'Engineer Note',
        cell: (info) => {
            const text = info.getValue()
            const tableMeta = info.table.options.meta as RequestsTableMeta | undefined

            return (
                <EditableRequestEngineerNoteCell
                    requestId={info.row.original.id}
                    value={text}
                    editable={Boolean(tableMeta?.canEditRequestEngineerNotes)}
                    onSave={tableMeta?.saveRequestEngineerComment}
                />
            )
        },
        size: 150,
        enableResizing: false,
    }),
    columnHelper.accessor('downtimeStartAt', {
        header: 'Downtime Start',
        cell: (info) => {
            const tableMeta = info.table.options.meta as RequestsTableMeta | undefined
            const formatted = formatDateTimeForDisplay(info.getValue(), Boolean(tableMeta?.isDateTimeHydrated))
            if (!formatted) return <span className="text-gray-400">—</span>
            return <span className="text-gray-600 text-xs">{formatted}</span>
        },
        size: 170,
    }),
    columnHelper.accessor('downtimeEndAt', {
        header: 'Downtime End',
        cell: (info) => {
            const tableMeta = info.table.options.meta as RequestsTableMeta | undefined
            const formatted = formatDateTimeForDisplay(info.getValue(), Boolean(tableMeta?.isDateTimeHydrated))
            if (!formatted) return <span className="text-gray-400">—</span>
            return <span className="text-gray-600 text-xs">{formatted}</span>
        },
        size: 170,
    }),
    columnHelper.accessor('woId', {
        header: 'WO #',
        cell: (info) => {
            const val = info.getValue()
            if (!val) return <span className="text-gray-400">—</span>
            return (
                <span className="font-mono text-xs font-semibold px-2 py-1 bg-gray-100 text-gray-700/80 rounded border border-gray-200/50">
                    #{val}
                </span>
            )
        },
        size: 100,
    }),
    columnHelper.accessor('serialNumber', {
        header: 'Serial Number',
        cell: (info) => (
            <span className="font-medium text-gray-900">
                {info.getValue() ?? '—'}
            </span>
        ),
        filterFn: fuzzyFilter,
    }),
]
