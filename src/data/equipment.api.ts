import { authServerFn } from '../lib/server-utils'

async function getEquipmentDbDeps() {
    const [dbMod, schemaMod, ormMod] = await Promise.all([
        import('../db/client'),
        import('../db/schema'),
        import('drizzle-orm'),
    ])

    const { db } = dbMod
    const { systems, assets, assetSystems, sites } = schemaMod
    const { eq, inArray, asc, and, ne } = ormMod

    return { db, systems, assets, assetSystems, sites, eq, inArray, asc, and, ne }
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
        const { db, systems, assets, assetSystems, eq, inArray, and, ne } = await getEquipmentDbDeps()

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

export type MachineClinicalStatus = 'Clinical' | 'Down'

function normalizeMachineClinicalStatus(status: string): MachineClinicalStatus {
    return status.toLowerCase() === 'down' ? 'Down' : 'Clinical'
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
    .inputValidator((data: { assetId: number; status: MachineClinicalStatus }) => {
        if (!data.assetId) throw new Error('assetId is required')
        if (!['Clinical', 'Down'].includes(data.status)) {
            throw new Error('status must be Clinical or Down')
        }

        return data
    })
    .handler(async ({ data }) => {
        const [{ requirePermission }, { logger }] = await Promise.all([
            import('../lib/auth-guards.server'),
            import('../lib/logger'),
        ])

        const user = await requirePermission('machineClinical', 'update')
        const { db, assets, eq } = await getEquipmentDbDeps()

        const [existing] = await db
            .select({ assetId: assets.id, status: assets.status })
            .from(assets)
            .where(eq(assets.id, data.assetId))
            .limit(1)

        if (!existing) {
            throw new Error('Asset not found')
        }

        await db
            .update(assets)
            .set({ status: data.status })
            .where(eq(assets.id, data.assetId))

        logger.info('MACHINE_CLINICAL_STATUS_UPDATED', {
            assetId: data.assetId,
            previousStatus: existing.status,
            nextStatus: data.status,
            actorUserId: user.id,
            actorEmail: user.email ?? null,
            actorRole: user.role ?? null,
        })

        return {
            success: true,
            assetId: data.assetId,
            status: data.status,
        }
    })
