import { authServerFn } from '../lib/server-utils'

type ActorMeta = {
    id: string
    email?: string | null
    role?: string | null
}

function withActor(user: ActorMeta) {
    return {
        actorUserId: user.id,
        actorEmail: user.email ?? null,
        actorRole: user.role ?? null,
    }
}

async function getRequestDbDeps() {
    const [dbMod, schemaMod, ormMod] = await Promise.all([
        import('../db/client'),
        import('../db/schema'),
        import('drizzle-orm'),
    ])

    const { db } = dbMod
    const { userRequests, assets, sites, systems, engineers, workOrders, downtimeEvents } = schemaMod
    const { eq, sql, desc, inArray, and, ne, isNull, gte, lte } = ormMod

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
        gte,
        lte,
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

export const fetchRequests = authServerFn({ method: 'GET' })
    .inputValidator((data: { dateFrom?: string; dateTo?: string }) => {
        if (data.dateFrom) {
            const parsedFrom = new Date(data.dateFrom)
            if (Number.isNaN(parsedFrom.getTime())) {
                throw new Error('Invalid dateFrom value')
            }
        }

        if (data.dateTo) {
            const parsedTo = new Date(data.dateTo)
            if (Number.isNaN(parsedTo.getTime())) {
                throw new Error('Invalid dateTo value')
            }
        }

        return data
    })
    .handler(async ({ data }): Promise<RequestRow[]> => {
        const { requireSessionUser } = await import('../lib/auth-guards.server')
        await requireSessionUser()
        const { db, userRequests, assets, sites, systems, eq, sql, desc, and, gte, lte } = await getRequestDbDeps()

        const dateFromIso = data.dateFrom
            ? new Date(`${data.dateFrom}T00:00:00.000Z`).toISOString()
            : undefined
        const dateToIso = data.dateTo
            ? new Date(`${data.dateTo}T23:59:59.999Z`).toISOString()
            : undefined

        let rowsQuery = db
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

        if (dateFromIso && dateToIso) {
            rowsQuery = rowsQuery.where(and(gte(userRequests.createdAt, dateFromIso), lte(userRequests.createdAt, dateToIso)))
        } else if (dateFromIso) {
            rowsQuery = rowsQuery.where(gte(userRequests.createdAt, dateFromIso))
        } else if (dateToIso) {
            rowsQuery = rowsQuery.where(lte(userRequests.createdAt, dateToIso))
        }

        const rows = await rowsQuery.orderBy(desc(userRequests.createdAt))

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
    })

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
            logger.info('REQUEST_CLOSED_WITH_COMMENT', {
                requestIds,
                count: requestIds.length,
                ...withActor(user),
            })
        } else {
            await db.delete(userRequests).where(inArray(userRequests.id, requestIds))
            logger.info('REQUEST_DELETED', {
                requestIds,
                count: requestIds.length,
                ...withActor(user),
            })
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
            eq,
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
        logger.info('REQUEST_CREATED', {
            requestId: request.id,
            assetId: data.assetId ?? null,
            systemId: data.systemId ?? null,
            ...withActor(user),
        })

        const { canRole } = await import('../lib/role-permissions')
        const canCreateWorkOrders = canRole((user.role ?? 'therapist') as any, 'workOrders', 'create')

        // Auto-WO workflow: only when downtime + asset + system are all present
        if (data.downtimeStartAt && data.assetId && data.systemId && canCreateWorkOrders) {
            // Create a new WO
            const [wo] = await db.insert(workOrders).values({
                assetId: data.assetId,
                systemId: data.systemId,
                description: data.commentText,
                physicsHandOver: 'Pending',
                status: 'Open',
                createdAt: new Date().toISOString(),
            }).returning({ id: workOrders.id })

            const woId = wo.id
            const woIsNew = true

            logger.info('WORK_ORDER_CREATED_FROM_REQUEST', {
                woId,
                requestId: request.id,
                assetId: data.assetId,
                systemId: data.systemId,
                ...withActor(user),
            })

            // Create downtime event linked to new WO
            await db.insert(downtimeEvents).values({
                assetId: data.assetId,
                systemId: data.systemId,
                woId,
                startAt: data.downtimeStartAt,
                endAt: data.downtimeEndAt,
            })

            // Mark request Active (it now belongs to a WO)
            await db.update(userRequests)
                .set({ status: 'Active', woId: woId })
                .where(eq(userRequests.id, request.id))

            logger.info('REQUEST_LINKED_TO_WORK_ORDER', {
                requestId: request.id,
                woId,
                ...withActor(user),
            })

            return { id: request.id, linkedWoId: woId, woIsNew }
        }

        if (data.downtimeStartAt && data.assetId && data.systemId && !canCreateWorkOrders) {
            logger.info('REQUEST_AUTO_WO_SKIPPED_MISSING_PERMISSION', {
                requestId: request.id,
                assetId: data.assetId,
                systemId: data.systemId,
                requiredPermission: 'workOrders.create',
                ...withActor(user),
            })
        }

        return { id: request.id }
    })
