import { createFileRoute } from '@tanstack/react-router'
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table'
import { useMemo } from 'react'
import Sidebar from '../components/Sidebar'

// Placeholder data — will be replaced with real DB queries later
type Asset = {
  id: number
  serialNumber: string
  modelName: string
  site: string
  status: string
}

const placeholderData: Asset[] = [
  {
    id: 1,
    serialNumber: 'SN-001',
    modelName: 'TrueBeam',
    site: 'Main Campus',
    status: 'Operational',
  },
  {
    id: 2,
    serialNumber: 'SN-002',
    modelName: 'Halcyon',
    site: 'North Wing',
    status: 'Under Maintenance',
  },
  {
    id: 3,
    serialNumber: 'SN-003',
    modelName: 'VitalBeam',
    site: 'Satellite Clinic',
    status: 'Operational',
  },
  {
    id: 4,
    serialNumber: 'SN-004',
    modelName: 'Clinac iX',
    site: 'Main Campus',
    status: 'Decommissioned',
  },
  {
    id: 5,
    serialNumber: 'SN-005',
    modelName: 'TrueBeam',
    site: 'East Pavilion',
    status: 'Operational',
  },
]

const columnHelper = createColumnHelper<Asset>()

const columns = [
  columnHelper.accessor('id', {
    header: '#',
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor('serialNumber', {
    header: 'Serial Number',
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor('modelName', {
    header: 'Model',
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor('site', {
    header: 'Site',
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor('status', {
    header: 'Status',
    cell: (info) => {
      const status = info.getValue()
      const colors: Record<string, string> = {
        Operational: 'bg-emerald-500/20 text-emerald-400',
        'Under Maintenance': 'bg-amber-500/20 text-amber-400',
        Decommissioned: 'bg-slate-500/20 text-slate-400',
      }
      return (
        <span
          className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[status] ?? 'bg-slate-700 text-slate-300'}`}
        >
          {status}
        </span>
      )
    },
  }),
]

export const Route = createFileRoute('/')({
  component: DashboardPage,
})

function DashboardPage() {
  const data = useMemo(() => placeholderData, [])

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <div className="flex h-screen bg-slate-950">
      <Sidebar />

      <main className="flex-1 overflow-auto">
        {/* Top bar */}
        <header className="sticky top-0 z-10 flex items-center justify-between px-8 h-14 bg-slate-950/80 backdrop-blur-md border-b border-slate-800/50">
          <h1 className="text-lg font-semibold text-white">Assets</h1>
        </header>

        {/* Table */}
        <div className="p-8">
          <div className="bg-slate-900/50 border border-slate-800/50 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <th
                        key={header.id}
                        className="px-6 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider bg-slate-900/80 border-b border-slate-800/50"
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody className="divide-y divide-slate-800/30">
                {table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className="hover:bg-slate-800/30 transition-colors"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className="px-6 py-4 text-sm text-slate-300"
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  )
}
