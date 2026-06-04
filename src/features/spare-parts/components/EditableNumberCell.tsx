import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { updateSparePart } from '../../../data/spare-parts.api'

export function EditableNumberCell({
    partId,
    value,
    editable = true,
    onSave,
}: {
    partId: number
    value: number
    editable?: boolean
    onSave: () => void
}) {
    const [editing, setEditing] = useState(false)
    const [text, setText] = useState(String(value))

    const mutation = useMutation({
        mutationFn: async (quantity: number) =>
            updateSparePart({ data: { partId, quantity } }),
        onSuccess: () => {
            setEditing(false)
            onSave()
        },
        onError: (error: Error) => {
            alert(error.message || 'Failed to update quantity')
            setText(String(value))
            setEditing(false)
        },
    })

    const handleSave = () => {
        const parsed = Number.parseInt(text, 10)

        if (!Number.isInteger(parsed) || parsed < 0) {
            setText(String(value))
            setEditing(false)
            return
        }

        if (parsed === value) {
            setEditing(false)
            return
        }

        mutation.mutate(parsed)
    }

    if (!editing) {
        return (
            <div
                className={`min-h-[1.5em] rounded px-1 py-0.5 -mx-1 font-medium ${editable ? 'cursor-pointer text-right transition-colors hover:bg-primary/5' : 'text-right'}`}
                onClick={() => {
                    if (!editable) return
                    setText(String(value))
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
            type="number"
            min={0}
            step={1}
            value={text}
            disabled={mutation.isPending}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => setText(event.target.value)}
            onBlur={handleSave}
            onKeyDown={(event) => {
                if (event.key === 'Escape') {
                    setText(String(value))
                    setEditing(false)
                }

                if (event.key === 'Enter') {
                    handleSave()
                }
            }}
            className="w-24 rounded-md border border-primary/30 px-2 py-1.5 text-right text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
    )
}