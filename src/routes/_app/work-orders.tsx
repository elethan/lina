import { createFileRoute, redirect, useNavigate, useRouter, useRouteContext, Await } from '@tanstack/react-router'
import TableSkeleton from '../../components/TableSkeleton'

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
import { useState, useMemo, useRef, useEffect } from 'react'
import { useDynamicPageSize } from '../../hooks/useDynamicPageSize'
import { Search, Calendar, CheckCircle2, AlertCircle, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Play, XCircle, UserPlus, Clock } from 'lucide-react'
import { useSetToolbar } from '../../components/ToolbarContext'
import { fetchWorkOrders, deleteWorkOrders, type WorkOrderRow } from '../../data/workorders.api'
import { fetchEngineers, assignWorkOrdersToEngineer } from '../../data/engineers.api'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog'
import { fetchWorkOrderNotes, addWorkOrderNote, closeWorkOrder, updateWorkOrderNote, startWorkOrder, fetchDowntimeByWoId, createDowntimeEvent, updateDowntimeEvent } from '../../data/workorders.api'
import { useForm } from '@tanstack/react-form'
import { z } from 'zod'
import { fetchCurrentUserPermissions } from '../../data/current-user-permissions.api'
import { canPermissionMap } from '../../lib/role-permissions'
import { UNAUTHORIZED_REDIRECT_NOTICE } from '../../lib/redirect-target'

// ── Search params type ─────────────────────────────────────
type WoSearchParams = {
  search?: string
  dateFrom?: string
  dateTo?: string
  status?: string
  engineerId?: number
  newWoId?: number
}

const getDefaultDateFrom = () => {
  const date = new Date()
  date.setMonth(date.getMonth() - 6)
  return date.toISOString().slice(0, 10)
}

// ── Route ─────────────────────────────────────────────────────
export const Route = createFileRoute('/_app/work-orders')({
  validateSearch: (search: Record<string, unknown>): WoSearchParams => ({
    search: typeof search.search === 'string' ? search.search : undefined,
    dateFrom: typeof search.dateFrom === 'string' ? search.dateFrom : getDefaultDateFrom(),
    dateTo: typeof search.dateTo === 'string' ? search.dateTo : undefined,
    status: typeof search.status === 'string' ? search.status : 'Open',
    engineerId: search.engineerId ? Number(search.engineerId) : undefined,
    newWoId: search.newWoId ? Number(search.newWoId) : undefined,
  }),
  beforeLoad: ({ context }) => {
    const user = (context as any).user
    if (user?.role === 'therapist') {
      throw redirect({
        to: '/',
        search: {
          notice: UNAUTHORIZED_REDIRECT_NOTICE,
        },
      })
    }
  },
  loaderDeps: ({ search }) => ({
    dateFrom: search.dateFrom,
    dateTo: search.dateTo,
  }),
  loader: async ({ deps }) => {
    const engineers = await fetchEngineers()
    return {
      workOrders: fetchWorkOrders({ data: { dateFrom: deps.dateFrom, dateTo: deps.dateTo } }),
      engineers,
    }
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
          {new Date(date).toLocaleDateString('en-GB', {
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
  columnHelper.accessor('endAt', {
    header: 'End Date',
    cell: (info) => {
      const date = info.getValue()
      if (!date) return <span className="text-gray-300">—</span>
      return (
        <span className="text-green-600 text-xs font-medium">
          {new Date(date).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            timeZone: 'UTC',
          })}
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
          {new Date(date).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            timeZone: 'UTC',
          })}
        </span>
      )
    },
    size: 110,
  }),
]

// ── Page ──────────────────────────────────────────────────────
function WorkOrdersPage() {
  const { workOrders: workOrdersPromise, engineers: engineersList } = Route.useLoaderData()
  const navigate = useNavigate({ from: '/work-orders' })
  const router = useRouter()
  const { user } = useRouteContext({ from: '/_app' })
  const { search: globalFilter = '', dateFrom = '', dateTo = '' } = Route.useSearch()
  const { data: currentPermissions } = useQuery({
    queryKey: ['current-user-permissions'],
    queryFn: () => fetchCurrentUserPermissions(),
  })
  const permissionMap = currentPermissions?.permissions
  const canDeleteWorkOrders = canPermissionMap(permissionMap, 'workOrders', 'delete')
  const canUpdateWorkOrders = canPermissionMap(permissionMap, 'workOrders', 'update')

  // URL param updaters
  const setGlobalFilter = (value: string) =>
    navigate({ search: (prev: WoSearchParams) => ({ ...prev, search: value || undefined }) })
  const setDateFrom = (value: string) =>
    navigate({ search: (prev: WoSearchParams) => ({ ...prev, dateFrom: value || undefined }) })
  const setDateTo = (value: string) =>
    navigate({ search: (prev: WoSearchParams) => ({ ...prev, dateTo: value || undefined }) })

  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({})
  const [selectedWos, setSelectedWos] = useState<WorkOrderRow[]>([])
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const selectedCount = selectedWos.length

  // Execution Dialog State
  const [showExecutionDialog, setShowExecutionDialog] = useState(false)
  const [activeWoToExecute, setActiveWoToExecute] = useState<WorkOrderRow | null>(null)

  // Delete Mutation
  const { mutate: mutateDelete } = useMutation({
    mutationFn: async ({ action }: { action: 'delete' | 'keep' }) => {
      const woIds = selectedWos.map((w) => w.id)
      return await deleteWorkOrders({ data: { woIds, requestAction: action } })
    },
    onSuccess: () => {
      router.invalidate()
      setRowSelection({})
      setShowDeleteDialog(false)
    },
  })

  // ── Derived state for single selection ──────────────────────────────
  const selectedWo = selectedWos[0] ?? null
  const isStarted = !!(selectedWo && selectedWo.startAt)

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
            className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15 transition-colors"
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
            className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-gray-600 text-sm focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15 transition-colors"
          />
          <span className="text-gray-400">to</span>
          <input
            id="wo-date-to"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-gray-600 text-sm focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15 transition-colors"
          />
        </div>
      </>
    ),
    rightContent: (
      <div className="flex items-center gap-2">
        <button
          id="btn-start-wo"
          disabled={selectedCount !== 1 || !canUpdateWorkOrders}
          onClick={() => {
            if (selectedWo) {
              setActiveWoToExecute(selectedWo)
              setShowExecutionDialog(true)
            }
          }}
          className="inline-flex items-center justify-center gap-2 px-8 py-2.5 rounded-lg text-sm font-medium bg-primary text-white shadow-sm hover:bg-primary-dark disabled:opacity-30 disabled:cursor-not-allowed transition-all w-40"
        >
          <Play size={16} />
          {isStarted ? 'Continue' : 'Start'}
        </button>
        {canDeleteWorkOrders && (
          <button
            id="btn-close-wo"
            disabled={selectedCount === 0}
            onClick={() => setShowDeleteDialog(true)}
            className="inline-flex items-center justify-center gap-2 px-8 py-2.5 rounded-lg text-sm font-medium bg-white text-gray-600 border border-gray-200 shadow-sm hover:bg-red-50 hover:text-red-600 hover:border-red-200 disabled:opacity-30 disabled:cursor-not-allowed transition-all w-40"
          >
            <XCircle size={16} />
            Close
          </button>
        )}
      </div>
    ),
  }), [
    globalFilter,
    dateFrom,
    dateTo,
    selectedCount,
    isStarted,
    canDeleteWorkOrders,
    canUpdateWorkOrders,
  ])

  useSetToolbar(toolbarConfig)

  return (
    <>
      {canDeleteWorkOrders && (
        <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <div className="flex items-center gap-3 mb-1">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-red-100 shrink-0">
                  <XCircle size={20} className="text-red-600" />
                </div>
                <DialogTitle className="text-base font-semibold text-gray-900">
                  Close Work Order
                </DialogTitle>
              </div>
              <DialogDescription className="text-sm text-gray-500 leading-relaxed pl-[52px]">
                You are about to delete <span className="font-semibold text-gray-700">{selectedCount} Work Order{selectedCount !== 1 ? 's' : ''}</span>.
                <br /><br />
                What would you like to do with the User Requests associated with {selectedCount === 1 ? 'this' : 'these'} Work Order{selectedCount !== 1 ? 's' : ''}?
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2 mt-4 pl-[52px]">
              <button
                onClick={() => mutateDelete({ action: 'delete' })}
                className="inline-flex w-full items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-red-600 text-white shadow-sm hover:bg-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500/40"
              >
                Delete WO & Requests
              </button>
              <button
                onClick={() => mutateDelete({ action: 'keep' })}
                className="inline-flex w-full items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-white text-gray-700 border border-gray-200 shadow-sm hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-200"
              >
                Delete WO only (Keep Requests)
              </button>
              <button
                onClick={() => setShowDeleteDialog(false)}
                className="mt-2 inline-flex w-full items-center justify-center px-4 py-2.5 rounded-lg text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors focus:outline-none"
              >
                Cancel
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}
      <Await promise={workOrdersPromise} fallback={<TableSkeleton />}>
        {(workOrders) => (
          <WorkOrdersTableView
            data={workOrders}
            engineers={engineersList}
            rowSelection={rowSelection}
            setRowSelection={setRowSelection}
            onSelectionChange={setSelectedWos}
          />
        )}
      </Await>

      <WorkOrderExecutionDialog
        wo={activeWoToExecute}
        open={showExecutionDialog}
        onOpenChange={setShowExecutionDialog}
        engineers={engineersList}
        currentUserId={user?.id || null}
        currentUserName={user?.name || user?.email || null}
        canUpdateWorkOrders={canUpdateWorkOrders}
        onCloseComplete={() => setShowExecutionDialog(false)}
      />
    </>
  )
}

// ── Inner table view (renders inside <Await> once data resolves) ────
function WorkOrdersTableView({
  data,
  engineers: engineersList,
  rowSelection,
  setRowSelection,
  onSelectionChange,
}: {
  data: WorkOrderRow[]
  engineers: { id: number; name: string }[]
  rowSelection: Record<string, boolean>
  setRowSelection: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  onSelectionChange: (items: WorkOrderRow[]) => void
}) {
  const navigate = useNavigate({ from: '/work-orders' })
  const { search: globalFilter = '', status: statusFilter = 'Open', engineerId } = Route.useSearch()
  const selectedEngineerId = engineerId ?? null

  const setGlobalFilter = (value: string) =>
    navigate({ search: (prev: WoSearchParams) => ({ ...prev, search: value || undefined }) })

  // Read initial columns filter state from URL search parameters
  const [columnFilters, setColumnFilters] = useState<any[]>([
    { id: 'status', value: statusFilter || 'Open' },
    ...(selectedEngineerId !== null ? [{ id: 'engineerId', value: selectedEngineerId }] : []),
  ])

  // Keep table filter state aligned with URL-driven defaults.
  useEffect(() => {
    setColumnFilters([
      { id: 'status', value: statusFilter || 'Open' },
      ...(selectedEngineerId !== null ? [{ id: 'engineerId', value: selectedEngineerId }] : []),
    ])
  }, [statusFilter, selectedEngineerId])

  // Filtered data
  const filteredData = useMemo(() => data, [data])

  const [columnResizeMode] = useState<ColumnResizeMode>('onChange')
  const { containerRef, pageSize } = useDynamicPageSize()
  const [pageIndex, setPageIndex] = useState(0)

  const { newWoId } = Route.useSearch()

  // Auto-select the newly created WO when navigated from the Requests page
  useEffect(() => {
    if (!newWoId) return
    const rowIndex = filteredData.findIndex((wo) => wo.id === newWoId)
    if (rowIndex !== -1) {
      setRowSelection({ [rowIndex]: true })
    }
    navigate({ search: (prev: WoSearchParams) => ({ ...prev, newWoId: undefined }), replace: true })
  }, [newWoId])

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { globalFilter, rowSelection, columnFilters, pagination: { pageIndex, pageSize } },
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: (updater) => {
      const next = typeof updater === 'function' ? updater({ pageIndex, pageSize }) : updater
      setPageIndex(next.pageIndex)
    },
    onRowSelectionChange: setRowSelection,
    onColumnFiltersChange: (updater) => {
      setColumnFilters((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater
        const newStatus = (next.find((f: any) => f.id === 'status')?.value as string | undefined) ?? 'Open'
        const newEngineerId = next.find((f: any) => f.id === 'engineerId')?.value as number | undefined

        navigate({
          search: (old: WoSearchParams) => ({
            ...old,
            status: newStatus,
            engineerId: newEngineerId,
          })
        })

        return next
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
    enableMultiRowSelection: false,
    columnResizeMode,
    enableColumnResizing: true,
    meta: { engineersList },
  })

  // Report selected rows using TanStack's selected row model to avoid index/key drift.
  useEffect(() => {
    const selected = table.getSelectedRowModel().rows.map((row) => row.original)
    onSelectionChange(selected)
  }, [table, rowSelection, filteredData, onSelectionChange])

  return (
    <div ref={containerRef} className="flex-1 overflow-auto px-6 py-4">
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
  )
}

// ── Inline Editable Note Cell ───────────────────────────────────
function EditableNoteCell({ noteId, value, onSave, editable = true }: { noteId: number; value: string; onSave: () => void; editable?: boolean }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(value)

  const mutation = useMutation({
    mutationFn: async (newText: string) => await updateWorkOrderNote({ data: { noteId, noteText: newText } }),
    onSuccess: () => {
      setEditing(false)
      onSave()
    },
  })

  const handleSave = () => {
    const trimmed = text.trim()
    if (trimmed && trimmed !== value) {
      mutation.mutate(trimmed)
    } else {
      setText(value)
      setEditing(false)
    }
  }

  if (!editing) {
    return (
      <div
        className="whitespace-pre-wrap break-words cursor-pointer hover:bg-primary/5 rounded px-1 py-0.5 -mx-1 transition-colors min-h-[1.5em]"
        onClick={() => {
          if (editable) {
            setEditing(true)
          }
        }}
        title={editable ? 'Click to edit' : undefined}
      >
        {value}
      </div>
    )
  }

  return (
    <textarea
      autoFocus
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={handleSave}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          setText(value)
          setEditing(false)
        }
        if (e.key === 'Enter' && e.ctrlKey) {
          handleSave()
        }
      }}
      className="w-full border border-primary/30 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-y min-h-[60px]"
    />
  )
}

// ── Helper: ISO → datetime-local input value ───────────────────
function toLocalDatetime(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ── Nested Work Order Execution Dialog ──────────────────────────
function WorkOrderExecutionDialog({
  wo,
  open,
  onOpenChange,
  engineers,
  currentUserId,
  currentUserName,
  canUpdateWorkOrders,
  onCloseComplete
}: {
  wo: WorkOrderRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
  engineers: { id: number; name: string; userId: string | null }[]
  currentUserId: string | null
  currentUserName: string | null
  canUpdateWorkOrders: boolean
  onCloseComplete: () => void
}) {
  const [showAddNote, setShowAddNote] = useState(false)
  const [showCloseConfirmDialog, setShowCloseConfirmDialog] = useState(false)
  const canAssignEngineer = canUpdateWorkOrders

  // Resolve default engineer: assigned WO engineer first, then logged-in engineer profile, then first row.
  const defaultEngineerId: number = (
    wo?.engineerId ??
    engineers.find((e) => currentUserId && e.userId === currentUserId)?.id ??
    engineers.find((e) => currentUserName && e.name.toLowerCase().includes(currentUserName.split(' ')[0]?.toLowerCase() ?? ''))?.id ??
    engineers[0]?.id ??
    0
  )

  // Local display state for dates & status (so we can update after start/close without refetching the whole page)
  const [displayStartAt, setDisplayStartAt] = useState<string | null>(wo?.startAt ?? null)
  const [displayEndAt, setDisplayEndAt] = useState<string | null>(wo?.endAt ?? null)
  const [displayStatus, setDisplayStatus] = useState<string>(wo?.status ?? 'Open')
  const [showStartAssignDialog, setShowStartAssignDialog] = useState(false)
  const [startEngineerId, setStartEngineerId] = useState<number>(
    defaultEngineerId > 0 ? defaultEngineerId : (engineers[0]?.id ?? 0),
  )
  const [startAssignError, setStartAssignError] = useState<string | null>(null)

  // Reset local state when the WO prop changes (e.g. user selects a different WO)
  // ONLY depend on wo?.id — not engineers/defaultEngineerId, because router.invalidate()
  // re-fetches the engineer list with a new array reference, which would reset displayStartAt
  // back to null and re-open the assign dialog even though the mutation already succeeded.
  useEffect(() => {
    setDisplayStartAt(wo?.startAt ?? null)
    setDisplayEndAt(wo?.endAt ?? null)
    setDisplayStatus(wo?.status ?? 'Open')
    setShowCloseConfirmDialog(false)
    setShowStartAssignDialog(false)
    setStartAssignError(null)
    setStartEngineerId(defaultEngineerId > 0 ? defaultEngineerId : (engineers[0]?.id ?? 0))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wo?.id])

  // Mutation to start the WO
  const router = useRouter()
  const startWoMutation = useMutation({
    mutationFn: async () => await startWorkOrder({ data: { woId: wo!.id } }),
    onSuccess: (result) => {
      setDisplayStartAt(result.startAt)
      router.invalidate() // Refresh parent table so "Start" -> "Continue"
    },
  })

  const startWithEngineerMutation = useMutation({
    mutationFn: async (engineerId: number) => {
      if (!wo?.id) {
        throw new Error('Work Order context was lost. Close and reopen the Work Order dialog, then try again.')
      }
      await assignWorkOrdersToEngineer({ data: { woIds: [wo!.id], engineerId } })
      return await startWorkOrder({ data: { woId: wo!.id } })
    },
    onSuccess: (result) => {
      setStartAssignError(null)
      setDisplayStartAt(result.startAt)
      setShowStartAssignDialog(false)
      router.invalidate()
    },
    onError: (err: Error) => {
      setStartAssignError(err.message || 'Failed to assign engineer and start work order')
    },
  })

  const requiresStartEngineerSelection = !!(
    canAssignEngineer &&
    open &&
    wo &&
    !wo.startAt &&
    !displayStartAt &&
    !wo.engineerId
  )

  useEffect(() => {
    if (requiresStartEngineerSelection) {
      setShowStartAssignDialog(true)
    }
  }, [requiresStartEngineerSelection])

  // Auto-start: set startAt if the WO hasn't been started yet
  const autoStartedRef = useRef(false)
  useEffect(() => {
    if (open && wo && !wo.startAt && !displayStartAt && !requiresStartEngineerSelection && !autoStartedRef.current) {
      autoStartedRef.current = true
      startWoMutation.mutate()
    }
    if (!open) {
      autoStartedRef.current = false
    }
  }, [open, wo?.id, displayStartAt, requiresStartEngineerSelection])

  // Fetch the chronologically ordered notes
  const { data: notes, refetch } = useQuery({
    queryKey: ['wo-notes', wo?.id],
    queryFn: () => wo ? fetchWorkOrderNotes({ data: { woId: wo.id } }) : Promise.resolve([]),
    enabled: !!wo && open,
  })

  // Fetch downtime events for this WO
  const { data: downtimeData, refetch: refetchDowntime } = useQuery({
    queryKey: ['wo-downtime', wo?.id],
    queryFn: () => wo ? fetchDowntimeByWoId({ data: { woId: wo.id } }) : Promise.resolve([]),
    enabled: !!wo && open,
  })
  const downtimeEvent = downtimeData?.[0] ?? null

  // Local downtime form state
  const [dtStartAt, setDtStartAt] = useState('')
  const [dtEndAt, setDtEndAt] = useState('')
  const [showDowntimeForm, setShowDowntimeForm] = useState(false)

  // Sync local state when downtime data loads
  useEffect(() => {
    if (downtimeEvent) {
      setDtStartAt(downtimeEvent.startAt ? toLocalDatetime(downtimeEvent.startAt) : '')
      setDtEndAt(downtimeEvent.endAt ? toLocalDatetime(downtimeEvent.endAt) : '')
      setShowDowntimeForm(false)
    } else {
      setDtStartAt('')
      setDtEndAt('')
      setShowDowntimeForm(false)
    }
  }, [downtimeEvent?.id, downtimeEvent?.endAt])

  const createDtMutation = useMutation({
    mutationFn: async (vals: { startAt: string; endAt?: string }) =>
      await createDowntimeEvent({ data: { assetId: wo!.assetId!, systemId: wo!.systemId!, woId: wo!.id, ...vals } }),
    onSuccess: () => { refetchDowntime(); setShowDowntimeForm(false) },
  })

  const updateDtMutation = useMutation({
    mutationFn: async (vals: { id: number; endAt?: string }) =>
      await updateDowntimeEvent({ data: vals }),
    onSuccess: () => refetchDowntime(),
  })

  // Mini table setup for Notes
  const notesColumnHelper = createColumnHelper<any>()
  const notesColumns = useMemo(() => [
    notesColumnHelper.accessor('createdAt', {
      header: 'Date',
      cell: (info) => {
        const d = info.getValue()
        return d ? new Date(d).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '-'
      },
      size: 140,
    }),
    notesColumnHelper.accessor('engineerName', {
      header: 'Engineer',
      cell: (info) => info.getValue() || <span className="text-gray-400 italic">Unknown</span>,
      size: 150,
    }),
    notesColumnHelper.accessor('noteText', {
      header: 'Note',
      cell: (info) => <EditableNoteCell noteId={info.row.original.id} value={info.getValue()} onSave={refetch} editable={canUpdateWorkOrders} />,
      size: 400,
    }),
  ], [refetch, canUpdateWorkOrders])

  const notesTable = useReactTable({
    data: notes || [],
    columns: notesColumns,
    getCoreRowModel: getCoreRowModel(),
  })

  // Close WO mutation
  const closeWoMutation = useMutation({
    mutationFn: async () => await closeWorkOrder({ data: { woId: wo!.id } }),
    onSuccess: (result) => {
      setDisplayEndAt(result.endAt)
      setDisplayStatus('Closed')
      setShowCloseConfirmDialog(false)
      router.invalidate()
      onCloseComplete()
    },
    onError: (err: Error) => {
      if (err.message.includes('downtime end time')) {
        alert('Cannot close: please record downtime end time first.')
      } else {
        alert(err.message || 'Failed to close work order')
      }
    },
  })


  if (!wo) return null

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="px-6 py-4 border-b border-gray-100 bg-gray-50 shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 shrink-0">
                <Play size={20} className="text-primary" />
              </div>
              <div>
                <DialogTitle className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  WO-{String(wo.id).padStart(4, '0')} Execution
                </DialogTitle>
                <DialogDescription className="text-sm text-gray-500 mt-1">
                  {wo.siteName} &middot; {wo.systemName} &middot; {wo.serialNumber || 'No Serial'}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-auto bg-white p-6 flex flex-col gap-6">
            {/* Top Row: Snapshot */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-gray-50 p-4 rounded-xl border border-gray-100">
              <div className="md:col-span-2">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Reported Fault</h4>
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{wo.description}</p>
              </div>
              <div className="flex flex-col gap-3">
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Start Date</h4>
                  <p className="text-sm text-gray-800 font-medium">
                    {displayStartAt ? new Date(displayStartAt).toLocaleString() : <span className="text-gray-400 italic">Not started</span>}
                  </p>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">End Date</h4>
                  <p className="text-sm text-gray-800 font-medium">
                    {displayEndAt ? new Date(displayEndAt).toLocaleString() : <span className="text-gray-400 italic">In progress</span>}
                  </p>
                </div>
              </div>
            </div>

            {/* Downtime Section */}
            <div className="bg-amber-50/50 p-4 rounded-xl border border-amber-200/60">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Clock size={16} className="text-amber-600" />
                  <h4 className="text-xs font-semibold text-amber-800 uppercase tracking-wider">System Downtime</h4>
                </div>
                {!downtimeEvent && !showDowntimeForm && displayStatus !== 'Closed' && (
                  <button
                    onClick={() => setShowDowntimeForm(true)}
                    disabled={!canUpdateWorkOrders}
                    className="text-xs font-medium text-amber-700 hover:text-amber-900 underline underline-offset-2 transition-colors"
                  >
                    Record Downtime
                  </button>
                )}
              </div>

              {downtimeEvent ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs font-medium text-gray-500">Down Since</label>
                    <p className="text-sm text-gray-800 font-medium mt-0.5">
                      {new Date(downtimeEvent.startAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                    </p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500">Restored At</label>
                    {downtimeEvent.endAt ? (
                      <p className="text-sm text-gray-800 font-medium mt-0.5">
                        {new Date(downtimeEvent.endAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                      </p>
                    ) : displayStatus !== 'Closed' ? (
                      <div className="flex items-center gap-2 mt-0.5">
                        <input
                          type="datetime-local"
                          value={dtEndAt}
                          onChange={(e) => setDtEndAt(e.target.value)}
                          disabled={!canUpdateWorkOrders}
                          className="text-sm border border-gray-300 rounded-md py-1 px-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                        <button
                          onClick={() => {
                            if (!dtEndAt) return
                            updateDtMutation.mutate({ id: downtimeEvent.id, endAt: new Date(dtEndAt).toISOString() })
                          }}
                          disabled={!canUpdateWorkOrders || !dtEndAt || updateDtMutation.isPending}
                          className="text-xs font-medium px-3 py-1.5 bg-primary text-white rounded-md hover:bg-primary-dark disabled:opacity-50 transition-colors"
                        >
                          {updateDtMutation.isPending ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                    ) : (
                      <p className="text-sm text-amber-600 italic mt-0.5">Not recorded</p>
                    )}
                  </div>
                  {downtimeEvent.endAt && (
                    <div>
                      <label className="text-xs font-medium text-gray-500">Total Downtime</label>
                      <p className="text-sm text-gray-800 font-medium mt-0.5">
                        {(() => {
                          const ms = new Date(downtimeEvent.endAt).getTime() - new Date(downtimeEvent.startAt).getTime()
                          const hours = Math.floor(ms / 3600000)
                          const mins = Math.floor((ms % 3600000) / 60000)
                          return hours >= 24
                            ? `${Math.floor(hours / 24)}d ${hours % 24}h ${mins}m`
                            : `${hours}h ${mins}m`
                        })()}
                      </p>
                    </div>
                  )}
                </div>
              ) : showDowntimeForm ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-500">Down Since</label>
                    <input
                      type="datetime-local"
                      value={dtStartAt}
                      onChange={(e) => setDtStartAt(e.target.value)}
                      disabled={!canUpdateWorkOrders}
                      className="w-full text-sm border border-gray-300 rounded-md py-1.5 px-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-500">Restored At <span className="text-gray-400">(optional)</span></label>
                    <input
                      type="datetime-local"
                      value={dtEndAt}
                      onChange={(e) => setDtEndAt(e.target.value)}
                      disabled={!canUpdateWorkOrders}
                      className="w-full text-sm border border-gray-300 rounded-md py-1.5 px-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                  <div className="sm:col-span-2 flex gap-2">
                    <button
                      onClick={() => {
                        if (!dtStartAt) { alert('Start time is required'); return }
                        createDtMutation.mutate({
                          startAt: new Date(dtStartAt).toISOString(),
                          endAt: dtEndAt ? new Date(dtEndAt).toISOString() : undefined,
                        })
                      }}
                      disabled={!canUpdateWorkOrders || !dtStartAt || createDtMutation.isPending}
                      className="text-xs font-medium px-4 py-1.5 bg-primary text-white rounded-md hover:bg-primary-dark disabled:opacity-50 transition-colors"
                    >
                      {createDtMutation.isPending ? 'Saving...' : 'Save Downtime'}
                    </button>
                    <button
                      onClick={() => { setShowDowntimeForm(false); setDtStartAt(''); setDtEndAt('') }}
                      className="text-xs font-medium px-4 py-1.5 text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-500 italic">No downtime recorded for this work order.</p>
              )}
            </div>

            {/* Middle Row: Notes Table */}
            <div className="flex-1 flex flex-col min-h-[250px] border border-gray-200 rounded-xl overflow-hidden">
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                <h3 className="font-semibold text-gray-800 text-sm">Engineer Notes History</h3>
                <span className="text-xs text-gray-500 font-medium">{notes?.length || 0} Entries</span>
              </div>
              <div className="flex-1 overflow-auto">
                <table className="min-w-full">
                  <thead className="sticky top-0 bg-white z-10 shadow-sm">
                    {notesTable.getHeaderGroups().map(hg => (
                      <tr key={hg.id}>
                        {hg.headers.map(h => (
                          <th key={h.id} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase border-b" style={{ width: h.getSize() }}>
                            {flexRender(h.column.columnDef.header, h.getContext())}
                          </th>
                        ))}
                      </tr>
                    ))}
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {notes?.length === 0 ? (
                      <tr><td colSpan={3} className="px-4 py-8 text-center text-sm text-gray-400">No notes yet. Add the first one below!</td></tr>
                    ) : (
                      notesTable.getRowModel().rows.map(row => (
                        <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                          {row.getVisibleCells().map(cell => (
                            <td key={cell.id} className="px-4 py-3 text-sm text-gray-700 align-top">
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Bottom Row: Actions */}
            <div className="flex justify-between items-center shrink-0">
              <button
                onClick={() => setShowAddNote(true)}
                disabled={!canUpdateWorkOrders}
                className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium bg-primary-50 text-primary-700 hover:bg-primary-100 transition-colors border border-primary-200"
              >
                <UserPlus size={16} />
                Add Note Entry
              </button>
              {displayStatus !== 'Closed' && (
                <button
                  onClick={() => setShowCloseConfirmDialog(true)}
                  disabled={!canUpdateWorkOrders || closeWoMutation.isPending}
                  className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium bg-red-50 text-red-700 hover:bg-red-100 transition-colors border border-red-200 disabled:opacity-50"
                >
                  <XCircle size={16} />
                  {closeWoMutation.isPending ? 'Closing...' : 'Close Work Order'}
                </button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showCloseConfirmDialog} onOpenChange={setShowCloseConfirmDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Close This Work Order?</DialogTitle>
            <DialogDescription>
              This will mark the work order as Closed and close all linked requests.
              You cannot reopen it from this screen.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setShowCloseConfirmDialog(false)}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
              disabled={closeWoMutation.isPending}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => closeWoMutation.mutate()}
              disabled={!canUpdateWorkOrders || closeWoMutation.isPending}
              className="px-4 py-2 text-sm font-medium bg-red-600 text-white hover:bg-red-700 rounded-md transition-colors disabled:opacity-50"
            >
              {closeWoMutation.isPending ? 'Closing...' : 'Confirm Close'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {canAssignEngineer && (
        <Dialog
          open={showStartAssignDialog}
          onOpenChange={(val) => {
            setShowStartAssignDialog(val)
            if (!val) {
              onOpenChange(false)
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Select Engineer Before Start</DialogTitle>
              <DialogDescription>
                This Work Order has not started and has no assigned engineer. Choose an engineer to continue.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-2 flex flex-col gap-3">
              <select
                value={startEngineerId}
                onChange={(e) => {
                  setStartAssignError(null)
                  setStartEngineerId(Number(e.target.value))
                }}
                className="w-full text-sm border border-gray-300 rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
              >
                <option value={0} disabled>Select Engineer</option>
                {engineers.map((eng) => (
                  <option key={eng.id} value={eng.id}>{eng.name}</option>
                ))}
              </select>
              {startAssignError && (
                <p className="text-sm text-red-600">{startAssignError}</p>
              )}
              <DialogFooter className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setStartAssignError(null)
                    setShowStartAssignDialog(false)
                    onOpenChange(false)
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={startEngineerId <= 0 || !wo?.id || startWithEngineerMutation.isPending}
                  onClick={() => {
                    setStartAssignError(null)
                    if (startEngineerId > 0) {
                      startWithEngineerMutation.mutate(startEngineerId)
                    }
                  }}
                  className="px-4 py-2 text-sm font-medium bg-primary text-white hover:bg-primary-dark rounded-md transition-colors disabled:opacity-50"
                >
                  {startWithEngineerMutation.isPending ? 'Starting...' : 'Assign & Start'}
                </button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Secondary Dialog for actually typing the note */}
      <AddNoteDialog
        wo={wo}
        open={showAddNote}
        onOpenChange={setShowAddNote}
        engineers={engineers}
        defaultEngineerId={defaultEngineerId}
        onSuccess={() => {
          setShowAddNote(false)
          refetch()
        }}
      />
    </>
  )
}


function AddNoteDialog({ wo, open, onOpenChange, engineers, defaultEngineerId = 0, onSuccess }: any) {
  const mutation = useMutation({
    mutationFn: async (values: any) => await addWorkOrderNote({ data: values }),
    onSuccess
  })

  const form = useForm({
    defaultValues: { noteText: '', engineerId: defaultEngineerId },
    onSubmit: async ({ value }) => {
      const parsed = z.object({
        noteText: z.string().min(1, "Note cannot be empty"),
        engineerId: z.number().min(1, "Select an Engineer")
      }).safeParse(value)

      if (!parsed.success) {
        alert(parsed.error.issues[0].message)
        return
      }
      mutation.mutate({ woId: wo.id, ...parsed.data })
    }
  })

  // Sync the defaultEngineerId each time the dialog opens (WO may change)
  useEffect(() => {
    if (open) {
      form.setFieldValue('engineerId', defaultEngineerId)
      form.setFieldValue('noteText', '')
    }
  }, [open, defaultEngineerId])

  return (
    <Dialog open={open} onOpenChange={(val) => {
      if (!val) form.reset()
      onOpenChange(val)
    }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Engineer Note</DialogTitle>
          <DialogDescription>Appending to WO-{String(wo?.id).padStart(4, '0')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => { e.preventDefault(), e.stopPropagation(); form.handleSubmit() }} className="flex flex-col gap-4 mt-4">
          <form.Field name="engineerId">
            {(field) => (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700">Engineer</label>
                <select
                  value={field.state.value}
                  onChange={(e) => field.handleChange(Number(e.target.value))}
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value={0} disabled>Select an engineer...</option>
                  {engineers.map((eng: any) => (
                    <option key={eng.id} value={eng.id}>{eng.name}</option>
                  ))}
                </select>
              </div>
            )}
          </form.Field>

          <form.Field name="noteText">
            {(field) => (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700">Note details</label>
                <textarea
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  rows={5}
                  placeholder="Describe the work completed today..."
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                />
              </div>
            )}
          </form.Field>

          <DialogFooter className="mt-4">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="px-4 py-2 text-sm font-medium bg-primary text-white hover:bg-primary-dark rounded-md transition-colors disabled:opacity-50"
            >
              {mutation.isPending ? 'Saving...' : 'Save Note'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
