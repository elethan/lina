import { authServerFn } from '../lib/server-utils'

async function getRequestDbDeps() {
    const [dbMod, schemaMod, ormMod] = await Promise.all([
        import('../db/client'),
        import('../db/schema'),
        import('drizzle-orm'),
    ])

    const { db } = dbMod
    const { userRequests, assets, sites, systems, engineers, workOrders, downtimeEvents } = schemaMod
    const { eq, sql, desc, inArray, and, ne, isNull } = ormMod

    return {
        db,
        userRequests,
        assets,
        sites,
        systems,
        engineers,
        workOrders,
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
    engineerComment: string | null
    status: string
    createdAt: string | null
    downtimeStartAt: string | null
    downtimeEndAt: string | null
    woId: number | null
}

export const fetchRequests = authServerFn({ method: 'GET' }).handler(
    async (): Promise<RequestRow[]> => {
        const { requireSessionUser } = await import('../lib/auth-guards.server')
        await requireSessionUser()
        const { db, userRequests, assets, sites, systems, eq, sql, desc } = await getRequestDbDeps()

        const rows = await db
            .select({
                id: userRequests.id,
                assetId: userRequests.assetId,
                serialNumber: assets.serialNumber,
                siteId: sites.id,
                siteName: sites.name,
                systemName: systems.name,
                systemId: userRequests.systemId,
                reportedBy: userRequests.reportedBy,
                commentText: userRequests.commentText,
                engineerComment: userRequests.engineerComment,
                status: userRequests.status,
                createdAt: sql<string>`${userRequests.createdAt}`,
                downtimeStartAt: sql<string>`${userRequests.downtimeStartAt}`,
                downtimeEndAt: sql<string>`${userRequests.downtimeEndAt}`,
                woId: userRequests.woId,
            })
            .from(userRequests)
            .leftJoin(assets, eq(userRequests.assetId, assets.id))
            .leftJoin(sites, eq(assets.siteId, sites.id))
            .leftJoin(systems, eq(userRequests.systemId, systems.id))
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
            engineerComment: r.engineerComment ?? null,
            status: r.status,
            createdAt: r.createdAt ?? null,
            downtimeStartAt: r.downtimeStartAt ?? null,
            downtimeEndAt: r.downtimeEndAt ?? null,
            woId: r.woId ?? null,
        }))
    },
)

export const deleteRequests = authServerFn({ method: 'POST' })
    .inputValidator((data: { requestIds: number[], engineerComment?: string }) => {
        if (!data.requestIds || data.requestIds.length === 0) {
            throw new Error('At least one request must be selected')
        }
        return data
    })
    .handler(async ({ data }) => {
        const { db, userRequests, inArray } = await getRequestDbDeps()
        const { requirePermission } = await import('../lib/auth-guards.server')

        const user = await requirePermission('requests', 'delete')
        const { requestIds, engineerComment } = data
        const { logger } = await import('../lib/logger')

        if (engineerComment && engineerComment.trim().length > 0) {
            await db.update(userRequests)
                .set({ status: 'Closed', engineerComment: engineerComment.trim() })
                .where(inArray(userRequests.id, requestIds))
            logger.info('REQUEST_CLOSED_WITH_COMMENT', { requestIds, userId: user.id, count: requestIds.length })
        } else {
            await db.delete(userRequests).where(inArray(userRequests.id, requestIds))
            logger.info('REQUEST_DELETED', { requestIds, userId: user.id, count: requestIds.length })
        }
        
        return { success: true }
    })

export const createRequest = authServerFn({ method: 'POST' })
    .inputValidator((data: {
        assetId?: number,
        systemId?: number,
        reportedBy: string,
        commentText: string,
        downtimeStartAt?: string,
        downtimeEndAt?: string,
    }) => {
        if (!data.reportedBy || !data.commentText) throw new Error('Missing required fields')
        return data
    })
    .handler(async ({ data }): Promise<{ id: number; linkedWoId?: number; woIsNew?: boolean }> => {
        const {
            db, userRequests, workOrders, downtimeEvents,
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
            downtimeEndAt: data.downtimeEndAt,
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
                        endAt: data.downtimeEndAt,
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

                // Create downtime event linked to new WO
                await db.insert(downtimeEvents).values({
                    assetId: data.assetId,
                    systemId: data.systemId,
                    woId,
                    startAt: data.downtimeStartAt,
                    endAt: data.downtimeEndAt,
                })
            }

            // Mark request Active (it now belongs to a WO)
            await db.update(userRequests)
                .set({ status: 'Active', woId: woId })
                .where(eq(userRequests.id, request.id))

            return { id: request.id, linkedWoId: woId, woIsNew }
        }

        return { id: request.id }
    })
