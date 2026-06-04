import { createColumnHelper, type ColumnDef } from '@tanstack/react-table'
import { Trash2 } from 'lucide-react'
import type { SparePartOption, SparePartRow } from '../../data/spare-parts.api'
import { EditableNumberCell } from './components/EditableNumberCell'
import { EditableSelectCell } from './components/EditableSelectCell'
import { EditableTextCell } from './components/EditableTextCell'

export type SparePartsTableMeta = {
    canUpdateSpareParts: boolean
    canDeleteSpareParts: boolean
    siteOptions: SparePartOption[]
    locationOptions: SparePartOption[]
    onRefresh: () => void
    onDelete: (row: SparePartRow) => void
}

const columnHelper = createColumnHelper<SparePartRow>()

export const sparePartColumns: ColumnDef<SparePartRow, any>[] = [
    columnHelper.display({
        id: 'select',
        header: ({ table }) => (
            <div className="flex justify-center">
                <input
                    type="checkbox"
                    className="accent-primary rounded"
                    checked={table.getIsAllPageRowsSelected()}
                    ref={(element) => {
                        if (element) {
                            element.indeterminate = table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected()
                        }
                    }}
                    onChange={table.getToggleAllPageRowsSelectedHandler()}
                    onClick={(event) => event.stopPropagation()}
                    aria-label="Select current page spare parts"
                />
            </div>
        ),
        cell: ({ row }) => (
            <div className="flex justify-center">
                <input
                    type="checkbox"
                    className="accent-primary rounded"
                    checked={row.getIsSelected()}
                    onChange={row.getToggleSelectedHandler()}
                    onClick={(event) => event.stopPropagation()}
                    aria-label={`Select spare part ${row.original.code}`}
                />
            </div>
        ),
        size: 48,
        enableResizing: false,
    }),
    columnHelper.accessor('code', {
        header: 'Code',
        size: 150,
        cell: (info) => {
            const meta = info.table.options.meta as SparePartsTableMeta
            return (
                <EditableTextCell
                    partId={info.row.original.id}
                    value={info.getValue()}
                    field="code"
                    editable={meta.canUpdateSpareParts}
                    onSave={meta.onRefresh}
                />
            )
        },
    }),
    columnHelper.accessor('name', {
        header: 'Name',
        size: 320,
        cell: (info) => {
            const meta = info.table.options.meta as SparePartsTableMeta
            return (
                <EditableTextCell
                    partId={info.row.original.id}
                    value={info.getValue()}
                    field="name"
                    editable={meta.canUpdateSpareParts}
                    onSave={meta.onRefresh}
                />
            )
        },
    }),
    columnHelper.accessor('siteName', {
        header: ({ column, table }) => {
            const meta = table.options.meta as SparePartsTableMeta

            return (
                <div className="flex flex-col items-center gap-1">
                    <span>Site</span>
                    <select
                        value={(column.getFilterValue() ?? '') as string}
                        onChange={(event) => column.setFilterValue(event.target.value || undefined)}
                        onClick={(event) => event.stopPropagation()}
                        className="w-full max-w-40 rounded border border-primary-200 bg-white px-1.5 py-1 text-center text-xs font-normal text-gray-700 outline-none focus:border-primary/60"
                    >
                        <option value="">All</option>
                        {meta.siteOptions.map((site) => (
                            <option key={site.id} value={site.name}>
                                {site.name}
                            </option>
                        ))}
                    </select>
                </div>
            )
        },
        size: 180,
        cell: (info) => {
            const meta = info.table.options.meta as SparePartsTableMeta
            return (
                <EditableSelectCell
                    partId={info.row.original.id}
                    value={info.row.original.siteId}
                    label={info.getValue()}
                    field="siteId"
                    options={meta.siteOptions}
                    editable={meta.canUpdateSpareParts}
                    onSave={meta.onRefresh}
                />
            )
        },
        filterFn: (row, columnId, filterValue) => {
            if (!filterValue) return true
            return row.getValue(columnId) === filterValue
        },
    }),
    columnHelper.accessor('quantity', {
        header: 'Qty',
        size: 90,
        cell: (info) => {
            const meta = info.table.options.meta as SparePartsTableMeta
            return (
                <EditableNumberCell
                    partId={info.row.original.id}
                    value={info.getValue()}
                    editable={meta.canUpdateSpareParts}
                    onSave={meta.onRefresh}
                />
            )
        },
    }),
    columnHelper.accessor('locationName', {
        header: 'Location',
        size: 200,
        cell: (info) => {
            const meta = info.table.options.meta as SparePartsTableMeta
            return (
                <EditableSelectCell
                    partId={info.row.original.id}
                    value={info.row.original.locationId}
                    label={info.getValue()}
                    field="locationId"
                    options={meta.locationOptions}
                    nullable
                    editable={meta.canUpdateSpareParts}
                    onSave={meta.onRefresh}
                />
            )
        },
    }),
    columnHelper.display({
        id: 'actions',
        header: '',
        size: 60,
        enableResizing: false,
        cell: (info) => {
            const meta = info.table.options.meta as SparePartsTableMeta

            if (!meta.canDeleteSpareParts) {
                return null
            }

            return (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation()
                        meta.onDelete(info.row.original)
                    }}
                    className="inline-flex items-center justify-center rounded-md p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                    aria-label={`Delete spare part ${info.row.original.code}`}
                    title="Delete spare part"
                >
                    <Trash2 size={16} />
                </button>
            )
        },
    }),
]