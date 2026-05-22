import { useMutation, useQuery } from '@tanstack/react-query'
import { createFileRoute, redirect } from '@tanstack/react-router'
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
import { keyFor, toKey, type EntryKey } from '../../features/config/format'
import { RolePermissionsGrid } from '../../features/config/components/RolePermissionsGrid'

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
        <RolePermissionsGrid
            data={data}
            selectedRole={selectedRole}
            setActiveRole={setActiveRole}
            selected={selected}
            toggle={toggle}
            dirty={dirty}
            isSaving={saveMutation.isPending}
            onReset={handleReset}
            onSave={handleSave}
        />
    )
}
