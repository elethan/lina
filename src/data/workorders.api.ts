import { createServerFn } from '@tanstack/react-start'
import { db } from '../db/client'
import { workOrders, workOrderRequests, workOrderEngineers, userRequests, assets, sites, systems, engineers } from '../db/schema'
import { eq, sql, inArray } from 'drizzle-orm'

// ── Types ─────────────────────────────────────────────────────
export type WorkOrderRow = {
    id: number
    serialNumber: string | null
    siteName: string | null
    systemName: string | null
    description: string
    status: string
    startAt: string | null
    endAt: string | null
    requestCount: number
    engineerNames: string[]
}

// ── Fetch all work orders ─────────────────────────────────────
export const fetchWorkOrders = createServerFn({ method: 'GET' }).handler(
    async (): Promise<WorkOrderRow[]> => {
        // Base WO data with joins
        const rows = await db
            .select({
                id: workOrders.id,
                serialNumber: assets.serialNumber,
                siteName: sites.name,
                systemName: systems.name,
                description: workOrders.description,
                status: workOrders.status,
                startAt: sql<string>`${workOrders.startAt}`,
                endAt: sql<string>`${workOrders.endAt}`,
            })
            .from(workOrders)
            .leftJoin(assets, eq(workOrders.assetId, assets.id))
            .leftJoin(sites, eq(assets.siteId, sites.id))
            .leftJoin(systems, eq(workOrders.systemId, systems.id))

        // Fetch linked request counts
        const requestCounts = await db
            .select({
                woId: workOrderRequests.woId,
                count: sql<number>`COUNT(*)`,
            })
            .from(workOrderRequests)
            .groupBy(workOrderRequests.woId)

        const countMap = new Map(requestCounts.map((r) => [r.woId, r.count]))

        // Fetch linked engineers
        const woEngineers = await db
            .select({
                woId: workOrderEngineers.woId,
                firstName: engineers.firstName,
                lastName: engineers.lastName,
            })
            .from(workOrderEngineers)
            .leftJoin(engineers, eq(workOrderEngineers.engineerId, engineers.id))

        const engineerMap = new Map<number | null, string[]>()
        for (const row of woEngineers) {
            const names = engineerMap.get(row.woId) ?? []
            if (row.firstName && row.lastName) {
                names.push(`${row.firstName} ${row.lastName}`)
            }
            engineerMap.set(row.woId, names)
        }

        return rows.map((r) => ({
            id: r.id,
            serialNumber: r.serialNumber ?? null,
            siteName: r.siteName ?? null,
            systemName: r.systemName ?? null,
            description: r.description,
            status: r.status,
            startAt: r.startAt ?? null,
            endAt: r.endAt ?? null,
            requestCount: countMap.get(r.id) ?? 0,
            engineerNames: engineerMap.get(r.id) ?? [],
        }))
    },
)

export const createWorkOrder = createServerFn({ method: 'POST' })
    .inputValidator((data: { requestIds: number[] }) => {
        if (!data.requestIds || data.requestIds.length === 0) {
            throw new Error('At least one request must be selected')
        }
        return data
    })
    .handler(async ({ data }) => {
        const { requestIds } = data

        // Fetch the selected requests to get asset/system info
        const requests = await db
            .select({
                id: userRequests.id,
                assetId: userRequests.assetId,
                systemId: userRequests.systemId,
                commentText: userRequests.commentText,
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

        // Create the work order
        const [wo] = await db
            .insert(workOrders)
            .values({
                assetId: firstRequest.assetId,
                systemId: firstRequest.systemId,
                description,
                status: 'Open',
            })
            .returning({ id: workOrders.id })

        // Link all selected requests to the new WO
        await db.insert(workOrderRequests).values(
            requestIds.map((requestId) => ({
                woId: wo.id,
                requestId,
            })),
        )

        return { woId: wo.id }
    })
