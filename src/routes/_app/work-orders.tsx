import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
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
import { Search, Calendar, CheckCircle2, Clock, AlertCircle } from 'lucide-react'
import { useSetToolbar } from '../../components/ToolbarContext'
import { fetchWorkOrders, type WorkOrderRow } from '../../data/workorders.api'

// ── Search params type ─────────────────────────────────────
type WoSearchParams = {
  search?: string
  dateFrom?: string
  dateTo?: string
  status?: string
}

// ── Route ─────────────────────────────────────────────────────
export const Route = createFileRoute('/_app/work-orders')({
  validateSearch: (search: Record<string, unknown>): WoSearchParams => ({
    search: typeof search.search === 'string' ? search.search : undefined,
    dateFrom: typeof search.dateFrom === 'string' ? search.dateFrom : undefined,
    dateTo: typeof search.dateTo === 'string' ? search.dateTo : undefined,
    status: typeof search.status === 'string' ? search.status : undefined,
  }),
  beforeLoad: ({ context }) => {
    const user = (context as any).user
    if (user?.role === 'user' || user?.role === 'scientist') {
      throw redirect({ to: '/' })
    }
  },
  loader: async () => {
    const workOrders = await fetchWorkOrders()
    return { workOrders }
  },
  component: WorkOrdersPage,
})

// ── Fuzzy filter ──────────────────────────────────────────────
const fuzzyFilter: FilterFn<WorkOrderRow> = (row, columnId, value, addMeta) => {
  const itemRank = rankItem(row.getValue(columnId), value)
  addMeta({ itemRank })
  return itemRank.passed
}

// ── Columns ───────────────────────────────────────────────────
const columnHelper = createColumnHelper<WorkOrderRow>()

const columns: ColumnDef<WorkOrderRow, any>[] = [
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
    header: 'Status',
    cell: (info) => {
      const status = info.getValue()
      const config: Record<string, { colors: string; icon: typeof CheckCircle2 }> = {
        Open: {
          colors: 'bg-primary/10 text-primary-darker border border-primary/20',
          icon: AlertCircle,
        },
        'In Progress': {
          colors: 'bg-amber-50 text-amber-700 border border-amber-200',
          icon: Clock,
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
    size: 130,
  }),
  columnHelper.accessor('serialNumber', {
    header: 'Asset',
    cell: (info) => (
      <span className="font-medium text-gray-900">
        {info.getValue() ?? '—'}
      </span>
    ),
    filterFn: fuzzyFilter,
  }),
  columnHelper.accessor('siteName', {
    header: 'Site',
    cell: (info) => info.getValue() ?? '—',
    filterFn: fuzzyFilter,
  }),
  columnHelper.accessor('systemName', {
    header: 'System',
    cell: (info) => info.getValue() ?? '—',
  }),
  columnHelper.accessor('description', {
    header: 'Description',
    cell: (info) => {
      const text = info.getValue()
      return (
        <span className="text-gray-500 whitespace-pre-wrap break-words line-clamp-2">
          {text}
        </span>
      )
    },
    size: 300,
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
  columnHelper.accessor('engineerNames', {
    header: 'Engineers',
    cell: (info) => {
      const names = info.getValue()
      if (!names || names.length === 0) {
        return <span className="text-gray-400 italic text-xs">None</span>
      }
      return (
        <div className="flex flex-wrap gap-1">
          {names.map((name: string, i: number) => (
            <span
              key={i}
              className="inline-flex px-2 py-0.5 rounded-md bg-gray-100 text-gray-700 text-xs font-medium"
            >
              {name}
            </span>
          ))}
        </div>
      )
    },
  }),
  columnHelper.accessor('startAt', {
    header: 'Started',
    cell: (info) => {
      const date = info.getValue()
      if (!date) return <span className="text-gray-300">—</span>
      return (
        <span className="text-gray-600 text-xs">
          {new Date(date).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          })}
        </span>
      )
    },
    size: 110,
  }),
  columnHelper.accessor('endAt', {
    header: 'Completed',
    cell: (info) => {
      const date = info.getValue()
      if (!date) return <span className="text-gray-300">—</span>
      return (
        <span className="text-green-600 text-xs font-medium">
          {new Date(date).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          })}
        </span>
      )
    },
    size: 110,
  }),
]

// ── Page ──────────────────────────────────────────────────────
function WorkOrdersPage() {
  const { workOrders: data } = Route.useLoaderData()
  const navigate = useNavigate({ from: '/work-orders' })
  const { search: globalFilter = '', dateFrom = '', dateTo = '', status: statusFilter = '' } = Route.useSearch()

  // URL param updaters
  const setGlobalFilter = (value: string) =>
    navigate({ search: (prev: WoSearchParams) => ({ ...prev, search: value || undefined }) })
  const setDateFrom = (value: string) =>
    navigate({ search: (prev: WoSearchParams) => ({ ...prev, dateFrom: value || undefined }) })
  const setDateTo = (value: string) =>
    navigate({ search: (prev: WoSearchParams) => ({ ...prev, dateTo: value || undefined }) })
  const setStatusFilter = (value: string) =>
    navigate({ search: (prev: WoSearchParams) => ({ ...prev, status: value || undefined }) })

  // Filtered data
  const filteredData = useMemo(() => {
    let result = data

    // Date range filter (on startAt)
    if (dateFrom || dateTo) {
      result = result.filter((row) => {
        if (!row.startAt) return true
        const d = new Date(row.startAt)
        if (dateFrom && d < new Date(dateFrom)) return false
        if (dateTo) {
          const to = new Date(dateTo)
          to.setHours(23, 59, 59, 999)
          if (d > to) return false
        }
        return true
      })
    }

    // Status filter
    if (statusFilter) {
      result = result.filter((row) => row.status === statusFilter)
    }

    return result
  }, [data, dateFrom, dateTo, statusFilter])

  const [columnResizeMode] = useState<ColumnResizeMode>('onChange')

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { globalFilter },
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: (row, _columnId, filterValue) => {
      const serial = rankItem(row.getValue('serialNumber') ?? '', filterValue)
      const site = rankItem(row.getValue('siteName') ?? '', filterValue)
      const desc = rankItem(row.getValue('description') ?? '', filterValue)
      return serial.passed || site.passed || desc.passed
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    columnResizeMode,
    enableColumnResizing: true,
  })

  // Status counts for quick filter badges
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const row of data) {
      counts[row.status] = (counts[row.status] ?? 0) + 1
    }
    return counts
  }, [data])

  // ── Set toolbar content (synchronous — SSR-safe) ─────────────
  const toolbarConfig = useMemo(() => ({
    title: 'Work Orders',
    leftContent: (
      <>
        {/* Fuzzy search */}
        <div className="relative flex-1 min-w-64 max-w-sm">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            id="wo-search"
            type="text"
            placeholder="Search asset, site, or description…"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15 transition-colors"
          />
        </div>

        {/* Date range */}
        <div className="flex items-center gap-2 text-sm">
          <Calendar size={16} className="text-gray-400" />
          <input
            id="wo-date-from"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-600 text-xs focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15 transition-colors"
          />
          <span className="text-gray-400">to</span>
          <input
            id="wo-date-to"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-600 text-xs focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15 transition-colors"
          />
        </div>
      </>
    ),
    rightContent: (
      <>
        {/* Status filter pills */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setStatusFilter('')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${statusFilter === ''
              ? 'bg-gray-900 text-white shadow-sm'
              : 'text-gray-500 hover:bg-gray-100'
              }`}
          >
            All ({data.length})
          </button>
          {Object.entries(statusCounts).map(([status, count]) => {
            const colorMap: Record<string, string> = {
              Open: 'bg-primary text-white',
              'In Progress': 'bg-amber-500 text-white',
              Closed: 'bg-gray-500 text-white',
            }
            return (
              <button
                key={status}
                onClick={() =>
                  setStatusFilter(statusFilter === status ? '' : status)
                }
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${statusFilter === status
                  ? colorMap[status] ?? 'bg-gray-900 text-white'
                  : 'text-gray-500 hover:bg-gray-100'
                  } shadow-sm`}
              >
                {status} ({count})
              </button>
            )
          })}
        </div>
      </>
    ),
  }), [globalFilter, dateFrom, dateTo, statusFilter, statusCounts, data.length])

  useSetToolbar(toolbarConfig)

  return (
    <>
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
                      className="px-4 py-3 text-left text-xs font-semibold text-primary-900 uppercase tracking-wider bg-primary-100 border-b border-primary-200/50 relative"
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
                    No work orders found.
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className="transition-colors hover:bg-gray-50 cursor-pointer"
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
            {data.length} work orders
          </span>
        </div>
      </div>
    </>
  )
}
