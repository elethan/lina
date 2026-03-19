import { createFileRoute, redirect, useNavigate, useRouter } from '@tanstack/react-router'

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
import { Search, Calendar, CheckCircle2, AlertCircle, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Play, XCircle, UserPlus, Clock } from 'lucide-react'
import { useSetToolbar } from '../../components/ToolbarContext'
import { fetchWorkOrders, deleteWorkOrders, type WorkOrderRow } from '../../data/workorders.api'
import { fetchEngineers } from '../../data/engineers.api'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog'
import { fetchWorkOrderNotes, addWorkOrderNote, closeWorkOrder, updateWorkOrderNote, startWorkOrder, fetchDowntimeByWoId, createDowntimeEvent, updateDowntimeEvent } from '../../data/workorders.api'
import { useForm } from '@tanstack/react-form'
import { z } from 'zod'

// ── Search params type ─────────────────────────────────────
type WoSearchParams = {
  search?: string
  dateFrom?: string
  dateTo?: string
  status?: string
  engineerId?: number
  newWoId?: number
}

// ── Route ─────────────────────────────────────────────────────
export const Route = createFileRoute('/_app/work-orders')({
  validateSearch: (search: Record<string, unknown>): WoSearchParams => ({
    search: typeof search.search === 'string' ? search.search : undefined,
    dateFrom: typeof search.dateFrom === 'string' ? search.dateFrom : undefined,
    dateTo: typeof search.dateTo === 'string' ? search.dateTo : undefined,
    status: typeof search.status === 'string' ? search.status : 'Open',
    engineerId: search.engineerId ? Number(search.engineerId) : undefined,
    newWoId: search.newWoId ? Number(search.newWoId) : undefined,
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
          })}
        </span>
      )
    },
    size: 110,
  }),
]

// ── Page ──────────────────────────────────────────────────────
function WorkOrdersPage() {
  const { workOrders: data, engineers: engineersList } = Route.useLoaderData()
  const navigate = useNavigate({ from: '/work-orders' })
  const router = useRouter()
  const { search: globalFilter = '', dateFrom = '', dateTo = '', status: statusFilter = 'Open', engineerId, newWoId } = Route.useSearch()
  const selectedEngineerId = engineerId ?? null

  // URL param updaters
  const setGlobalFilter = (value: string) =>
    navigate({ search: (prev: WoSearchParams) => ({ ...prev, search: value || undefined }) })
  const setDateFrom = (value: string) =>
    navigate({ search: (prev: WoSearchParams) => ({ ...prev, dateFrom: value || undefined }) })
  const setDateTo = (value: string) =>
    navigate({ search: (prev: WoSearchParams) => ({ ...prev, dateTo: value || undefined }) })

  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({})
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const selectedCount = Object.keys(rowSelection).length

  // Execution Dialog State
  const [showExecutionDialog, setShowExecutionDialog] = useState(false)
  const [activeWoToExecute, setActiveWoToExecute] = useState<WorkOrderRow | null>(null)

  // Delete Mutation
  const { mutate: mutateDelete } = useMutation({
    mutationFn: async ({ action }: { action: 'delete' | 'keep' }) => {
      const woIds = Object.keys(rowSelection)
        .filter((k) => rowSelection[k])
        .map((k) => filteredData[parseInt(k)]?.id)
        .filter((id): id is number => id !== undefined)

      return await deleteWorkOrders({ data: { woIds, requestAction: action } })
    },
    onSuccess: () => {
      router.invalidate()
      setRowSelection({})
      setShowDeleteDialog(false)
    },
  })

  // Auto-select the newly created WO when navigated from the Requests page
  useEffect(() => {
    if (!newWoId) return
    const rowIndex = filteredData.findIndex((wo) => wo.id === newWoId)
    if (rowIndex !== -1) {
      setRowSelection({ [rowIndex]: true })
    }
    // Clear newWoId from URL so a hard-refresh doesn't re-trigger the selection
    navigate({ search: (prev: WoSearchParams) => ({ ...prev, newWoId: undefined }), replace: true })
  }, [newWoId])

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



  // ── Derived state for single selection ─────────────────────────────────
  const selectedRowIndex = selectedCount === 1 ? Number(Object.keys(rowSelection)[0]) : null
  const selectedWo = selectedRowIndex !== null ? filteredData[selectedRowIndex] ?? null : null
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
          disabled={selectedCount !== 1}
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
          onClick={() => setShowDeleteDialog(true)}
          className="inline-flex items-center justify-center gap-2 px-8 py-2.5 rounded-lg text-sm font-medium bg-white text-gray-600 border border-gray-200 shadow-sm hover:bg-red-50 hover:text-red-600 hover:border-red-200 disabled:opacity-30 disabled:cursor-not-allowed transition-all w-40"
        >
          <XCircle size={16} />
          Close
        </button>
      </div>
    ),
  }), [globalFilter, dateFrom, dateTo, selectedCount, isStarted])

  useSetToolbar(toolbarConfig)

  return (
    <>
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

      <WorkOrderExecutionDialog
        wo={activeWoToExecute}
        open={showExecutionDialog}
        onOpenChange={setShowExecutionDialog}
        engineers={engineersList}
        onCloseComplete={() => setShowExecutionDialog(false)}
      />
    </>
  )
}

// ── Inline Editable Note Cell ───────────────────────────────────
function EditableNoteCell({ noteId, value, onSave }: { noteId: number; value: string; onSave: () => void }) {
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
        onClick={() => setEditing(true)}
        title="Click to edit"
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
  onCloseComplete
}: {
  wo: WorkOrderRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
  engineers: { id: number; name: string }[]
  onCloseComplete: () => void
}) {
  const [showAddNote, setShowAddNote] = useState(false)

  // Local display state for dates & status (so we can update after start/close without refetching the whole page)
  const [displayStartAt, setDisplayStartAt] = useState<string | null>(wo?.startAt ?? null)
  const [displayEndAt, setDisplayEndAt] = useState<string | null>(wo?.endAt ?? null)
  const [displayStatus, setDisplayStatus] = useState<string>(wo?.status ?? 'Open')

  // Reset local state when the WO prop changes (e.g. user selects a different WO)
  useEffect(() => {
    setDisplayStartAt(wo?.startAt ?? null)
    setDisplayEndAt(wo?.endAt ?? null)
    setDisplayStatus(wo?.status ?? 'Open')
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

  // Auto-start: set startAt if the WO hasn't been started yet
  const autoStartedRef = useRef(false)
  useEffect(() => {
    if (open && wo && !wo.startAt && !displayStartAt && !autoStartedRef.current) {
      autoStartedRef.current = true
      startWoMutation.mutate()
    }
    if (!open) {
      autoStartedRef.current = false
    }
  }, [open, wo?.id, displayStartAt])

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
      cell: (info) => <EditableNoteCell noteId={info.row.original.id} value={info.getValue()} onSave={refetch} />,
      size: 400,
    }),
  ], [refetch])

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
        <DialogContent className="max-w-[90vw] sm:max-w-[90vw] w-full max-h-[90vh] flex flex-col p-0 overflow-hidden">
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
                          className="text-sm border border-gray-300 rounded-md py-1 px-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                        <button
                          onClick={() => {
                            if (!dtEndAt) return
                            updateDtMutation.mutate({ id: downtimeEvent.id, endAt: new Date(dtEndAt).toISOString() })
                          }}
                          disabled={!dtEndAt || updateDtMutation.isPending}
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
                      className="w-full text-sm border border-gray-300 rounded-md py-1.5 px-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-500">Restored At <span className="text-gray-400">(optional)</span></label>
                    <input
                      type="datetime-local"
                      value={dtEndAt}
                      onChange={(e) => setDtEndAt(e.target.value)}
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
                      disabled={!dtStartAt || createDtMutation.isPending}
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
                className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium bg-primary-50 text-primary-700 hover:bg-primary-100 transition-colors border border-primary-200"
              >
                <UserPlus size={16} />
                Add Note Entry
              </button>
              {displayStatus !== 'Closed' && (
                <button
                  onClick={() => {
                    if (confirm('Are you sure you want to close this Work Order?')) {
                      closeWoMutation.mutate()
                    }
                  }}
                  disabled={closeWoMutation.isPending}
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

      {/* Secondary Dialog for actually typing the note */}
      <AddNoteDialog
        wo={wo}
        open={showAddNote}
        onOpenChange={setShowAddNote}
        engineers={engineers}
        onSuccess={() => {
          setShowAddNote(false)
          refetch()
        }}
      />
    </>
  )
}


function AddNoteDialog({ wo, open, onOpenChange, engineers, onSuccess }: any) {
  const mutation = useMutation({
    mutationFn: async (values: any) => await addWorkOrderNote({ data: values }),
    onSuccess
  })

  const form = useForm({
    defaultValues: { noteText: '', engineerId: 0 },
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
