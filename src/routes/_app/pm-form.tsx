import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { savePm, fetchPmById, fetchPmFormOptions } from '../../data/pm.api'

type PmFormSearch = {
    pmId?: number
    returnSearch?: string
    returnDateFrom?: string
    returnDateTo?: string
    returnCompletionState?: 'nonCompleted' | 'completed' | 'all'
}

export const Route = createFileRoute('/_app/pm-form')({
    validateSearch: (search: Record<string, unknown>): PmFormSearch => ({
        pmId: search.pmId ? Number(search.pmId) : undefined,
        returnSearch: typeof search.returnSearch === 'string' ? search.returnSearch : undefined,
        returnDateFrom: typeof search.returnDateFrom === 'string' ? search.returnDateFrom : undefined,
        returnDateTo: typeof search.returnDateTo === 'string' ? search.returnDateTo : undefined,
        returnCompletionState:
            search.returnCompletionState === 'completed' ||
            search.returnCompletionState === 'all' ||
            search.returnCompletionState === 'nonCompleted'
                ? search.returnCompletionState
                : undefined,
    }),
    beforeLoad: ({ context }) => {
        const user = (context as any).user
        const role = user?.role as string | undefined
        if (!role) {
            throw redirect({ to: '/login' })
        }
        if (!['admin', 'engineer'].includes(role)) {
            throw redirect({ to: '/' })
        }
    },
    loaderDeps: ({ search }) => ({
        pmId: search.pmId,
        returnSearch: search.returnSearch,
        returnDateFrom: search.returnDateFrom,
        returnDateTo: search.returnDateTo,
        returnCompletionState: search.returnCompletionState,
    }),
    loader: async ({ deps }) => {
        const [options, pm] = await Promise.all([
            fetchPmFormOptions(),
            deps.pmId ? fetchPmById({ data: { pmId: deps.pmId } }) : Promise.resolve(null),
        ])

        return { options, pm }
    },
    component: PmFormPage,
})

function toDateInputValue(raw: string): string {
    const parsed = new Date(raw)
    if (Number.isNaN(parsed.getTime())) return ''
    const year = parsed.getFullYear()
    const month = String(parsed.getMonth() + 1).padStart(2, '0')
    const day = String(parsed.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

function PmFormPage() {
    const navigate = useNavigate()
    const search = Route.useSearch()
    const { options, pm } = Route.useLoaderData()

    const [assetId, setAssetId] = useState<number | ''>(pm?.assetId ?? '')
    const [systemId, setSystemId] = useState<number | ''>(pm?.systemId ?? '')
    const [intervalMonths, setIntervalMonths] = useState<number | ''>(pm?.intervalMonths ?? '')
    const [startAt, setStartAt] = useState<string>(pm?.startAt ? toDateInputValue(pm.startAt) : '')
    const [engineerId, setEngineerId] = useState<number | ''>(pm?.engineerId ?? '')
    const [formError, setFormError] = useState<string | null>(null)

    const isEditing = !!pm

    const returnToPmList = () => {
        navigate({
            to: '/pm',
            search: {
                search: search.returnSearch || undefined,
                dateFrom: search.returnDateFrom || undefined,
                dateTo: search.returnDateTo || undefined,
                completionState: search.returnCompletionState || 'nonCompleted',
            },
        })
    }

    const isValid = useMemo(
        () => !!assetId && !!systemId && !!intervalMonths && !!startAt,
        [assetId, systemId, intervalMonths, startAt],
    )

    const { mutate: mutateSave, isPending } = useMutation({
        mutationFn: async () => {
            if (!assetId || !systemId || !intervalMonths || !startAt) {
                throw new Error('Please complete all required fields')
            }

            return savePm({
                data: {
                    pmId: pm?.id,
                    assetId,
                    systemId,
                    intervalMonths,
                    startAt,
                    engineerId: engineerId || null,
                },
            })
        },
        onSuccess: () => {
            returnToPmList()
        },
        onError: (error) => {
            setFormError(error instanceof Error ? error.message : 'Unable to save PM')
        },
    })

    return (
        <div className="flex-1 overflow-auto px-6 py-4">
            <div className="mx-auto max-w-3xl bg-white border border-gray-200 rounded-xl shadow-sm p-6">
                <h2 className="text-xl font-semibold text-gray-900">
                    {isEditing ? 'Edit PM' : 'New PM'}
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                    Configure PM header details. Task execution and completion remain in the PM procedure view.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                    <div className="space-y-1.5">
                        <label htmlFor="pm-form-asset" className="text-sm font-medium text-gray-700">Asset *</label>
                        <select
                            id="pm-form-asset"
                            value={assetId}
                            onChange={(e) => setAssetId(e.target.value ? Number(e.target.value) : '')}
                            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
                        >
                            <option value="">Select asset</option>
                            {options.assets.map((asset) => (
                                <option key={asset.id} value={asset.id}>{asset.label}</option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-1.5">
                        <label htmlFor="pm-form-system" className="text-sm font-medium text-gray-700">System *</label>
                        <select
                            id="pm-form-system"
                            value={systemId}
                            onChange={(e) => setSystemId(e.target.value ? Number(e.target.value) : '')}
                            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
                        >
                            <option value="">Select system</option>
                            {options.systems.map((system) => (
                                <option key={system.id} value={system.id}>{system.label}</option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-1.5">
                        <label htmlFor="pm-form-interval" className="text-sm font-medium text-gray-700">Interval (months) *</label>
                        <input
                            id="pm-form-interval"
                            type="number"
                            min={1}
                            value={intervalMonths}
                            onChange={(e) => setIntervalMonths(e.target.value ? Number(e.target.value) : '')}
                            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label htmlFor="pm-form-start" className="text-sm font-medium text-gray-700">Start date *</label>
                        <input
                            id="pm-form-start"
                            type="date"
                            value={startAt}
                            onChange={(e) => setStartAt(e.target.value)}
                            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
                        />
                    </div>

                    <div className="space-y-1.5 md:col-span-2">
                        <label htmlFor="pm-form-engineer" className="text-sm font-medium text-gray-700">Engineer</label>
                        <select
                            id="pm-form-engineer"
                            value={engineerId}
                            onChange={(e) => setEngineerId(e.target.value ? Number(e.target.value) : '')}
                            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
                        >
                            <option value="">Unassigned</option>
                            {options.engineers.map((eng) => (
                                <option key={eng.id} value={eng.id}>{eng.label}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {formError && <p className="text-sm text-red-600 mt-4">{formError}</p>}

                <div className="mt-8 flex items-center justify-end gap-2">
                    <button
                        onClick={returnToPmList}
                        className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => mutateSave()}
                        disabled={!isValid || isPending}
                        className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                        {isPending ? 'Saving...' : 'Save'}
                    </button>
                </div>
            </div>
        </div>
    )
}
