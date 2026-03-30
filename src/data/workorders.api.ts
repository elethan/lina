import { authServerFn } from '../lib/server-utils'

async function getWorkOrderDbDeps() {
    const [dbMod, schemaMod, ormMod] = await Promise.all([
        import('../db/client'),
        import('../db/schema'),
        import('drizzle-orm'),
    ])

    const { db } = dbMod
    const {
        workOrders,

        workOrderParts,
        workOrderNotes,
        userRequests,
        assets,
        sites,
        systems,
        engineers,
        downtimeEvents,
    } = schemaMod
    const { eq, sql, inArray, desc, and, isNull, gte, lte } = ormMod

    return {
        db,
        workOrders,

        workOrderParts,
        workOrderNotes,
        userRequests,
        assets,
        sites,
        systems,
        engineers,
        downtimeEvents,
        eq,
        sql,
        inArray,
        desc,
        and,
        isNull,
        gte,
        lte,
    }
}

// ── Types ─────────────────────────────────────────────────────
export type WorkOrderRow = {
    id: number
    assetId: number | null
    systemId: number | null
    serialNumber: string | null
    siteName: string | null
    systemName: string | null
    description: string
    status: string
    createdAt: string | null
    startAt: string | null
    endAt: string | null
    requestCount: number
    engineerId: number | null
    engineerName: string | null
}

// ── Fetch all work orders ─────────────────────────────────────
export const fetchWorkOrders = authServerFn({ method: 'GET' })
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
    .handler(async ({ data }): Promise<WorkOrderRow[]> => {
        const { requireSessionUser } = await import('../lib/auth-guards.server')
        await requireSessionUser()
        const {
            db,
            workOrders,
            userRequests,
            assets,
            sites,
            systems,
            engineers,
            eq,
            sql,
            desc,
            and,
            gte,
            lte,
        } = await getWorkOrderDbDeps()

        const dateFromIso = data.dateFrom
            ? new Date(`${data.dateFrom}T00:00:00.000Z`).toISOString()
            : undefined
        const dateToIso = data.dateTo
            ? new Date(`${data.dateTo}T23:59:59.999Z`).toISOString()
            : undefined

        // Base WO data with joins
        let rowsQuery = db
            .select({
                id: workOrders.id,
                assetId: workOrders.assetId,
                systemId: workOrders.systemId,
                serialNumber: assets.serialNumber,
                siteName: sites.name,
                systemName: systems.name,
                description: workOrders.description,
                status: workOrders.status,
                createdAt: sql<string>`${workOrders.createdAt}`,
                startAt: sql<string>`${workOrders.startAt}`,
                endAt: sql<string>`${workOrders.endAt}`,
                engineerId: workOrders.engineerId,
                engineerFirstName: engineers.firstName,
                engineerLastName: engineers.lastName,
            })
            .from(workOrders)
            .leftJoin(assets, eq(workOrders.assetId, assets.id))
            .leftJoin(sites, eq(assets.siteId, sites.id))
            .leftJoin(systems, eq(workOrders.systemId, systems.id))
            .leftJoin(engineers, eq(workOrders.engineerId, engineers.id))

        if (dateFromIso && dateToIso) {
            rowsQuery = rowsQuery.where(and(gte(workOrders.createdAt, dateFromIso), lte(workOrders.createdAt, dateToIso)))
        } else if (dateFromIso) {
            rowsQuery = rowsQuery.where(gte(workOrders.createdAt, dateFromIso))
        } else if (dateToIso) {
            rowsQuery = rowsQuery.where(lte(workOrders.createdAt, dateToIso))
        }

        const rows = await rowsQuery.orderBy(desc(workOrders.startAt), desc(workOrders.id))

        // Fetch linked request counts
        const requestCounts = await db
            .select({
                woId: userRequests.woId,
                count: sql<number>`COUNT(*)`,
            })
            .from(userRequests)
            .where(sql`${userRequests.woId} IS NOT NULL`)
            .groupBy(userRequests.woId)

        const countMap = new Map(requestCounts.map((r) => [r.woId, r.count]))

        return rows.map((r) => ({
            id: r.id,
            assetId: r.assetId ?? null,
            systemId: r.systemId ?? null,
            serialNumber: r.serialNumber ?? null,
            siteName: r.siteName ?? null,
            systemName: r.systemName ?? null,
            description: r.description,
            status: r.status,
            createdAt: r.createdAt ?? null,
            startAt: r.startAt ?? null,
            endAt: r.endAt ?? null,
            requestCount: countMap.get(r.id) ?? 0,
            engineerId: r.engineerId ?? null,
            engineerName: r.engineerFirstName && r.engineerLastName
                ? `${r.engineerFirstName} ${r.engineerLastName}`
                : null,
        }))
    })

export const createWorkOrder = authServerFn({ method: 'POST' })
    .inputValidator((data: { requestIds: number[] }) => {
        if (!data.requestIds || data.requestIds.length === 0) {
            throw new Error('At least one request must be selected')
        }
        return data
    })
    .handler(async ({ data }) => {
        const {
            db,
            workOrders,
            userRequests,
            engineers,
            eq,
            inArray,
        } = await getWorkOrderDbDeps()
        const { requirePermission } = await import('../lib/auth-guards.server')

        const user = await requirePermission('workOrders', 'create')
        const { requestIds } = data

        // Fetch the selected requests to get asset/system info
        const requests = await db
            .select({
                id: userRequests.id,
                assetId: userRequests.assetId,
                systemId: userRequests.systemId,
                commentText: userRequests.commentText,
                downtimeStartAt: userRequests.downtimeStartAt,
            })
            .from(userRequests)
            .where(inArray(userRequests.id, requestIds))

        if (requests.length === 0) {
            throw new Error('No matching requests found')
        }

        // Use the first request's asset/system as the WO's asset/system
        const firstRequest = requests[0]
        const description = requests
            .map((r) => r.commentText)
            .join(' | ')

        const userStaff = await db
            .select({ id: engineers.id })
            .from(engineers)
            .where(eq(engineers.userId, user.id))
            .limit(1)
        const authorEngineerId = userStaff.length > 0 ? userStaff[0].id : null

        // Create the work order
        const [wo] = await db
            .insert(workOrders)
            .values({
                assetId: firstRequest.assetId,
                systemId: firstRequest.systemId,
                description,
                physicsHandOver: 'Pending',
                status: 'Open',
                engineerId: authorEngineerId,
                createdAt: new Date().toISOString(),
            })
            .returning({ id: workOrders.id })

        // Link all selected requests to the new WO and update their status to 'Active'
        await db
            .update(userRequests)
            .set({ status: 'Active', woId: wo.id })
            .where(inArray(userRequests.id, requestIds))

        // Auto-create downtime event if first request has downtimeStartAt
        if (firstRequest.downtimeStartAt && firstRequest.assetId && firstRequest.systemId) {
            const { downtimeEvents } = await getWorkOrderDbDeps()
            await db.insert(downtimeEvents).values({
                assetId: firstRequest.assetId,
                systemId: firstRequest.systemId,
                woId: wo.id,
                startAt: firstRequest.downtimeStartAt,
            })
        }

        const { logger } = await import('../lib/logger')
        logger.info('WORK_ORDER_CREATED', { woId: wo.id, userId: user.id, requestIds })
        return { woId: wo.id }
    })

export const fetchOpenWorkOrdersByAsset = authServerFn({ method: 'GET' })
    .inputValidator((data: { assetId: number }) => {
        if (!data.assetId) throw new Error('Asset ID is required')
        return data
    })
    .handler(async ({ data }) => {
        const { requireSessionUser } = await import('../lib/auth-guards.server')
        await requireSessionUser()
        const { db, workOrders, systems, eq, and, sql, desc, inArray, gte } = await getWorkOrderDbDeps()
        const sixMonthsAgo = new Date()
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
        const sixMonthsAgoIso = sixMonthsAgo.toISOString()

        const rows = await db
            .select({
                id: workOrders.id,
                description: workOrders.description,
                createdAt: sql<string>`${workOrders.createdAt}`,
                systemName: systems.name,
            })
            .from(workOrders)
            .leftJoin(systems, eq(workOrders.systemId, systems.id))
            .where(
                and(
                    eq(workOrders.assetId, data.assetId),
                    inArray(workOrders.status, ['Open', 'Active']),
                    gte(workOrders.createdAt, sixMonthsAgoIso)
                )
            )
            .orderBy(desc(workOrders.createdAt))

        return rows
    })

export const mergeRequestsToWo = authServerFn({ method: 'POST' })
    .inputValidator((data: { requestIds: number[]; woId: number }) => {
        if (!data.requestIds || data.requestIds.length === 0) throw new Error('At least one request must be selected')
        if (!data.woId) throw new Error('Work Order ID is required')
        return data
    })
    .handler(async ({ data }) => {
        const { db, userRequests, inArray } = await getWorkOrderDbDeps()
        const { requirePermission } = await import('../lib/auth-guards.server')

        const user = await requirePermission('workOrders', 'update')
        const { requestIds, woId } = data

        await db.update(userRequests)
            .set({ status: 'Active', woId: woId })
            .where(inArray(userRequests.id, requestIds))

        const { logger } = await import('../lib/logger')
        logger.info('REQUESTS_MERGED_TO_WO', { woId, userId: user.id, requestIds })
        return { success: true }
    })

export const deleteWorkOrders = authServerFn({ method: 'POST' })
    .inputValidator((data: { woIds: number[]; requestAction: 'delete' | 'keep' }) => {
        if (!data.woIds || data.woIds.length === 0) {
            throw new Error('At least one Work Order must be selected')
        }
        return data
    })
    .handler(async ({ data }) => {
        const {
            db,
            workOrders,
            workOrderParts,
            workOrderNotes,
            userRequests,
            inArray,
        } = await getWorkOrderDbDeps()
        const { requirePermission } = await import('../lib/auth-guards.server')

        const user = await requirePermission('workOrders', 'delete')
        const { woIds, requestAction } = data

        // 1. Find all associated requests
        const linkedRequests = await db
            .select({ requestId: userRequests.id })
            .from(userRequests)
            .where(inArray(userRequests.woId, woIds))

        const requestIds = linkedRequests.map((r) => r.requestId).filter((id): id is number => id !== null)

        // 2. Handle the requests based on user choice
        if (requestIds.length > 0) {
            if (requestAction === 'delete') {
                await db.delete(userRequests).where(inArray(userRequests.id, requestIds))
            } else if (requestAction === 'keep') {
                await db
                    .update(userRequests)
                    .set({ status: 'Open', woId: null })
                    .where(inArray(userRequests.id, requestIds))
            }
        }

        // 3. Clean up associated junction tables and notes
        await db.delete(workOrderParts).where(inArray(workOrderParts.woId, woIds))
        await db.delete(workOrderNotes).where(inArray(workOrderNotes.woId, woIds))

        // 4. Finally, delete the work orders
        await db.delete(workOrders).where(inArray(workOrders.id, woIds))
        const { logger } = await import('../lib/logger')
        logger.info('WORK_ORDER_DELETED', { woIds, userId: user.id, requestAction })
        return { success: true }
    })

// ── Work Order Notes ──────────────────────────────────────────

export const fetchWorkOrderNotes = authServerFn({ method: 'GET' })
    .inputValidator((data: { woId: number }) => {
        if (!data.woId) throw new Error('Work Order ID is required')
        return data
    })
    .handler(async ({ data }) => {
        const { requireSessionUser } = await import('../lib/auth-guards.server')
        await requireSessionUser()
        const { db, workOrderNotes, engineers, eq, sql, desc } = await getWorkOrderDbDeps()

        return await db
            .select({
                id: workOrderNotes.id,
                woId: workOrderNotes.woId,
                engineerId: workOrderNotes.engineerId,
                engineerName: sql<string>`${engineers.firstName} || ' ' || ${engineers.lastName}`,
                noteText: workOrderNotes.noteText,
                createdAt: sql<string>`${workOrderNotes.createdAt}`,
            })
            .from(workOrderNotes)
            .leftJoin(engineers, eq(workOrderNotes.engineerId, engineers.id))
            .where(eq(workOrderNotes.woId, data.woId))
            .orderBy(desc(workOrderNotes.id))
    })

export const addWorkOrderNote = authServerFn({ method: 'POST' })
    .inputValidator((data: { woId: number; engineerId?: number; noteText: string }) => {
        if (!data.woId || !data.noteText) throw new Error('Missing required fields for note')
        return data
    })
    .handler(async ({ data }) => {
        const { db, workOrderNotes } = await getWorkOrderDbDeps()
        const { requirePermission } = await import('../lib/auth-guards.server')

        await requirePermission('workOrders', 'update')
        const result = await db.insert(workOrderNotes).values({
            woId: data.woId,
            engineerId: data.engineerId,
            noteText: data.noteText,
        }).returning({ id: workOrderNotes.id })

        return result[0]
    })

export const startWorkOrder = authServerFn({ method: 'POST' })
    .inputValidator((data: { woId: number }) => {
        if (!data.woId) throw new Error('Work Order ID is required')
        return data
    })
    .handler(async ({ data }) => {
        const { db, workOrders, eq, sql } = await getWorkOrderDbDeps()
        const { requirePermission } = await import('../lib/auth-guards.server')

        await requirePermission('workOrders', 'update')
        await db.update(workOrders)
            .set({ startAt: sql`CURRENT_TIMESTAMP` })
            .where(eq(workOrders.id, data.woId))

        return { startAt: new Date().toISOString() }
    })

export const closeWorkOrder = authServerFn({ method: 'POST' })
    .inputValidator((data: { woId: number }) => {
        if (!data.woId) throw new Error('Work Order ID is required')
        return data
    })
    .handler(async ({ data }) => {
        const {
            db,
            workOrders,
            userRequests,
            eq,
            sql,
            inArray,
        } = await getWorkOrderDbDeps()
        const { requirePermission } = await import('../lib/auth-guards.server')

        const user = await requirePermission('workOrders', 'update')
        // Check for open downtime events (endAt is null) — block close if any exist
        const { downtimeEvents, and, isNull } = await getWorkOrderDbDeps()
        const openDowntime = await db
            .select({ id: downtimeEvents.id })
            .from(downtimeEvents)
            .where(and(eq(downtimeEvents.woId, data.woId), isNull(downtimeEvents.endAt)))

        if (openDowntime.length > 0) {
            throw new Error('Cannot close: record downtime end time first')
        }

        // 1. Update WO status and end date
        await db.update(workOrders)
            .set({
                status: 'Closed',
                endAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(eq(workOrders.id, data.woId))

        // 2. Cascade "Closed" status to linked User Requests
        const linked = await db
            .select({ requestId: userRequests.id })
            .from(userRequests)
            .where(eq(userRequests.woId, data.woId))

        const requestIds = linked.map(l => l.requestId).filter(Boolean) as number[]
        if (requestIds.length > 0) {
            await db
                .update(userRequests)
                .set({ status: 'Closed' })
                .where(inArray(userRequests.id, requestIds))
        }

        const { logger } = await import('../lib/logger')
        logger.info('WORK_ORDER_CLOSED', { woId: data.woId, userId: user.id })
        return { success: true, endAt: new Date().toISOString() }
    })

export const updateWorkOrderNote = authServerFn({ method: 'POST' })
    .inputValidator((data: { noteId: number; noteText: string }) => {
        if (!data.noteId || !data.noteText) throw new Error('Note ID and text are required')
        return data
    })
    .handler(async ({ data }) => {
        const { db, workOrderNotes, eq } = await getWorkOrderDbDeps()
        const { requirePermission } = await import('../lib/auth-guards.server')

        await requirePermission('workOrders', 'update')
        await db.update(workOrderNotes)
            .set({ noteText: data.noteText })
            .where(eq(workOrderNotes.id, data.noteId))

        return { success: true }
    })

// ── Downtime Events ───────────────────────────────────────────

export type DowntimeEventRow = {
    id: number
    assetId: number
    systemId: number
    woId: number | null
    startAt: string
    endAt: string | null
    notes: string | null
}

export const fetchDowntimeByWoId = authServerFn({ method: 'GET' })
    .inputValidator((data: { woId: number }) => {
        if (!data.woId) throw new Error('Work Order ID is required')
        return data
    })
    .handler(async ({ data }): Promise<DowntimeEventRow[]> => {
        const { requireSessionUser } = await import('../lib/auth-guards.server')
        await requireSessionUser()
        const { db, downtimeEvents, eq, sql } = await getWorkOrderDbDeps()

        return await db
            .select({
                id: downtimeEvents.id,
                assetId: downtimeEvents.assetId,
                systemId: downtimeEvents.systemId,
                woId: downtimeEvents.woId,
                startAt: sql<string>`${downtimeEvents.startAt}`,
                endAt: sql<string>`${downtimeEvents.endAt}`,
                notes: downtimeEvents.notes,
            })
            .from(downtimeEvents)
            .where(eq(downtimeEvents.woId, data.woId))
    })

export const createDowntimeEvent = authServerFn({ method: 'POST' })
    .inputValidator((data: { assetId: number; systemId: number; woId: number; startAt: string; endAt?: string; notes?: string }) => {
        if (!data.assetId || !data.systemId || !data.woId || !data.startAt) throw new Error('Asset, system, work order, and start time are required')
        return data
    })
    .handler(async ({ data }) => {
        const { db, downtimeEvents } = await getWorkOrderDbDeps()
        const { requirePermission } = await import('../lib/auth-guards.server')

        await requirePermission('workOrders', 'update')
        const result = await db.insert(downtimeEvents).values({
            assetId: data.assetId,
            systemId: data.systemId,
            woId: data.woId,
            startAt: data.startAt,
            endAt: data.endAt,
            notes: data.notes,
        }).returning({ id: downtimeEvents.id })

        return result[0]
    })

export const updateDowntimeEvent = authServerFn({ method: 'POST' })
    .inputValidator((data: { id: number; endAt?: string; notes?: string }) => {
        if (!data.id) throw new Error('Downtime event ID is required')
        return data
    })
    .handler(async ({ data }) => {
        const { db, downtimeEvents, eq } = await getWorkOrderDbDeps()
        const { requirePermission } = await import('../lib/auth-guards.server')

        await requirePermission('workOrders', 'update')
        await db.update(downtimeEvents)
            .set({
                ...(data.endAt !== undefined ? { endAt: data.endAt } : {}),
                ...(data.notes !== undefined ? { notes: data.notes } : {}),
            })
            .where(eq(downtimeEvents.id, data.id))

        return { success: true }
    })
