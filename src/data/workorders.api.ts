import { authServerFn } from '../lib/server-utils'

type ActorMeta = {
    id: string
    name?: string | null
    email?: string | null
    role?: string | null
}

function withActor(user: ActorMeta) {
    return {
        actorUserId: user.id,
        actorName: user.name?.trim() || user.email || null,
        actorEmail: user.email ?? null,
        actorRole: user.role ?? null,
    }
}

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
        assetSystems,
        sites,
        systems,
        engineers,
        downtimeEvents,
    } = schemaMod
    const { eq, sql, inArray, desc, and, isNull, asc } = ormMod

    return {
        db,
        workOrders,

        workOrderParts,
        workOrderNotes,
        userRequests,
        assets,
        assetSystems,
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
        asc,
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

export type WorkOrderSystemOption = {
    systemId: number
    systemName: string
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
            rowsQuery = rowsQuery.where(sql`${workOrders.createdAt} >= ${dateFromIso} AND ${workOrders.createdAt} <= ${dateToIso}`)
        } else if (dateFromIso) {
            rowsQuery = rowsQuery.where(sql`${workOrders.createdAt} >= ${dateFromIso}`)
        } else if (dateToIso) {
            rowsQuery = rowsQuery.where(sql`${workOrders.createdAt} <= ${dateToIso}`)
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
    .inputValidator((data: { requestIds?: number[]; assetId?: number }) => {
        const requestIds = Array.isArray(data.requestIds)
            ? data.requestIds.filter((id): id is number => Number.isInteger(id) && id > 0)
            : []
        const assetId = Number.isInteger(data.assetId) && (data.assetId as number) > 0
            ? data.assetId
            : undefined

        if (requestIds.length === 0 && !assetId) {
            throw new Error('At least one request or a selected asset is required')
        }

        return {
            requestIds,
            assetId,
        }
    })
    .handler(async ({ data }) => {
        const {
            db,
            workOrders,
            userRequests,
            assets,
            assetSystems,
            systems,
            downtimeEvents,
            eq,
            inArray,
            and,
            asc,
        } = await getWorkOrderDbDeps()
        const { requirePermission } = await import('../lib/auth-guards.server')

        const user = await requirePermission('workOrders', 'create')
        const { requestIds } = data

        let workOrderAssetId: number | null = null
        let workOrderSystemId: number | null = null
        let description = ''
        let inheritedDowntimeStartAt: string | null = null
        let inheritedDowntimeEndAt: string | null = null

        if (requestIds.length > 0) {
            const requests = await db
                .select({
                    id: userRequests.id,
                    assetId: userRequests.assetId,
                    systemId: userRequests.systemId,
                    commentText: userRequests.commentText,
                    downtimeStartAt: userRequests.downtimeStartAt,
                    downtimeEndAt: userRequests.downtimeEndAt,
                })
                .from(userRequests)
                .where(inArray(userRequests.id, requestIds))

            if (requests.length === 0) {
                throw new Error('No matching requests found')
            }

            const firstRequest = requests[0]
            workOrderAssetId = firstRequest.assetId ?? null
            workOrderSystemId = firstRequest.systemId ?? null
            description = requests.map((r) => r.commentText).join(' | ')
            inheritedDowntimeStartAt = firstRequest.downtimeStartAt ?? null
            inheritedDowntimeEndAt = firstRequest.downtimeEndAt ?? null
        } else {
            const selectedAssetId = data.assetId
            if (!selectedAssetId) {
                throw new Error('Selected asset is required')
            }

            const [asset] = await db
                .select({
                    assetId: assets.id,
                    serialNumber: assets.serialNumber,
                })
                .from(assets)
                .where(eq(assets.id, selectedAssetId))
                .limit(1)

            if (!asset) {
                throw new Error('Selected asset not found')
            }

            const [resolvedSystem] = await db
                .select({ systemId: systems.id })
                .from(assetSystems)
                .innerJoin(systems, eq(assetSystems.systemId, systems.id))
                .where(and(eq(assetSystems.assetId, selectedAssetId), eq(assetSystems.status, 'Operational')))
                .orderBy(asc(systems.name), asc(systems.id))
                .limit(1)

            if (!resolvedSystem?.systemId) {
                throw new Error('No operational system found for selected asset')
            }

            workOrderAssetId = asset.assetId
            workOrderSystemId = resolvedSystem.systemId
            description = 'Manual work order created from Requests page.'
        }

        // Create the work order
        const [wo] = await db
            .insert(workOrders)
            .values({
                assetId: workOrderAssetId,
                systemId: workOrderSystemId,
                description,
                physicsHandOver: 'Pending',
                status: 'Open',
                engineerId: null,
                createdAt: new Date().toISOString(),
            })
            .returning({ id: workOrders.id })

        if (requestIds.length > 0) {
            await db
                .update(userRequests)
                .set({ status: 'Active', woId: wo.id })
                .where(inArray(userRequests.id, requestIds))
        }

        // Inherit downtime values from the source request when downtime start exists.
        if (inheritedDowntimeStartAt && workOrderAssetId && workOrderSystemId) {
            await db.insert(downtimeEvents).values({
                assetId: workOrderAssetId,
                systemId: workOrderSystemId,
                woId: wo.id,
                startAt: inheritedDowntimeStartAt,
                endAt: inheritedDowntimeEndAt,
            })
        }

        const { logger } = await import('../lib/logger')
        logger.info('WORK_ORDER_CREATED', {
            woId: wo.id,
            requestIds,
            assetId: workOrderAssetId,
            systemId: workOrderSystemId,
            creationSource: requestIds.length > 0 ? 'requests' : 'asset-selection',
            ...withActor(user),
        })
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
        const { db, workOrders, systems, eq, and, sql, desc, inArray } = await getWorkOrderDbDeps()
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
                    sql`${workOrders.createdAt} >= ${sixMonthsAgoIso}`
                )
            )
            .orderBy(desc(workOrders.createdAt))

        return rows
    })

export const fetchWorkOrderSystemsByAsset = authServerFn({ method: 'GET' })
    .inputValidator((data: { assetId: number }) => {
        if (!data.assetId) throw new Error('Asset ID is required')
        return data
    })
    .handler(async ({ data }): Promise<WorkOrderSystemOption[]> => {
        const { requireSessionUser } = await import('../lib/auth-guards.server')
        await requireSessionUser()

        const { db, assetSystems, systems, eq, and, asc } = await getWorkOrderDbDeps()

        const rows = await db
            .selectDistinct({
                systemId: systems.id,
                systemName: systems.name,
            })
            .from(assetSystems)
            .innerJoin(systems, eq(assetSystems.systemId, systems.id))
            .where(and(eq(assetSystems.assetId, data.assetId), eq(assetSystems.status, 'Operational')))
            .orderBy(asc(systems.name), asc(systems.id))

        return rows.filter(
            (row): row is WorkOrderSystemOption => row.systemId !== null && row.systemName !== null,
        )
    })

export const updateWorkOrderSystem = authServerFn({ method: 'POST' })
    .inputValidator((data: { woId: number; systemId: number }) => {
        if (!data.woId) throw new Error('Work Order ID is required')
        if (!data.systemId) throw new Error('System ID is required')
        return data
    })
    .handler(async ({ data }) => {
        const {
            db,
            workOrders,
            assetSystems,
            systems,
            downtimeEvents,
            eq,
            and,
        } = await getWorkOrderDbDeps()
        const { requirePermission } = await import('../lib/auth-guards.server')

        const user = await requirePermission('workOrders', 'update')

        const [existing] = await db
            .select({
                woId: workOrders.id,
                assetId: workOrders.assetId,
                systemId: workOrders.systemId,
            })
            .from(workOrders)
            .where(eq(workOrders.id, data.woId))
            .limit(1)

        if (!existing) {
            throw new Error('Work Order not found')
        }

        if (!existing.assetId) {
            throw new Error('Work Order has no asset context')
        }

        const [allowedSystem] = await db
            .select({
                systemId: systems.id,
                systemName: systems.name,
            })
            .from(assetSystems)
            .innerJoin(systems, eq(assetSystems.systemId, systems.id))
            .where(and(
                eq(assetSystems.assetId, existing.assetId),
                eq(assetSystems.systemId, data.systemId),
                eq(assetSystems.status, 'Operational'),
            ))
            .limit(1)

        if (!allowedSystem?.systemId || !allowedSystem.systemName) {
            throw new Error('Selected system is not available for this asset')
        }

        if (existing.systemId === data.systemId) {
            return {
                success: true,
                systemId: data.systemId,
                systemName: allowedSystem.systemName,
            }
        }

        db.transaction((tx) => {
            tx.update(workOrders)
                .set({ systemId: data.systemId })
                .where(eq(workOrders.id, data.woId))
                .run()

            tx.update(downtimeEvents)
                .set({ systemId: data.systemId })
                .where(eq(downtimeEvents.woId, data.woId))
                .run()
        })

        const { logger } = await import('../lib/logger')
        logger.info('WORK_ORDER_SYSTEM_UPDATED', {
            woId: data.woId,
            assetId: existing.assetId,
            previousSystemId: existing.systemId ?? null,
            nextSystemId: data.systemId,
            syncedDowntimeEvents: true,
            ...withActor(user),
        })

        return {
            success: true,
            systemId: data.systemId,
            systemName: allowedSystem.systemName,
        }
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
        logger.info('REQUESTS_MERGED_TO_WO', {
            woId,
            requestIds,
            ...withActor(user),
        })
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
        logger.info('WORK_ORDER_DELETED', {
            woIds,
            requestAction,
            requestIds,
            ...withActor(user),
        })
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

        const user = await requirePermission('workOrders', 'update')
        const result = await db.insert(workOrderNotes).values({
            woId: data.woId,
            engineerId: data.engineerId,
            noteText: data.noteText,
            createdAt: new Date().toISOString(),
        }).returning({ id: workOrderNotes.id })

        const { logger } = await import('../lib/logger')
        logger.info('WORK_ORDER_NOTE_CREATED', {
            woId: data.woId,
            noteId: result[0]?.id ?? null,
            engineerId: data.engineerId ?? null,
            ...withActor(user),
        })

        return result[0]
    })

export const startWorkOrder = authServerFn({ method: 'POST' })
    .inputValidator((data: { woId: number }) => {
        if (!data.woId) throw new Error('Work Order ID is required')
        return data
    })
    .handler(async ({ data }) => {
        const { db, workOrders, eq } = await getWorkOrderDbDeps()
        const { requirePermission } = await import('../lib/auth-guards.server')

        const user = await requirePermission('workOrders', 'update')
        const startedAt = new Date().toISOString()
        await db.update(workOrders)
            .set({ startAt: startedAt })
            .where(eq(workOrders.id, data.woId))

        const { logger } = await import('../lib/logger')
        logger.info('WORK_ORDER_STARTED', {
            woId: data.woId,
            ...withActor(user),
        })

        return { startAt: startedAt }
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
        const endedAt = new Date().toISOString()
        await db.update(workOrders)
            .set({
                status: 'Closed',
                endAt: endedAt,
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
        logger.info('WORK_ORDER_CLOSED', {
            woId: data.woId,
            requestIds,
            ...withActor(user),
        })
        return { success: true, endAt: endedAt }
    })

export const reopenWorkOrder = authServerFn({ method: 'POST' })
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
            and,
        } = await getWorkOrderDbDeps()
        const { requirePermission } = await import('../lib/auth-guards.server')

        const user = await requirePermission('workOrders', 'update')

        const [existing] = await db
            .select({
                id: workOrders.id,
                status: workOrders.status,
                startAt: workOrders.startAt,
            })
            .from(workOrders)
            .where(eq(workOrders.id, data.woId))

        if (!existing) {
            throw new Error('Work Order not found')
        }

        if (existing.status !== 'Closed') {
            return { success: true, status: existing.status }
        }

        const reopenedStatus = existing.startAt ? 'Active' : 'Open'
        const linkedRequestStatus = reopenedStatus === 'Active' ? 'Active' : 'Open'

        await db.update(workOrders)
            .set({
                status: reopenedStatus,
                endAt: null,
            })
            .where(eq(workOrders.id, data.woId))

        await db.update(userRequests)
            .set({ status: linkedRequestStatus })
            .where(and(eq(userRequests.woId, data.woId), eq(userRequests.status, 'Closed')))

        const { logger } = await import('../lib/logger')
        logger.info('WORK_ORDER_REOPENED', {
            woId: data.woId,
            status: reopenedStatus,
            ...withActor(user),
        })

        return { success: true, status: reopenedStatus }
    })

export const updateWorkOrderNote = authServerFn({ method: 'POST' })
    .inputValidator((data: { noteId: number; noteText: string }) => {
        if (!data.noteId || !data.noteText) throw new Error('Note ID and text are required')
        return data
    })
    .handler(async ({ data }) => {
        const { db, workOrderNotes, eq } = await getWorkOrderDbDeps()
        const { requirePermission } = await import('../lib/auth-guards.server')

        const user = await requirePermission('workOrders', 'update')
        await db.update(workOrderNotes)
            .set({ noteText: data.noteText })
            .where(eq(workOrderNotes.id, data.noteId))

        const { logger } = await import('../lib/logger')
        logger.info('WORK_ORDER_NOTE_UPDATED', {
            noteId: data.noteId,
            ...withActor(user),
        })

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
        const { db, downtimeEvents, userRequests, eq } = await getWorkOrderDbDeps()
        const { requirePermission } = await import('../lib/auth-guards.server')

        const user = await requirePermission('workOrders', 'update')
        const result = await db.insert(downtimeEvents).values({
            assetId: data.assetId,
            systemId: data.systemId,
            woId: data.woId,
            startAt: data.startAt,
            endAt: data.endAt,
            notes: data.notes,
        }).returning({ id: downtimeEvents.id })

        if (data.endAt !== undefined) {
            await db.update(userRequests)
                .set({ downtimeEndAt: data.endAt })
                .where(eq(userRequests.woId, data.woId))
        }

        const { logger } = await import('../lib/logger')
        logger.info('WORK_ORDER_DOWNTIME_CREATED', {
            downtimeEventId: result[0]?.id ?? null,
            woId: data.woId,
            assetId: data.assetId,
            systemId: data.systemId,
            syncedRequestDowntimeEnd: data.endAt !== undefined,
            ...withActor(user),
        })

        return result[0]
    })

export const updateDowntimeEvent = authServerFn({ method: 'POST' })
    .inputValidator((data: { id: number; endAt?: string; notes?: string }) => {
        if (!data.id) throw new Error('Downtime event ID is required')
        return data
    })
    .handler(async ({ data }) => {
        const { db, downtimeEvents, userRequests, assets, eq, and, isNull } = await getWorkOrderDbDeps()
        const { requirePermission } = await import('../lib/auth-guards.server')

        const user = await requirePermission('workOrders', 'update')
        const [existingDowntime] = await db
            .select({ woId: downtimeEvents.woId, assetId: downtimeEvents.assetId })
            .from(downtimeEvents)
            .where(eq(downtimeEvents.id, data.id))
            .limit(1)

        if (!existingDowntime) {
            throw new Error('Downtime event not found')
        }

        await db.update(downtimeEvents)
            .set({
                ...(data.endAt !== undefined ? { endAt: data.endAt } : {}),
                ...(data.notes !== undefined ? { notes: data.notes } : {}),
            })
            .where(eq(downtimeEvents.id, data.id))

        if (data.endAt !== undefined && existingDowntime.woId !== null) {
            await db.update(userRequests)
                .set({ downtimeEndAt: data.endAt })
                .where(eq(userRequests.woId, existingDowntime.woId))
        }

        let syncedAssetClinical = false
        if (data.endAt !== undefined) {
            const openDowntimeForAsset = await db
                .select({ id: downtimeEvents.id })
                .from(downtimeEvents)
                .where(and(eq(downtimeEvents.assetId, existingDowntime.assetId), isNull(downtimeEvents.endAt)))
                .limit(1)

            if (openDowntimeForAsset.length === 0) {
                await db.update(assets)
                    .set({ status: 'Clinical' })
                    .where(eq(assets.id, existingDowntime.assetId))
                syncedAssetClinical = true
            }
        }

        const { logger } = await import('../lib/logger')
        logger.info('WORK_ORDER_DOWNTIME_UPDATED', {
            downtimeEventId: data.id,
            updatedEndAt: data.endAt !== undefined,
            updatedNotes: data.notes !== undefined,
            syncedRequestDowntimeEnd: data.endAt !== undefined && existingDowntime.woId !== null,
            syncedAssetClinical,
            ...withActor(user),
        })

        return { success: true }
    })
