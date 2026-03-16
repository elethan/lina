import { authServerFn, requireRole } from '../lib/server-utils'
import { db } from '../db/client'
import { engineers, userRequests } from '../db/schema'
import { inArray } from 'drizzle-orm'

export type EngineerOption = {
    id: number
    name: string
}

export const fetchEngineers = authServerFn({ method: 'GET' }).handler(
    async (): Promise<EngineerOption[]> => {
        const rows = await db
            .select({
                id: engineers.id,
                firstName: engineers.firstName,
                lastName: engineers.lastName,
            })
            .from(engineers)
            .groupBy(engineers.firstName, engineers.lastName)

        return rows.map((r) => ({
            id: r.id,
            name: `${r.firstName} ${r.lastName}`,
        }))
    },
)

export const assignRequestsToEngineer = authServerFn({ method: 'POST' })
    .inputValidator((data: { requestIds: number[]; engineerId: number }) => {
        if (!data.requestIds || data.requestIds.length === 0) {
            throw new Error('At least one request must be selected')
        }
        if (!data.engineerId) {
            throw new Error('An engineer must be selected')
        }
        return data
    })
    .handler(async ({ data, context }) => {
        await requireRole(context, 'admin', 'engineer')
        const { requestIds, engineerId } = data

        await db
            .update(userRequests)
            .set({ engineerId })
            .where(inArray(userRequests.id, requestIds))

        return { success: true, assignedCount: requestIds.length }
    })
