import { authServerFn } from '../lib/server-utils'
import { db } from '../db/client'
import { systems, assets, assetSystems } from '../db/schema'
import { eq, inArray } from 'drizzle-orm'

export const fetchSiteEquipment = authServerFn({ method: 'GET' })
    .inputValidator((data: { siteId: number }) => {
        if (!data.siteId) throw new Error('siteId is required')
        return data
    })
    .handler(async ({ data }) => {
        const { siteId } = data

        // Fetch all assets for this site
        const siteAssets = await db
            .select({
                assetId: assets.id,
                serialNumber: assets.serialNumber,
                modelName: assets.modelName,
            })
            .from(assets)
            .where(eq(assets.siteId, siteId))

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
                .where(inArray(assetSystems.assetId, assetIds))

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
                .where(inArray(assetSystems.assetId, assetIds))

            assetSystemMap = mappings.filter((m): m is { assetId: number, systemId: number } => m.assetId !== null && m.systemId !== null)
        }

        return {
            systems: siteSystems,
            assets: siteAssets,
            assetSystemMap,
        }
    })
