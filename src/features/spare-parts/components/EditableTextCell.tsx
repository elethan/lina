import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { updateSparePart } from '../../../data/spare-parts.api'

export function EditableTextCell({
    partId,
    value,
    field,
    editable = true,
    onSave,
}: {
    partId: number
    value: string
    field: 'code' | 'name'
    editable?: boolean
    onSave: () => void
}) {
    const [editing, setEditing] = useState(false)
    const [text, setText] = useState(value)

    const mutation = useMutation({
        mutationFn: async (nextValue: string) =>
            updateSparePart({ data: { partId, [field]: nextValue } }),
        onSuccess: () => {
            setEditing(false)
            onSave()
        },
        onError: (error: Error) => {
            alert(error.message || 'Failed to update spare part')
            setText(value)
            setEditing(false)
        },
    })

    const handleSave = () => {
        const trimmed = text.trim()

        if (!trimmed) {
            setText(value)
            setEditing(false)
            return
        }

        if (trimmed === value) {
            setEditing(false)
            return
        }

        mutation.mutate(trimmed)
    }

    if (!editing) {
        return (
            <div
                className={`min-h-[1.5em] rounded px-1 py-0.5 -mx-1 ${editable ? 'cursor-pointer transition-colors hover:bg-primary/5' : ''}`}
                onClick={() => {
                    if (!editable) return
                    setText(value)
                    setEditing(true)
                }}
                title={editable ? 'Click to edit' : undefined}
            >
                {value}
            </div>
        )
    }

    return (
        <input
            autoFocus
            value={text}
            disabled={mutation.isPending}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => setText(event.target.value)}
            onBlur={handleSave}
            onKeyDown={(event) => {
                if (event.key === 'Escape') {
                    setText(value)
                    setEditing(false)
                }

                if (event.key === 'Enter') {
                    handleSave()
                }
            }}
            className="w-full rounded-md border border-primary/30 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
    )
}