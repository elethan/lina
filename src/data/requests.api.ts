import { authServerFn } from '../lib/server-utils'
import { db } from '../db/client'
import { userRequests, assets, sites, systems, engineers } from '../db/schema'
import { eq, sql, desc, inArray } from 'drizzle-orm'

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
        const { requestIds } = data

        await db.delete(userRequests).where(inArray(userRequests.id, requestIds))

        return { success: true }
    })

export const createRequest = authServerFn({ method: 'POST' })
    .inputValidator((data: {
        assetId?: number,
        systemId?: number,
        reportedBy: string,
        commentText: string
    }) => {
        if (!data.reportedBy || !data.commentText) throw new Error('Missing required fields')
        return data
    })
    .handler(async ({ data }) => {
        const result = await db.insert(userRequests).values({
            assetId: data.assetId,
            systemId: data.systemId,
            reportedBy: data.reportedBy,
            commentText: data.commentText,
            status: 'Open',
        }).returning({ id: userRequests.id })

        return result[0]
    })
