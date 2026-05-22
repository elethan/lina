import { useMutation, useQuery } from '@tanstack/react-query'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { Save, RotateCcw, ShieldCheck } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSetToolbar } from '../../components/ToolbarContext'
import {
    buildRedirectTargetFromLocation,
    UNAUTHORIZED_REDIRECT_NOTICE,
} from '../../lib/redirect-target'
import {
    fetchRolePermissionsConfig,
    saveRolePermissionsConfig,
    type RolePermissionEntry,
} from '../../data/role-permissions.api'

type EntryKey = `${string}:${string}:${string}`

function toKey(entry: RolePermissionEntry): EntryKey {
    return `${entry.role}:${entry.resource}:${entry.action}`
}

function keyFor(role: string, resource: string, action: string): EntryKey {
    return `${role}:${resource}:${action}`
}

function toLabel(value: string): string {
    return value
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/^./, (char) => char.toUpperCase())
}

export const Route = createFileRoute('/_app/config')({
    beforeLoad: ({ context, location }) => {
        const role = String((context as any).user?.role ?? '').toLowerCase()
        if (!role) {
            throw redirect({
                to: '/login',
                search: {
                    redirect: buildRedirectTargetFromLocation(location),
                },
            })
        }
        if (role !== 'admin') {
            throw redirect({
                to: '/',
                search: {
                    notice: UNAUTHORIZED_REDIRECT_NOTICE,
                },
            })
        }
    },
    component: ConfigPage,
})

function ConfigPage() {
    useSetToolbar({
        title: 'Config',
        leftContent: null,
        rightContent: null,
    })

    const [selected, setSelected] = useState<Set<EntryKey>>(new Set())
    const [baseline, setBaseline] = useState<Set<EntryKey>>(new Set())
    const [activeRole, setActiveRole] = useState<string>('')

    const { data, isLoading, refetch, error } = useQuery({
        queryKey: ['role-permissions-config'],
        queryFn: () => fetchRolePermissionsConfig(),
    })

    useEffect(() => {
        if (!data) return
        const next = new Set<EntryKey>(data.rows.map(toKey))
        setSelected(next)
        setBaseline(new Set(next))
        if (!activeRole || !data.roles.includes(activeRole as any)) {
            setActiveRole(data.roles[0] ?? '')
        }
    }, [data])

    const selectedRole = useMemo(() => {
        if (!data) return ''
        if (data.roles.includes(activeRole as any)) {
            return activeRole
        }
        return data.roles[0] ?? ''
    }, [data, activeRole])

    const saveMutation = useMutation({
        mutationFn: async (rows: RolePermissionEntry[]) => saveRolePermissionsConfig({ data: { rows } }),
        onSuccess: async () => {
            await refetch()
        },
    })

    const dirty = useMemo(() => {
        if (selected.size !== baseline.size) return true
        for (const key of selected) {
            if (!baseline.has(key)) return true
        }
        return false
    }, [selected, baseline])

    const toggle = (role: string, resource: string, action: string) => {
        const entryKey = keyFor(role, resource, action)
        setSelected((prev) => {
            const next = new Set(prev)
            if (next.has(entryKey)) {
                next.delete(entryKey)
            } else {
                next.add(entryKey)
            }
            return next
        })
    }

    const handleReset = () => {
        setSelected(new Set(baseline))
    }

    const handleSave = () => {
        if (!data) return

        const rows: RolePermissionEntry[] = []
        for (const role of data.roles) {
            for (const resource of data.resources) {
                for (const action of data.actions) {
                    const entryKey = keyFor(role, resource, action)
                    if (selected.has(entryKey)) {
                        rows.push({ role, resource, action })
                    }
                }
            }
        }

        saveMutation.mutate(rows)
    }

    if (isLoading) {
        return (
            <div className="flex-1 p-6">
                <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
                    Loading role permissions...
                </div>
            </div>
        )
    }

    if (!data) {
        return (
            <div className="flex-1 p-6">
                <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
                    {error instanceof Error
                        ? error.message
                        : 'Unable to load role permissions configuration'}
                </div>
            </div>
        )
    }

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
                            onClick={handleReset}
                            disabled={!dirty || saveMutation.isPending}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <RotateCcw size={14} />
                            Reset
                        </button>
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={!dirty || saveMutation.isPending}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white text-sm hover:bg-primary-dark disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <Save size={14} />
                            {saveMutation.isPending ? 'Saving...' : 'Save'}
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
                                                            disabled={saveMutation.isPending || !selectedRole}
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
