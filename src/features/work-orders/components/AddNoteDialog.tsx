import { useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useForm } from '@tanstack/react-form'
import { z } from 'zod'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '../../../components/ui/dialog'
import { addWorkOrderNote, type WorkOrderRow } from '../../../data/workorders.api'

export function AddNoteDialog({
    wo,
    open,
    onOpenChange,
    engineers,
    defaultEngineerId = 0,
    onSuccess,
}: {
    wo: WorkOrderRow | null
    open: boolean
    onOpenChange: (open: boolean) => void
    engineers: { id: number; name: string }[]
    defaultEngineerId?: number
    onSuccess: () => void
}) {
    const mutation = useMutation({
        mutationFn: async (values: any) => await addWorkOrderNote({ data: values }),
        onSuccess,
    })

    const form = useForm({
        defaultValues: { noteText: '', engineerId: defaultEngineerId },
        onSubmit: async ({ value }) => {
            const parsed = z
                .object({
                    noteText: z.string().min(1, 'Note cannot be empty'),
                    engineerId: z.number().min(1, 'Select an Engineer'),
                })
                .safeParse(value)

            if (!parsed.success) {
                alert(parsed.error.issues[0].message)
                return
            }
            mutation.mutate({ woId: wo!.id, ...parsed.data })
        },
    })

    useEffect(() => {
        if (open) {
            form.setFieldValue('engineerId', defaultEngineerId)
            form.setFieldValue('noteText', '')
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, defaultEngineerId])

    return (
        <Dialog
            open={open}
            onOpenChange={(val) => {
                if (!val) form.reset()
                onOpenChange(val)
            }}
        >
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Add Engineer Note</DialogTitle>
                    <DialogDescription>
                        Appending to WO-{String(wo?.id).padStart(4, '0')}
                    </DialogDescription>
                </DialogHeader>

                <form
                    onSubmit={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        form.handleSubmit()
                    }}
                    className="flex flex-col gap-4 mt-4"
                >
                    <form.Field name="engineerId">
                        {(field) => (
                            <div className="flex flex-col gap-1.5">
                                <label className="text-sm font-medium text-gray-700">Engineer</label>
                                <select
                                    value={field.state.value}
                                    onChange={(e) => field.handleChange(Number(e.target.value))}
                                    className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                                >
                                    <option value={0} disabled>
                                        Select an engineer...
                                    </option>
                                    {engineers.map((eng) => (
                                        <option key={eng.id} value={eng.id}>
                                            {eng.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </form.Field>

                    <form.Field name="noteText">
                        {(field) => (
                            <div className="flex flex-col gap-1.5">
                                <label className="text-sm font-medium text-gray-700">Note details</label>
                                <textarea
                                    value={field.state.value}
                                    onChange={(e) => field.handleChange(e.target.value)}
                                    rows={5}
                                    placeholder="Describe the work completed today..."
                                    className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                                />
                            </div>
                        )}
                    </form.Field>

                    <DialogFooter className="mt-4">
                        <button
                            type="button"
                            onClick={() => onOpenChange(false)}
                            className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={mutation.isPending}
                            className="px-4 py-2 text-sm font-medium bg-primary text-white hover:bg-primary-dark rounded-md transition-colors disabled:opacity-50"
                        >
                            {mutation.isPending ? 'Saving...' : 'Save Note'}
                        </button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
