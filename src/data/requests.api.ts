import { createServerFn } from '@tanstack/react-start'
import { db } from '../db/client'
import { userRequests, assets, sites, systems, engineers } from '../db/schema'
import { eq, sql } from 'drizzle-orm'

export type RequestRow = {
    id: number
    serialNumber: string | null
    siteName: string | null
    systemName: string | null
    reportedBy: string
    commentText: string
    status: string
    engineerId: number | null
    engineerName: string | null
    createdAt: string | null
}

export const fetchRequests = createServerFn({ method: 'GET' }).handler(
    async (): Promise<RequestRow[]> => {
        const rows = await db
            .select({
                id: userRequests.id,
                serialNumber: assets.serialNumber,
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

        return rows.map((r) => ({
            id: r.id,
            serialNumber: r.serialNumber ?? null,
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
