import { useMutation } from '@tanstack/react-query'
import { updateSparePart, type SparePartOption } from '../../../data/spare-parts.api'

export function EditableSelectCell({
    partId,
    value,
    label,
    field,
    options,
    nullable = false,
    editable = true,
    onSave,
}: {
    partId: number
    value: number | null
    label: string | null
    field: 'siteId' | 'locationId'
    options: SparePartOption[]
    nullable?: boolean
    editable?: boolean
    onSave: () => void
}) {
    const mutation = useMutation({
        mutationFn: async (nextValue: number | null) =>
            updateSparePart({ data: { partId, [field]: nextValue } }),
        onSuccess: () => onSave(),
        onError: (error: Error) => {
            alert(error.message || 'Failed to update spare part')
        },
    })

    if (!editable) {
        return <span>{label ?? '—'}</span>
    }

    return (
        <select
            value={value ?? ''}
            disabled={mutation.isPending}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => {
                const nextValue = event.target.value === '' ? null : Number(event.target.value)
                if (nextValue === value) return
                if (nextValue === null && !nullable) return
                mutation.mutate(nextValue)
            }}
            className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-700 focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/15"
        >
            {nullable && <option value="">—</option>}
            {options.map((option) => (
                <option key={option.id} value={option.id}>
                    {option.name}
                </option>
            ))}
        </select>
    )
}