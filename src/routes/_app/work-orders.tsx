import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type FilterFn,
  type ColumnDef,
  type ColumnResizeMode,
} from '@tanstack/react-table'
import { rankItem } from '@tanstack/match-sorter-utils'
import { useState, useMemo } from 'react'
import { Search, Calendar, CheckCircle2, Clock, AlertCircle, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Play, XCircle, UserPlus } from 'lucide-react'
import { useSetToolbar } from '../../components/ToolbarContext'
import { fetchWorkOrders, type WorkOrderRow } from '../../data/workorders.api'
import { fetchEngineers } from '../../data/engineers.api'

// ── Search params type ─────────────────────────────────────
type WoSearchParams = {
  search?: string
  dateFrom?: string
  dateTo?: string
  status?: string
  engineerId?: number
}

// ── Route ─────────────────────────────────────────────────────
export const Route = createFileRoute('/_app/work-orders')({
  validateSearch: (search: Record<string, unknown>): WoSearchParams => ({
    search: typeof search.search === 'string' ? search.search : undefined,
    dateFrom: typeof search.dateFrom === 'string' ? search.dateFrom : undefined,
    dateTo: typeof search.dateTo === 'string' ? search.dateTo : undefined,
    status: typeof search.status === 'string' ? search.status : 'Open',
    engineerId: search.engineerId ? Number(search.engineerId) : undefined,
  }),
  beforeLoad: ({ context }) => {
    const user = (context as any).user
    if (user?.role === 'user' || user?.role === 'scientist') {
      throw redirect({ to: '/' })
    }
  },
  loader: async () => {
    const [workOrders, engineers] = await Promise.all([
      fetchWorkOrders(),
      fetchEngineers(),
    ])
    return { workOrders, engineers }
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
    header: ({ column }) => {
      return (
        <div className="flex flex-col gap-1">
          <span>Status</span>
          <select
            value={(column.getFilterValue() ?? 'Open') as string}
            onChange={(e) => column.setFilterValue(e.target.value === 'All' ? undefined : e.target.value)}
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
    header: ({ column, table }) => {
      const engineers = (table.options.meta as any)?.engineersList ?? []
      return (
        <div className="flex flex-col gap-1">
          <span>Engineers</span>
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
    filterFn: (_row, _columnId, filterValue) => {
      if (filterValue === undefined || filterValue === null || filterValue === '') return true
      // TODO: WO engineerNames is an array of strings; filtering by engineer ID requires a different approach.
      return true
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
  columnHelper.accessor('serialNumber', {
    header: 'Serial No.',
    cell: (info) => (
      // <span className="font-medium text-gray-900"></span>
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
]

// ── Page ──────────────────────────────────────────────────────
function WorkOrdersPage() {
  const { workOrders: data, engineers: engineersList } = Route.useLoaderData()
  const navigate = useNavigate({ from: '/work-orders' })
  const { search: globalFilter = '', dateFrom = '', dateTo = '', status: statusFilter = 'Open', engineerId } = Route.useSearch()
  const selectedEngineerId = engineerId ?? null

  // URL param updaters
  const setGlobalFilter = (value: string) =>
    navigate({ search: (prev: WoSearchParams) => ({ ...prev, search: value || undefined }) })
  const setDateFrom = (value: string) =>
    navigate({ search: (prev: WoSearchParams) => ({ ...prev, dateFrom: value || undefined }) })
  const setDateTo = (value: string) =>
    navigate({ search: (prev: WoSearchParams) => ({ ...prev, dateTo: value || undefined }) })

  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({})
  const selectedCount = Object.keys(rowSelection).length

  // Read initial columns filter state from URL search parameters
  const [columnFilters, setColumnFilters] = useState<any[]>([
    ...(statusFilter && statusFilter !== 'All' ? [{ id: 'status', value: statusFilter }] : []),
    ...(selectedEngineerId !== null ? [{ id: 'engineerNames', value: selectedEngineerId }] : []),
  ])

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

    return result
  }, [data, dateFrom, dateTo])

  const [columnResizeMode] = useState<ColumnResizeMode>('onChange')

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { globalFilter, rowSelection, columnFilters },
    initialState: { pagination: { pageSize: 20 } },
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    onColumnFiltersChange: (updater) => {
      setColumnFilters(updater)
      const newFilters = typeof updater === 'function' ? updater(columnFilters) : updater
      const newStatus = newFilters.find((f: any) => f.id === 'status')?.value as string | undefined
      const newEngineerId = newFilters.find((f: any) => f.id === 'engineerNames')?.value as number | undefined

      navigate({
        search: (prev: WoSearchParams) => ({
          ...prev,
          status: newStatus,
          engineerId: newEngineerId,
        })
      })
    },
    globalFilterFn: (row, _columnId, filterValue) => {
      const woId = rankItem(String(row.getValue('id')), filterValue)
      const serial = rankItem(row.getValue('serialNumber') ?? '', filterValue)
      const site = rankItem(row.getValue('siteName') ?? '', filterValue)
      const desc = rankItem(row.getValue('description') ?? '', filterValue)
      return woId.passed || serial.passed || site.passed || desc.passed
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableRowSelection: true,
    columnResizeMode,
    enableColumnResizing: true,
    meta: { engineersList },
  })



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
      <div className="flex items-center gap-2">
        <button
          id="btn-start-wo"
          disabled={selectedCount === 0}
          className="inline-flex items-center justify-center gap-2 px-8 py-2.5 rounded-lg text-sm font-medium bg-primary text-white shadow-sm hover:bg-primary-dark disabled:opacity-30 disabled:cursor-not-allowed transition-all w-40"
        >
          <Play size={16} />
          Start
        </button>
        <button
          id="btn-assign-wo"
          disabled={selectedCount === 0}
          className="inline-flex items-center justify-center gap-2 px-8 py-2.5 rounded-lg text-sm font-medium bg-white text-gray-600 border border-gray-200 shadow-sm hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all w-40"
        >
          <UserPlus size={16} />
          Assign
        </button>
        <button
          id="btn-close-wo"
          disabled={selectedCount === 0}
          className="inline-flex items-center justify-center gap-2 px-8 py-2.5 rounded-lg text-sm font-medium bg-white text-gray-600 border border-gray-200 shadow-sm hover:bg-red-50 hover:text-red-600 hover:border-red-200 disabled:opacity-30 disabled:cursor-not-allowed transition-all w-40"
        >
          <XCircle size={16} />
          Close
        </button>
      </div>
    ),
  }), [globalFilter, dateFrom, dateTo, selectedCount])

  useSetToolbar(toolbarConfig)

  return (
    <>
      {/* ─── Table ─── */}
      <div className="flex-1 overflow-auto px-6 py-4">
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm overflow-x-auto">
          <table className="min-w-full" style={{ width: table.getTotalSize() }}>
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

        {/* Footer — Pagination */}
        <div className="mt-3 flex items-center justify-between text-xs text-gray-500 px-1">
          <span>
            {table.getFilteredRowModel().rows.length} of{' '}
            {data.length} work orders
          </span>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => table.firstPage()}
              disabled={!table.getCanPreviousPage()}
              className="p-1.5 rounded-md hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronsLeft size={14} />
            </button>
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="p-1.5 rounded-md hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="px-2 text-gray-600 font-medium">
              Page {table.getState().pagination.pageIndex + 1} of{' '}
              {table.getPageCount()}
            </span>
            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="p-1.5 rounded-md hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={14} />
            </button>
            <button
              onClick={() => table.lastPage()}
              disabled={!table.getCanNextPage()}
              className="p-1.5 rounded-md hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronsRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
