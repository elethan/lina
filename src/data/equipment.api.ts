import { authServerFn } from '../lib/server-utils'
import {
    getMachineClinicalStatusLabel,
    MACHINE_CLINICAL_STATUS,
    normalizeMachineClinicalStatus,
    type MachineClinicalStatus,
} from '../lib/machine-clinical-status'

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

async function getEquipmentDbDeps() {
    const [dbMod, schemaMod, ormMod] = await Promise.all([
        import('../db/client'),
        import('../db/schema'),
        import('drizzle-orm'),
    ])

    const { db } = dbMod
    const { systems, assets, assetSystems, sites, userRequests } = schemaMod
    const { eq, inArray, asc, and, ne, isNull, desc, sql } = ormMod

    return { db, systems, assets, assetSystems, sites, userRequests, eq, inArray, asc, and, ne, isNull, desc, sql }
}

export const fetchSites = authServerFn({ method: 'GET' }).handler(async () => {
    const { requireSessionUser } = await import('../lib/auth-guards.server')
    await requireSessionUser()
    const { db, sites, asc } = await getEquipmentDbDeps()

    const rows = await db
        .select({
            siteId: sites.id,
            name: sites.name,
        })
        .from(sites)
        .orderBy(asc(sites.name))

    return rows
})

export const fetchSiteEquipment = authServerFn({ method: 'GET' })
    .inputValidator((data: { siteId: number }) => {
        if (!data.siteId) throw new Error('siteId is required')
        return data
    })
    .handler(async ({ data }) => {
        const { requireSessionUser } = await import('../lib/auth-guards.server')
        await requireSessionUser()
        const { db, systems, assets, assetSystems, eq, inArray, and, ne, asc } = await getEquipmentDbDeps()

        const { siteId } = data

        // Fetch all assets for this site
        const siteAssets = await db
            .select({
                assetId: assets.id,
                serialNumber: assets.serialNumber,
                modelName: assets.modelName,
                status: assets.status,
            })
            .from(assets)
            .where(and(eq(assets.siteId, siteId), ne(assets.status, 'De-commissioned')))

        const assetIds = siteAssets.map(a => a.assetId)

        // Fetch systems linked to these assets
        let siteSystems: { systemId: number, name: string }[] = []
        if (assetIds.length > 0) {
            const linkedSystems = await db
                .selectDistinct({
                    systemId: systems.id,
                    name: systems.name,
                })
                .from(assetSystems)
                .leftJoin(systems, eq(assetSystems.systemId, systems.id))
                .where(and(inArray(assetSystems.assetId, assetIds), eq(assetSystems.status, 'Operational')))
                .orderBy(asc(systems.name))

            siteSystems = linkedSystems.filter((s): s is { systemId: number, name: string } => s.systemId !== null && s.name !== null)
        }

        // Also fetch the asset-system mappings so the frontend knows which assets belong to which system
        let assetSystemMap: { assetId: number, systemId: number }[] = []
        if (assetIds.length > 0) {
            const mappings = await db
                .select({
                    assetId: assetSystems.assetId,
                    systemId: assetSystems.systemId,
                })
                .from(assetSystems)
                .leftJoin(systems, eq(assetSystems.systemId, systems.id))
                .where(and(inArray(assetSystems.assetId, assetIds), eq(assetSystems.status, 'Operational')))

            assetSystemMap = mappings.filter((m): m is { assetId: number, systemId: number } => m.assetId !== null && m.systemId !== null)
        }

        return {
            systems: siteSystems,
            assets: siteAssets,
            assetSystemMap,
        }
    })

export type MachineClinicalAssetContext = {
    assetId: number
    siteId: number | null
    serialNumber: string
    modelName: string | null
    status: string
}

export type MachineClinicalAssetOption = {
    assetId: number
    serialNumber: string
    modelName: string | null
    status: string
}

export const fetchMachineClinicalAssetContext = authServerFn({ method: 'GET' })
    .inputValidator((data: { assetId: number }) => {
        if (!data.assetId) throw new Error('assetId is required')
        return data
    })
    .handler(async ({ data }): Promise<MachineClinicalAssetContext> => {
        const { requireSessionUser } = await import('../lib/auth-guards.server')
        await requireSessionUser()
        const { db, assets, eq } = await getEquipmentDbDeps()

        const [row] = await db
            .select({
                assetId: assets.id,
                siteId: assets.siteId,
                serialNumber: assets.serialNumber,
                modelName: assets.modelName,
                status: assets.status,
            })
            .from(assets)
            .where(eq(assets.id, data.assetId))
            .limit(1)

        if (!row) {
            throw new Error('Asset not found')
        }

        return {
            assetId: row.assetId,
            siteId: row.siteId,
            serialNumber: row.serialNumber,
            modelName: row.modelName ?? null,
            status: row.status,
        }
    })

export const fetchMachineClinicalAssetsBySite = authServerFn({ method: 'GET' })
    .inputValidator((data: { siteId: number }) => {
        if (!data.siteId) throw new Error('siteId is required')
        return data
    })
    .handler(async ({ data }): Promise<MachineClinicalAssetOption[]> => {
        const { requireSessionUser } = await import('../lib/auth-guards.server')
        await requireSessionUser()
        const { db, assets, eq, ne, and, asc } = await getEquipmentDbDeps()

        const rows = await db
            .select({
                assetId: assets.id,
                serialNumber: assets.serialNumber,
                modelName: assets.modelName,
                status: assets.status,
            })
            .from(assets)
            .where(and(eq(assets.siteId, data.siteId), ne(assets.status, 'De-commissioned')))
            .orderBy(asc(assets.serialNumber))

        return rows.map((row) => ({
            assetId: row.assetId,
            serialNumber: row.serialNumber,
            modelName: row.modelName ?? null,
            status: row.status,
        }))
    })

export const fetchMachineClinicalStatus = authServerFn({ method: 'GET' })
    .inputValidator((data: { assetId: number }) => {
        if (!data.assetId) throw new Error('assetId is required')
        return data
    })
    .handler(async ({ data }): Promise<{ assetId: number; status: MachineClinicalStatus }> => {
        const { requireSessionUser } = await import('../lib/auth-guards.server')
        await requireSessionUser()
        const { db, assets, eq } = await getEquipmentDbDeps()

        const [row] = await db
            .select({
                assetId: assets.id,
                status: assets.status,
            })
            .from(assets)
            .where(eq(assets.id, data.assetId))
            .limit(1)

        if (!row) {
            throw new Error('Asset not found')
        }

        return {
            assetId: row.assetId,
            status: normalizeMachineClinicalStatus(row.status),
        }
    })

export const updateMachineClinicalStatus = authServerFn({ method: 'POST' })
    .inputValidator((data: { assetId: number; status: MachineClinicalStatus; physicistConfirmationName?: string }) => {
        if (!data.assetId) throw new Error('assetId is required')
        if (![MACHINE_CLINICAL_STATUS.clinical, MACHINE_CLINICAL_STATUS.nonClinical].includes(data.status)) {
            throw new Error(
                `status must be ${MACHINE_CLINICAL_STATUS.clinical} or ${MACHINE_CLINICAL_STATUS.nonClinical}`,
            )
        }

        const physicistConfirmationName = typeof data.physicistConfirmationName === 'string'
            ? data.physicistConfirmationName.trim()
            : undefined

        return {
            ...data,
            physicistConfirmationName: physicistConfirmationName || undefined,
        }
    })
    .handler(async ({ data }) => {
        const [{ requirePermission }, { logger }] = await Promise.all([
            import('../lib/auth-guards.server'),
            import('../lib/logger'),
        ])

        const user = await requirePermission('machineClinical', 'update')
        const { db, assets, assetSystems, systems, userRequests, eq, and, isNull, asc, desc, sql } = await getEquipmentDbDeps()

        const [existing] = await db
            .select({
                assetId: assets.id,
                status: assets.status,
                serialNumber: assets.serialNumber,
                modelName: assets.modelName,
            })
            .from(assets)
            .where(eq(assets.id, data.assetId))
            .limit(1)

        if (!existing) {
            throw new Error('Asset not found')
        }

        const currentStatus = normalizeMachineClinicalStatus(existing.status)
        const isSameLogicalStatus = currentStatus === data.status
        const shouldSyncStoredStatus = existing.status !== data.status
        const isTherapist = String(user.role ?? '').trim().toLowerCase() === 'therapist'
        const isReturningToClinical = currentStatus !== MACHINE_CLINICAL_STATUS.clinical && data.status === MACHINE_CLINICAL_STATUS.clinical

        if (isTherapist && isReturningToClinical && !data.physicistConfirmationName) {
            throw new Error('Physicist confirmation is required before returning equipment to Clinical.')
        }

        if (isSameLogicalStatus && !shouldSyncStoredStatus) {
            logger.info('MACHINE_CLINICAL_STATUS_NOOP', {
                assetId: data.assetId,
                status: data.status,
                physicistConfirmationName: data.physicistConfirmationName ?? null,
                serialNumber: existing.serialNumber,
                modelName: existing.modelName ?? null,
                ...withActor(user),
            })

            return {
                success: true,
                assetId: data.assetId,
                status: data.status,
                requestAction: 'none' as const,
                requestId: null,
            }
        }

        const nowIso = new Date().toISOString()
        const reportedBy = user.name?.trim() || user.email || 'Clinical user'

        let requestId: number | null = null
        let requestAction: 'created-non-clinical-request' | 'updated-non-clinical-request-end' | 'none' = 'none'

        db.transaction((tx) => {
            tx.update(assets)
                .set({ status: data.status })
                .where(eq(assets.id, data.assetId))
                .run()

            if (isSameLogicalStatus) {
                return
            }

            if (data.status === MACHINE_CLINICAL_STATUS.nonClinical) {
                const firstSystem = tx
                    .select({ systemId: systems.id })
                    .from(assetSystems)
                    .innerJoin(systems, eq(assetSystems.systemId, systems.id))
                    .where(and(eq(assetSystems.assetId, data.assetId), eq(assetSystems.status, 'Operational')))
                    .orderBy(asc(systems.name), asc(systems.id))
                    .limit(1)
                    .get()

                if (!firstSystem?.systemId) {
                    throw new Error('No operational system found for selected asset')
                }

                const createdRequest = tx
                    .insert(userRequests)
                    .values({
                        assetId: data.assetId,
                        systemId: firstSystem.systemId,
                        reportedBy,
                        commentText: `Asset toggled to ${getMachineClinicalStatusLabel(data.status, { uppercase: true })} via machine clinical mode.`,
                        status: 'Open',
                        downtimeStartAt: nowIso,
                        downtimeEndAt: null,
                        woId: null,
                        createdAt: nowIso,
                    })
                    .returning({ id: userRequests.id })
                    .get()

                requestId = createdRequest?.id ?? null
                requestAction = 'created-non-clinical-request'
                return
            }

            const relevantRequest = tx
                .select({ id: userRequests.id })
                .from(userRequests)
                .where(and(
                    eq(userRequests.assetId, data.assetId),
                    eq(userRequests.status, 'Open'),
                    isNull(userRequests.woId),
                    isNull(userRequests.downtimeEndAt),
                    sql`${userRequests.downtimeStartAt} IS NOT NULL`,
                ))
                .orderBy(desc(userRequests.createdAt), desc(userRequests.id))
                .limit(1)
                .get()

            if (!relevantRequest?.id) {
                return
            }

            tx.update(userRequests)
                .set({ downtimeEndAt: nowIso })
                .where(eq(userRequests.id, relevantRequest.id))
                .run()

            requestId = relevantRequest.id
            requestAction = 'updated-non-clinical-request-end'
        })

        logger.info('MACHINE_CLINICAL_STATUS_UPDATED', {
            assetId: data.assetId,
            previousStatus: currentStatus,
            nextStatus: data.status,
            requestAction,
            requestId,
            physicistConfirmationName: data.physicistConfirmationName ?? null,
            serialNumber: existing.serialNumber,
            modelName: existing.modelName ?? null,
            ...withActor(user),
        })

        return {
            success: true,
            assetId: data.assetId,
            status: data.status,
            requestAction,
            requestId,
        }
    })
