import { authServerFn } from '../lib/server-utils'

async function getEngineerDbDeps() {
    const [dbMod, schemaMod, ormMod] = await Promise.all([
        import('../db/client'),
        import('../db/schema'),
        import('drizzle-orm'),
    ])

    const { db } = dbMod
    const { engineers, userRequests } = schemaMod
    const { inArray } = ormMod

    return { db, engineers, userRequests, inArray }
}

export type EngineerOption = {
    id: number
    name: string
}

export const fetchEngineers = authServerFn({ method: 'GET' }).handler(
    async (): Promise<EngineerOption[]> => {
        const { db, engineers } = await getEngineerDbDeps()

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
        const { db, userRequests, inArray } = await getEngineerDbDeps()
        const { requirePermission } = await import('../lib/auth-guards.server')

        await requirePermission(context, 'requests', 'assign')
        const { requestIds, engineerId } = data

        await db
            .update(userRequests)
            .set({ engineerId })
            .where(inArray(userRequests.id, requestIds))

        return { success: true, assignedCount: requestIds.length }
    })
