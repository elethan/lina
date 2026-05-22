import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { updateWorkOrderNote } from '../../../data/workorders.api'

export function EditableNoteCell({
    noteId,
    value,
    onSave,
    editable = true,
}: {
    noteId: number
    value: string
    onSave: () => void
    editable?: boolean
}) {
    const [editing, setEditing] = useState(false)
    const [text, setText] = useState(value)

    const mutation = useMutation({
        mutationFn: async (newText: string) =>
            await updateWorkOrderNote({ data: { noteId, noteText: newText } }),
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
