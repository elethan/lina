import { authServerFn } from '../lib/server-utils'

async function getEngineerDbDeps() {
    const [dbMod, schemaMod, ormMod] = await Promise.all([
        import('../db/client'),
        import('../db/schema'),
        import('drizzle-orm'),
    ])

    const { db } = dbMod
    const { engineers, workOrders } = schemaMod
    const { inArray } = ormMod

    return { db, engineers, workOrders, inArray }
}

export type EngineerOption = {
    id: number
    name: string
}

export const fetchEngineers = authServerFn({ method: 'GET' }).handler(
    async (): Promise<EngineerOption[]> => {
        const { requireSessionUser } = await import('../lib/auth-guards.server')
        await requireSessionUser()
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

export const assignWorkOrdersToEngineer = authServerFn({ method: 'POST' })
    .inputValidator((data: { woIds: number[]; engineerId: number }) => {
        if (!data.woIds || data.woIds.length === 0) {
            throw new Error('At least one work order must be selected')
        }
        if (!data.engineerId) {
            throw new Error('An engineer must be selected')
        }
        return data
    })
    .handler(async ({ data }) => {
        const { db, workOrders, inArray } = await getEngineerDbDeps()
        const { requirePermission } = await import('../lib/auth-guards.server')

        await requirePermission('workOrders', 'update')
        const { woIds, engineerId } = data

        await db
            .update(workOrders)
            .set({ engineerId })
            .where(inArray(workOrders.id, woIds))

        return { success: true, assignedCount: woIds.length }
    })
