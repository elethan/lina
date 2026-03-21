import { authServerFn } from '../lib/server-utils'

async function getRequestDbDeps() {
    const [dbMod, schemaMod, ormMod] = await Promise.all([
        import('../db/client'),
        import('../db/schema'),
        import('drizzle-orm'),
    ])

    const { db } = dbMod
    const { userRequests, assets, sites, systems, engineers, workOrders, workOrderRequests, downtimeEvents } = schemaMod
    const { eq, sql, desc, inArray, and, ne, isNull } = ormMod

    return {
        db,
        userRequests,
        assets,
        sites,
        systems,
        engineers,
        workOrders,
        workOrderRequests,
        downtimeEvents,
        eq,
        sql,
        desc,
        inArray,
        and,
        ne,
        isNull,
    }
}

export type RequestRow = {
    id: number
    assetId: number | null
    serialNumber: string | null
    siteId: number | null
    siteName: string | null
    systemName: string | null
    reportedBy: string
    commentText: string
    status: string
    engineerId: number | null
    engineerName: string | null
    createdAt: string | null
}

export const fetchRequests = authServerFn({ method: 'GET' }).handler(
    async (): Promise<RequestRow[]> => {
        const { requireSessionUser } = await import('../lib/auth-guards.server')
        await requireSessionUser()
        const { db, userRequests, assets, sites, systems, engineers, eq, sql, desc } = await getRequestDbDeps()

        const rows = await db
            .select({
                id: userRequests.id,
                assetId: userRequests.assetId,
                serialNumber: assets.serialNumber,
                siteId: sites.id,
                siteName: sites.name,
                systemName: systems.name,
                systemId: userRequests.systemId,
                engineerId: userRequests.engineerId,
                reportedBy: userRequests.reportedBy,
                commentText: userRequests.commentText,
                status: userRequests.status,
                engineerFirstName: engineers.firstName,
                engineerLastName: engineers.lastName,
                createdAt: sql<string>`${userRequests.createdAt}`,
            })
            .from(userRequests)
            .leftJoin(assets, eq(userRequests.assetId, assets.id))
            .leftJoin(sites, eq(assets.siteId, sites.id))
            .leftJoin(systems, eq(userRequests.systemId, systems.id))
            .leftJoin(engineers, eq(userRequests.engineerId, engineers.id))
            .where(sql`${userRequests.createdAt} >= datetime('now', '-6 months')`)
            .orderBy(desc(userRequests.createdAt))

        return rows.map((r) => ({
            id: r.id,
            assetId: r.assetId ?? null,
            serialNumber: r.serialNumber ?? null,
            siteId: r.siteId ?? null,
            siteName: r.siteName ?? null,
            systemName: r.systemName ?? null,
            reportedBy: r.reportedBy,
            commentText: r.commentText,
            status: r.status,
            engineerId: r.engineerId ?? null,
            engineerName:
                r.engineerFirstName && r.engineerLastName
                    ? `${r.engineerFirstName} ${r.engineerLastName}`
                    : null,
            createdAt: r.createdAt ?? null,
        }))
    },
)

export const deleteRequests = authServerFn({ method: 'POST' })
    .inputValidator((data: { requestIds: number[] }) => {
        if (!data.requestIds || data.requestIds.length === 0) {
            throw new Error('At least one request must be selected')
        }
        return data
    })
    .handler(async ({ data }) => {
        const { db, userRequests, inArray } = await getRequestDbDeps()
        const { requirePermission } = await import('../lib/auth-guards.server')

        const user = await requirePermission('requests', 'delete')
        const { requestIds } = data

        await db.delete(userRequests).where(inArray(userRequests.id, requestIds))
        const { logger } = await import('../lib/logger')
        logger.info('REQUEST_DELETED', { requestIds, userId: user.id, count: requestIds.length })
        return { success: true }
    })

export const createRequest = authServerFn({ method: 'POST' })
    .inputValidator((data: {
        assetId?: number,
        systemId?: number,
        reportedBy: string,
        commentText: string,
        downtimeStartAt?: string,
    }) => {
        if (!data.reportedBy || !data.commentText) throw new Error('Missing required fields')
        return data
    })
    .handler(async ({ data }): Promise<{ id: number; linkedWoId?: number; woIsNew?: boolean }> => {
        const {
            db, userRequests, workOrders, workOrderRequests, downtimeEvents,
            eq, and, ne, isNull,
        } = await getRequestDbDeps()
        const { requirePermission } = await import('../lib/auth-guards.server')

        const user = await requirePermission('requests', 'create')

        // Insert the request
        const [request] = await db.insert(userRequests).values({
            assetId: data.assetId,
            systemId: data.systemId,
            reportedBy: data.reportedBy,
            commentText: data.commentText,
            downtimeStartAt: data.downtimeStartAt,
            status: 'Open',
        }).returning({ id: userRequests.id })

        const { logger } = await import('../lib/logger')
        logger.info('REQUEST_CREATED', { requestId: request.id, userId: user.id, assetId: data.assetId ?? null })

        // Auto-WO workflow: only when downtime + asset + system are all present
        if (data.downtimeStartAt && data.assetId && data.systemId) {
            // Look for an existing open WO for the same asset + system
            const existingWos = await db
                .select({ id: workOrders.id })
                .from(workOrders)
                .where(and(
                    eq(workOrders.assetId, data.assetId),
                    eq(workOrders.systemId, data.systemId),
                    ne(workOrders.status, 'Closed'),
                ))
                .limit(1)

            let woId: number
            let woIsNew: boolean

            if (existingWos.length > 0) {
                // Reuse the existing open WO
                woId = existingWos[0].id
                woIsNew = false

                // Link request to WO
                await db.insert(workOrderRequests).values({ woId, requestId: request.id })

                // Only create a downtime event if there is not already an open one for this WO
                const openDowntime = await db
                    .select({ id: downtimeEvents.id })
                    .from(downtimeEvents)
                    .where(and(
                        eq(downtimeEvents.woId, woId),
                        isNull(downtimeEvents.endAt),
                    ))
                    .limit(1)

                if (openDowntime.length === 0) {
                    await db.insert(downtimeEvents).values({
                        assetId: data.assetId,
                        systemId: data.systemId,
                        woId,
                        startAt: data.downtimeStartAt,
                    })
                }
            } else {
                // Create a new WO
                const [wo] = await db.insert(workOrders).values({
                    assetId: data.assetId,
                    systemId: data.systemId,
                    description: data.commentText,
                    physicsHandOver: 'Pending',
                    status: 'Open',
                    createdAt: new Date().toISOString(),
                }).returning({ id: workOrders.id })

                woId = wo.id
                woIsNew = true

                // Link request to new WO
                await db.insert(workOrderRequests).values({ woId, requestId: request.id })

                // Create downtime event linked to new WO
                await db.insert(downtimeEvents).values({
                    assetId: data.assetId,
                    systemId: data.systemId,
                    woId,
                    startAt: data.downtimeStartAt,
                })
            }

            // Mark request Active (it now belongs to a WO)
            await db.update(userRequests)
                .set({ status: 'Active' })
                .where(eq(userRequests.id, request.id))

            return { id: request.id, linkedWoId: woId, woIsNew }
        }

        return { id: request.id }
    })
