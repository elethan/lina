import { createServerFn } from '@tanstack/react-start'
import { db } from '../db/client'
import { workOrders, workOrderRequests, userRequests } from '../db/schema'
import { inArray } from 'drizzle-orm'

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
