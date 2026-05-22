import { useForm } from '@tanstack/react-form'
import { useRouter, useRouteContext } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { useEffect, useState, type ChangeEvent } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '../../../components/ui/dialog'
import { createRequest } from '../../../data/requests.api'
import { fetchSiteEquipment, fetchSites } from '../../../data/equipment.api'

export function NewRequestDialog({
    initialSiteId,
    open,
    onOpenChange,
    onAutoWoCreated,
}: {
    initialSiteId?: number
    open: boolean
    onOpenChange: (open: boolean) => void
    onAutoWoCreated?: (info: { woId: number; isNew: boolean }) => void
}) {
    const { user } = useRouteContext({ from: '/_app/' })
    const router = useRouter()
    const siteLocked = typeof initialSiteId === 'number'
    const [selectedSiteId, setSelectedSiteId] = useState<number | undefined>(initialSiteId)
    const [formErrorToast, setFormErrorToast] = useState<string | null>(null)
    const getTodayDateValue = () => new Date().toISOString().slice(0, 10)

    const showFormError = (message: string) => {
        setFormErrorToast(message)
    }

    const handleTimeChangeAndClose = (
        event: ChangeEvent<HTMLInputElement>,
        onChange: (value: string) => void,
    ) => {
        onChange(event.target.value)
        event.currentTarget.blur()
    }

    const { data: sites, isLoading: isLoadingSites } = useQuery({
        queryKey: ['sites'],
        queryFn: async () => fetchSites(),
        enabled: open,
    })

    const { data: equipment, isLoading } = useQuery({
        queryKey: ['siteEquipment', selectedSiteId],
        queryFn: async () => fetchSiteEquipment({ data: { siteId: selectedSiteId as number } }),
        enabled: open && !!selectedSiteId,
    })

    const { mutateAsync: mutateCreateRequest } = useMutation({
        mutationFn: async (data: {
            assetId?: number
            systemId?: number
            reportedBy: string
            commentText: string
            downtimeStartAt?: string
            downtimeEndAt?: string
        }) => {
            return await createRequest({ data })
        },
        onSuccess: (result) => {
            router.invalidate()
            onOpenChange(false)
            if (result.linkedWoId !== undefined) {
                onAutoWoCreated?.({ woId: result.linkedWoId, isNew: result.woIsNew ?? false })
            }
        },
    })

    const form = useForm({
        defaultValues: {
            systemId: 0,
            assetId: 0,
            reportedBy: '',
            commentText: '',
            downtimeDate: getTodayDateValue(),
            downtimeTime: '',
            downtimeEndDate: getTodayDateValue(),
            downtimeEndTime: '',
        },
        onSubmit: async ({ value }) => {
            const parsed = z
                .object({
                    systemId: z.number().min(1, 'System is required'),
                    assetId: z.number().min(1, 'Asset is required'),
                    reportedBy: z.string().min(1, 'Reported by is required'),
                    commentText: z.string().min(1, 'Comment is required'),
                })
                .safeParse(value)

            if (!parsed.success) {
                const firstError = parsed.error.issues[0]?.message ?? 'Please fill out all required fields.'
                showFormError(firstError)
                return
            }

            const hasDowntimeTime = value.downtimeTime.trim().length > 0
            const hasDowntimeEndTime = value.downtimeEndTime.trim().length > 0

            let parsedDowntimeStart: Date | null = null
            if (hasDowntimeTime) {
                parsedDowntimeStart = new Date(`${value.downtimeDate}T${value.downtimeTime}`)
                if (Number.isNaN(parsedDowntimeStart.getTime())) {
                    showFormError('Downtime date/time is invalid')
                    return
                }
            }

            if (hasDowntimeEndTime && !hasDowntimeTime) {
                showFormError('Downtime start time is required when downtime end is provided')
                return
            }

            let parsedDowntimeEnd: Date | null = null
            if (hasDowntimeEndTime) {
                parsedDowntimeEnd = new Date(`${value.downtimeEndDate}T${value.downtimeEndTime}`)
                if (Number.isNaN(parsedDowntimeEnd.getTime())) {
                    showFormError('Downtime end date/time is invalid')
                    return
                }
            }

            if (
                parsedDowntimeStart &&
                parsedDowntimeEnd &&
                parsedDowntimeEnd.getTime() < parsedDowntimeStart.getTime()
            ) {
                showFormError('Downtime end cannot be earlier than downtime start')
                return
            }

            const downtimeStartAt = parsedDowntimeStart?.toISOString()
            const downtimeEndAt = parsedDowntimeEnd?.toISOString()

            await mutateCreateRequest({
                systemId: parsed.data.systemId,
                assetId: parsed.data.assetId,
                reportedBy: parsed.data.reportedBy,
                commentText: parsed.data.commentText,
                downtimeStartAt,
                downtimeEndAt,
            })
        },
    })

    useEffect(() => {
        if (!open) return

        setSelectedSiteId(siteLocked ? initialSiteId : undefined)
        form.setFieldValue('systemId', 0)
        form.setFieldValue('assetId', 0)
        form.setFieldValue('reportedBy', user?.name || user?.email || '')
        form.setFieldValue('commentText', '')
        form.setFieldValue('downtimeDate', getTodayDateValue())
        form.setFieldValue('downtimeTime', '')
        form.setFieldValue('downtimeEndDate', getTodayDateValue())
        form.setFieldValue('downtimeEndTime', '')
        setFormErrorToast(null)
    }, [open, siteLocked, initialSiteId])

    useEffect(() => {
        if (!formErrorToast) return
        const timer = setTimeout(() => setFormErrorToast(null), 2000)
        return () => clearTimeout(timer)
    }, [formErrorToast])

    useEffect(() => {
        if (open && equipment && equipment.assets.length > 0) {
            const currentAssetId = form.getFieldValue('assetId')
            if (!currentAssetId) {
                const firstAssetId = equipment.assets[0].assetId
                form.setFieldValue('assetId', firstAssetId)

                const validSystemIds = equipment.assetSystemMap
                    .filter((m) => m.assetId === firstAssetId)
                    .map((m) => m.systemId)

                const validSystems = equipment.systems.filter((s) => validSystemIds.includes(s.systemId))
                if (validSystems.length > 0) {
                    form.setFieldValue('systemId', validSystems[0].systemId)
                }
            }
        }
    }, [equipment, open, form])

    const selectedSiteName = sites?.find((site) => site.siteId === selectedSiteId)?.name

    const getAvailableSystemsForAsset = (assetId?: number) => {
        if (!equipment) return []
        if (!assetId) return equipment.systems

        const validSystemIds = equipment.assetSystemMap
            .filter((m) => m.assetId === assetId)
            .map((m) => m.systemId)

        return equipment.systems.filter((s) => validSystemIds.includes(s.systemId))
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                {formErrorToast && (
                    <div className="absolute top-4 right-4 z-50 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 shadow-sm">
                        {formErrorToast}
                    </div>
                )}
                <DialogHeader>
                    <DialogTitle>New Request</DialogTitle>
                    <DialogDescription>
                        {selectedSiteId
                            ? `for ${selectedSiteName ?? `site ID ${selectedSiteId}`}.`
                            : ''}
                    </DialogDescription>
                </DialogHeader>

                {(isLoadingSites && open) || (isLoading && !!selectedSiteId) ? (
                    <div className="py-8 text-center text-sm text-gray-500">Loading equipment...</div>
                ) : (
                    <form
                        onSubmit={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            form.handleSubmit()
                        }}
                        noValidate
                        className="space-y-4 pt-4"
                    >
                        <div className="space-y-1.5">
                            <label htmlFor="new-request-site" className="text-sm font-medium text-gray-700">Site</label>
                            <select
                                id="new-request-site"
                                disabled={siteLocked || isLoadingSites}
                                value={selectedSiteId ?? ''}
                                onChange={(e) => {
                                    const value = e.target.value ? Number(e.target.value) : undefined
                                    setSelectedSiteId(value)
                                    form.setFieldValue('systemId', 0)
                                    form.setFieldValue('assetId', 0)
                                }}
                                className="w-full text-sm border border-gray-300 rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary disabled:bg-gray-100 disabled:text-gray-500"
                            >
                                <option value="">Select a Site</option>
                                {sites?.map((site) => (
                                    <option key={site.siteId} value={site.siteId}>{site.name}</option>
                                ))}
                            </select>
                        </div>

                        <form.Field name="assetId">
                            {(field) => (
                                <div className="space-y-1.5">
                                    <label htmlFor={field.name} className="text-sm font-medium text-gray-700">Asset</label>
                                    <select
                                        id={field.name}
                                        disabled={!selectedSiteId}
                                        value={field.state.value || ''}
                                        onChange={(e) => {
                                            const nextAssetId = e.target.value ? Number(e.target.value) : 0
                                            field.handleChange(nextAssetId)

                                            const systemsForAsset = getAvailableSystemsForAsset(
                                                nextAssetId || undefined,
                                            )
                                            form.setFieldValue('systemId', systemsForAsset[0]?.systemId ?? 0)
                                        }}
                                        className="w-full text-sm border border-gray-300 rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary disabled:bg-gray-100 disabled:text-gray-500"
                                    >
                                        <option value="">{selectedSiteId ? 'Select an Asset' : 'Select a Site first'}</option>
                                        {equipment?.assets.map(a => (
                                            <option key={a.assetId} value={a.assetId}>{a.modelName || 'Unknown Model'} (SN: {a.serialNumber})</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </form.Field>

                        <form.Subscribe selector={(state) => state.values.assetId}>
                            {(selectedAssetId) => {
                                const availableSystems = getAvailableSystemsForAsset(selectedAssetId || undefined)

                                return (
                                    <form.Field name="systemId">
                                        {(field) => (
                                            <div className="space-y-1.5">
                                                <label htmlFor={field.name} className="text-sm font-medium text-gray-700">System</label>
                                                <select
                                                    id={field.name}
                                                    disabled={!selectedSiteId}
                                                    value={field.state.value || ''}
                                                    onChange={(e) => field.handleChange(Number(e.target.value))}
                                                    className="w-full text-sm border border-gray-300 rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary disabled:bg-gray-100 disabled:text-gray-500"
                                                >
                                                    <option value="">{selectedSiteId ? 'Select a System' : 'Select a Site first'}</option>
                                                    {availableSystems.map(s => (
                                                        <option key={s.systemId} value={s.systemId}>{s.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}
                                    </form.Field>
                                )
                            }}
                        </form.Subscribe>

                        <form.Field name="reportedBy">
                            {(field) => (
                                <div className="space-y-1.5">
                                    <label htmlFor={field.name} className="text-sm font-medium text-gray-700">Reported By</label>
                                    <input
                                        id={field.name}
                                        type="text"
                                        placeholder="Clinical staff name"
                                        value={field.state.value}
                                        onChange={(e) => field.handleChange(e.target.value)}
                                        className="w-full text-sm border border-gray-300 rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                                    />
                                </div>
                            )}
                        </form.Field>

                        <form.Field name="commentText">
                            {(field) => (
                                <div className="space-y-1.5">
                                    <label htmlFor={field.name} className="text-sm font-medium text-gray-700">Description</label>
                                    <textarea
                                        id={field.name}
                                        placeholder="Describe the issue..."
                                        rows={6}
                                        value={field.state.value}
                                        onChange={(e) => field.handleChange(e.target.value)}
                                        className="w-full text-sm border border-gray-300 rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary resize-none"
                                    />
                                </div>
                            )}
                        </form.Field>

                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-gray-700">System Down Since <span className="text-gray-400 font-normal">(optional)</span></label>
                            <div className="grid grid-cols-2 gap-2">
                                <form.Field name="downtimeDate">
                                    {(field) => (
                                        <input
                                            id={field.name}
                                            type="date"
                                            value={field.state.value}
                                            onChange={(e) => field.handleChange(e.target.value)}
                                            className="w-full text-sm border border-gray-300 rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                                        />
                                    )}
                                </form.Field>
                                <form.Field name="downtimeTime">
                                    {(field) => (
                                        <input
                                            id={field.name}
                                            type="time"
                                            step={60}
                                            value={field.state.value}
                                            onChange={(e) => handleTimeChangeAndClose(e, field.handleChange)}
                                            className="w-full text-sm border border-gray-300 rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                                        />
                                    )}
                                </form.Field>
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-gray-700">System Restored At <span className="text-gray-400 font-normal">(optional)</span></label>
                            <div className="grid grid-cols-2 gap-2">
                                <form.Field name="downtimeEndDate">
                                    {(field) => (
                                        <input
                                            id={field.name}
                                            type="date"
                                            value={field.state.value}
                                            onChange={(e) => field.handleChange(e.target.value)}
                                            className="w-full text-sm border border-gray-300 rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                                        />
                                    )}
                                </form.Field>
                                <form.Field name="downtimeEndTime">
                                    {(field) => (
                                        <input
                                            id={field.name}
                                            type="time"
                                            step={60}
                                            value={field.state.value}
                                            onChange={(e) => handleTimeChangeAndClose(e, field.handleChange)}
                                            className="w-full text-sm border border-gray-300 rounded-md py-2 px-3 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                                        />
                                    )}
                                </form.Field>
                            </div>
                            <p className="text-xs text-gray-500">Dates default to today. Enter a time only if system downtime needs to be recorded.</p>
                        </div>

                        <DialogFooter className="pt-2">
                            <button
                                type="button"
                                onClick={() => onOpenChange(false)}
                                className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-md transition-colors"
                            >
                                Cancel
                            </button>
                            <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
                                {([canSubmit, isSubmitting]) => (
                                    <button
                                        type="submit"
                                        disabled={!canSubmit || isSubmitting as boolean}
                                        className="px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary-dark rounded-md shadow-sm disabled:opacity-50 transition-colors"
                                    >
                                        {isSubmitting ? 'Creating...' : 'Create Request'}
                                    </button>
                                )}
                            </form.Subscribe>
                        </DialogFooter>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    )
}
