import { useState, useEffect } from 'react'

export function EditableRequestEngineerNoteCell({
    requestId,
    value,
    editable,
    onSave,
}: {
    requestId: number
    value: string | null
    editable: boolean
    onSave?: (requestId: number, engineerComment: string | null) => Promise<void>
}) {
    const [editing, setEditing] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [text, setText] = useState(value ?? '')

    useEffect(() => {
        if (!editing) {
            setText(value ?? '')
        }
    }, [value, editing])

    const handleSave = async () => {
        const trimmed = text.trim()
        const original = value?.trim() ?? ''

        if (trimmed === original) {
            setText(value ?? '')
            setEditing(false)
            return
        }

        if (!onSave) {
            setText(value ?? '')
            setEditing(false)
            return
        }

        setIsSaving(true)
        try {
            await onSave(requestId, trimmed || null)
            setEditing(false)
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to save engineer note'
            alert(message)
            setText(value ?? '')
            setEditing(false)
        } finally {
            setIsSaving(false)
        }
    }

    if (!editing) {
        const displayValue = value?.trim() ?? ''
        const baseClass = `whitespace-pre-wrap break-words min-h-[40px] italic ${editable ? 'cursor-pointer hover:bg-primary/5 rounded px-1 py-0.5 -mx-1 transition-colors' : 'text-gray-600'}`

        return (
            <div
                className={displayValue ? baseClass : `${baseClass} text-gray-400`}
                onClick={() => {
                    if (editable) {
                        setEditing(true)
                    }
                }}
                title={editable ? 'Click to edit' : undefined}
            >
                {displayValue || '—'}
            </div>
        )
    }

    return (
        <textarea
            autoFocus
            value={text}
            disabled={isSaving}
            onChange={(e) => setText(e.target.value)}
            onBlur={handleSave}
            onKeyDown={(e) => {
                if (e.key === 'Escape') {
                    setText(value ?? '')
                    setEditing(false)
                }
                if (e.key === 'Enter' && e.ctrlKey) {
                    e.preventDefault()
                    handleSave()
                }
            }}
            className="w-full border border-primary/30 rounded-md px-2 py-1.5 text-sm italic focus:outline-none focus:ring-2 focus:ring-primary/40 resize-y min-h-[80px]"
        />
    )
}
