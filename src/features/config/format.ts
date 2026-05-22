import type { RolePermissionEntry } from '../../data/role-permissions.api'

export type EntryKey = `${string}:${string}:${string}`

export function toKey(entry: RolePermissionEntry): EntryKey {
    return `${entry.role}:${entry.resource}:${entry.action}`
}

export function keyFor(role: string, resource: string, action: string): EntryKey {
    return `${role}:${resource}:${action}`
}

export function toLabel(value: string): string {
    return value
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/^./, (char) => char.toUpperCase())
}
