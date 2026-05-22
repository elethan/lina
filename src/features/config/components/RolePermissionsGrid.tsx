import { Save, RotateCcw, ShieldCheck } from 'lucide-react'
import type { RolePermissionEntry } from '../../../data/role-permissions.api'
import { keyFor, toLabel, type EntryKey } from '../format'

export type RolePermissionsConfigData = {
    roles: string[]
    resources: string[]
    actions: string[]
    rows: RolePermissionEntry[]
}

export function RolePermissionsGrid({
    data,
    selectedRole,
    setActiveRole,
    selected,
    toggle,
    dirty,
    isSaving,
    onReset,
    onSave,
}: {
    data: RolePermissionsConfigData
    selectedRole: string
    setActiveRole: (role: string) => void
    selected: Set<EntryKey>
    toggle: (role: string, resource: string, action: string) => void
    dirty: boolean
    isSaving: boolean
    onReset: () => void
    onSave: () => void
}) {
    return (
        <div className="flex-1 overflow-auto px-6 py-4">
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center gap-3 justify-between">
                    <div>
                        <h2 className="text-base font-semibold text-gray-900">Role Permissions</h2>
                        <p className="text-xs text-gray-500 mt-1">
                            Select a role on the left, then toggle permissions on the right.
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={onReset}
                            disabled={!dirty || isSaving}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <RotateCcw size={14} />
                            Reset
                        </button>
                        <button
                            type="button"
                            onClick={onSave}
                            disabled={!dirty || isSaving}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary-dark disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <Save size={14} />
                            {isSaving ? 'Saving...' : 'Save'}
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-12 min-h-[520px]">
                    <aside className="col-span-12 md:col-span-3 border-b md:border-b-0 md:border-r border-gray-100 bg-gray-50 p-3">
                        <p className="px-2 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                            Roles
                        </p>
                        <div className="mt-1 space-y-1">
                            {data.roles.map((role) => {
                                const isActive = role === selectedRole
                                return (
                                    <button
                                        key={role}
                                        type="button"
                                        onClick={() => setActiveRole(role)}
                                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                                            isActive
                                                ? 'bg-primary text-white'
                                                : 'text-gray-700 hover:bg-gray-100'
                                        }`}
                                    >
                                        {toLabel(role)}
                                    </button>
                                )
                            })}
                        </div>
                    </aside>

                    <section className="col-span-12 md:col-span-9 overflow-x-auto">
                        <div className="px-4 py-3 border-b border-gray-100">
                            <p className="text-sm font-semibold text-gray-900">
                                {selectedRole ? `${toLabel(selectedRole)} Permissions` : 'Permissions'}
                            </p>
                        </div>

                        <table className="min-w-full">
                            <thead>
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-primary-900 uppercase tracking-wider bg-primary-100 border-b border-primary-200/50 sticky left-0 z-10">
                                        Resource
                                    </th>
                                    {data.actions.map((action) => (
                                        <th
                                            key={action}
                                            className="px-4 py-3 text-center text-xs font-semibold text-primary-900 uppercase tracking-wider bg-primary-100 border-b border-primary-200/50"
                                        >
                                            {action}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {data.resources.map((resource) => (
                                    <tr key={`${selectedRole}:${resource}`} className="hover:bg-gray-50/70">
                                        <td className="px-4 py-3 text-sm text-gray-700 align-top sticky left-0 bg-white border-r border-gray-100">
                                            <div className="font-semibold text-gray-900">{toLabel(resource)}</div>
                                        </td>
                                        {data.actions.map((action) => {
                                            const entryKey = keyFor(selectedRole, resource, action)
                                            const checked = selected.has(entryKey)
                                            return (
                                                <td key={entryKey} className="px-4 py-3 text-center">
                                                    <label className="inline-flex items-center justify-center">
                                                        <input
                                                            type="checkbox"
                                                            checked={checked}
                                                            onChange={() => toggle(selectedRole, resource, action)}
                                                            disabled={isSaving || !selectedRole}
                                                            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                                        />
                                                    </label>
                                                </td>
                                            )
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </section>
                </div>

                <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex items-center gap-2 text-xs text-gray-600">
                    <ShieldCheck size={14} className="text-primary" />
                    Server-side guards enforce these permissions after save.
                </div>
            </div>
        </div>
    )
}
