import { createFileRoute, useRouter } from '@tanstack/react-router'
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  flexRender,
  createColumnHelper,
  type FilterFn,
  type ColumnDef,
  type ColumnResizeMode,
} from '@tanstack/react-table'
import { rankItem } from '@tanstack/match-sorter-utils'
import { useState, useMemo } from 'react'
import { Search, Calendar, Eye, Merge, XCircle, ClipboardPlus } from 'lucide-react'
import Sidebar from '../components/Sidebar'
import { fetchRequests, type RequestRow } from '../data/requests.api'
import { createWorkOrder } from '../data/workorders.api'

// ── Route ─────────────────────────────────────────────────────
export const Route = createFileRoute('/')(
  {
    loader: () => fetchRequests(),
    component: RequestsPage,
  },
)

// ── Fuzzy filter ──────────────────────────────────────────────
const fuzzyFilter: FilterFn<RequestRow> = (row, columnId, value, addMeta) => {
  const itemRank = rankItem(row.getValue(columnId), value)
  addMeta({ itemRank })
  return itemRank.passed
}

// ── Columns ───────────────────────────────────────────────────
const columnHelper = createColumnHelper<RequestRow>()

const columns: ColumnDef<RequestRow, any>[] = [
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
  }),
  columnHelper.accessor('commentText', {
    header: 'Comment',
    cell: (info) => {
      const text = info.getValue()
      return (
        <span className="text-gray-500 whitespace-pre-wrap break-words">
          {text}
        </span>
      )
    },
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
      })
    },
  }),
  columnHelper.accessor('reportedBy', {
    header: 'Reported By',
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor('status', {
    header: 'Status',
    cell: (info) => {
      const status = info.getValue()
      const colors: Record<string, string> = {
        Open: 'bg-primary/10 text-primary-darker border border-primary/20',
        'In Progress': 'bg-amber-50 text-amber-700 border border-amber-200',
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
  }),
  columnHelper.accessor('engineerName', {
    header: 'Engineer',
    cell: (info) => {
      const name = info.getValue()
      return name ? (
        <span className="text-gray-700">{name}</span>
      ) : (
        <span className="text-gray-400 italic text-xs">Unassigned</span>
      )
    },
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
  columnHelper.accessor('systemName', {
    header: 'System',
    cell: (info) => info.getValue() ?? '—',
  }),
]

// ── Page ──────────────────────────────────────────────────────
function RequestsPage() {
  const data = Route.useLoaderData()
  const router = useRouter()

  const [globalFilter, setGlobalFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({})

  // Date-filtered data
  const filteredData = useMemo(() => {
    if (!dateFrom && !dateTo) return data
    return data.filter((row) => {
      if (!row.createdAt) return true
      const d = new Date(row.createdAt)
      if (dateFrom && d < new Date(dateFrom)) return false
      if (dateTo) {
        const to = new Date(dateTo)
        to.setHours(23, 59, 59, 999)
        if (d > to) return false
      }
      return true
    })
  }, [data, dateFrom, dateTo])

  const [columnResizeMode] = useState<ColumnResizeMode>('onChange')

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { globalFilter, rowSelection },
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    globalFilterFn: (row, _columnId, filterValue) => {
      const serial = rankItem(row.getValue('serialNumber') ?? '', filterValue)
      const site = rankItem(row.getValue('siteName') ?? '', filterValue)
      return serial.passed || site.passed
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    enableRowSelection: true,
    columnResizeMode,
    enableColumnResizing: true,
  })

  const selectedCount = Object.keys(rowSelection).length

  const handleCreateWO = async () => {
    // Get actual request IDs from the selected row indices
    const selectedRequestIds = Object.keys(rowSelection)
      .filter((key) => rowSelection[key])
      .map((key) => filteredData[parseInt(key)]?.id)
      .filter((id): id is number => id !== undefined)

    if (selectedRequestIds.length === 0) return

    try {
      const result = await createWorkOrder({ data: { requestIds: selectedRequestIds } })
      alert(`Work Order #${result.woId} created successfully!`)
      setRowSelection({})
      router.invalidate()
    } catch (err) {
      alert(`Failed to create WO: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />

      <main className="flex-1 flex flex-col overflow-hidden">
        {/* ─── Top toolbar ─── */}
        <header className="sticky top-0 z-10 flex items-center gap-4 px-6 h-14 bg-white/90 backdrop-blur-md border-b border-gray-200">
          <h1 className="text-lg font-bold text-gray-900 mr-4">Requests</h1>

          {/* Fuzzy search */}
          <div className="relative flex-1 max-w-sm">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              id="system-search"
              type="text"
              placeholder="Search serial number or site…"
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15 transition-colors"
            />
          </div>

          {/* Date range */}
          <div className="flex items-center gap-2 text-sm">
            <Calendar size={16} className="text-gray-400" />
            <input
              id="date-from"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-600 text-xs focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15 transition-colors"
            />
            <span className="text-gray-400">to</span>
            <input
              id="date-to"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-600 text-xs focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15 transition-colors"
            />
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <button
              id="btn-create-wo"
              disabled={selectedCount === 0}
              onClick={handleCreateWO}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-primary text-white shadow-sm hover:bg-primary-dark disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ClipboardPlus size={15} />
              Create WO
            </button>
            <button
              id="btn-details"
              disabled={selectedCount === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-white text-gray-600 border border-gray-200 shadow-sm hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <Eye size={15} />
              Details
            </button>
            <button
              id="btn-merge"
              disabled={selectedCount < 2}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-white text-gray-600 border border-gray-200 shadow-sm hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <Merge size={15} />
              Merge
            </button>
            <button
              id="btn-close"
              disabled={selectedCount === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-white text-gray-600 border border-gray-200 shadow-sm hover:bg-red-50 hover:text-red-600 hover:border-red-200 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <XCircle size={15} />
              Close
            </button>
          </div>
        </header>



        {/* ─── Table ─── */}
        <div className="flex-1 overflow-auto px-6 py-4">
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <table className="w-full">
              <thead>
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <th
                        key={header.id}
                        className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50/80 border-b border-gray-200 relative"
                        style={{ width: header.getSize() }}
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                        {header.column.getCanResize() && (
                          <div
                            onMouseDown={header.getResizeHandler()}
                            onTouchStart={header.getResizeHandler()}
                            className={`absolute right-0 top-0 h-full w-1 cursor-col-resize select-none touch-none hover:bg-primary/40 transition-colors ${header.column.getIsResizing() ? 'bg-primary/60' : ''}`}
                          />
                        )}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody className="divide-y divide-gray-100">
                {table.getRowModel().rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={columns.length}
                      className="px-6 py-16 text-center text-gray-400"
                    >
                      No requests found.
                    </td>
                  </tr>
                ) : (
                  table.getRowModel().rows.map((row) => (
                    <tr
                      key={row.id}
                      className={`transition-colors cursor-pointer ${row.getIsSelected()
                        ? 'bg-primary/5 hover:bg-primary/8'
                        : 'hover:bg-gray-50'
                        }`}
                      onClick={row.getToggleSelectedHandler()}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td
                          key={cell.id}
                          className="px-4 py-3.5 text-sm text-gray-600"
                          style={{ width: cell.column.getSize() }}
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Footer stats */}
          <div className="mt-3 flex items-center justify-between text-xs text-gray-400 px-1">
            <span>
              {table.getFilteredRowModel().rows.length} of{' '}
              {data.length} requests
            </span>
            <span>
              {selectedCount > 0 &&
                `${selectedCount} selected`}
            </span>
          </div>
        </div>
      </main>
    </div>
  )
}
