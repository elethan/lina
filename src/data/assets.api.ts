import { authServerFn } from '../lib/server-utils'

type AssetStatus = 'Operational' | 'De-commissioned'
export type SiteAdminRow = {
  id: number
  name: string
}

export type SystemAdminRow = {
  id: number
  name: string
  status: string
}

export type AssetSystemLinkRow = {
  systemId: number
  systemName: string
  serialNumber: string | null
  swVersion: string | null
  userCredentials: string | null
  adminCredentials: string | null
  status: string
}

export type AssetAdminRow = {
  id: number
  serialNumber: string
  modelName: string | null
  warrantyYears: number | null
  catDate: string | null
  installationDate: string | null
  status: string
  siteId: number | null
  siteName: string | null
  systemIds: number[]
  systemNames: string[]
  systemLinks: AssetSystemLinkRow[]
}

export type AssetsAdminPayload = {
  sites: SiteAdminRow[]
  systems: SystemAdminRow[]
  assets: AssetAdminRow[]
}

async function getAssetsDbDeps() {
  const [dbMod, schemaMod, ormMod] = await Promise.all([
    import('../db/client'),
    import('../db/schema'),
    import('drizzle-orm'),
  ])

  const { db } = dbMod
  const { sites, systems, assets, assetSystems } = schemaMod
  const { eq, asc, inArray, and } = ormMod

  return { db, sites, systems, assets, assetSystems, eq, asc, inArray, and }
}

function ensureAdminRole() {
  return import('../lib/auth-guards.server').then(({ requireRole }) => requireRole('admin'))
}

function ensureAssetsReadRole() {
  return import('../lib/auth-guards.server').then(({ requireRole }) => requireRole('admin', 'engineer'))
}

export const fetchAssetsAdminData = authServerFn({ method: 'GET' }).handler(
  async (): Promise<AssetsAdminPayload> => {
    await ensureAssetsReadRole()
    const { db, sites, systems, assets, assetSystems, eq, asc } = await getAssetsDbDeps()

    const siteRows = await db
      .select({
        id: sites.id,
        name: sites.name,
      })
      .from(sites)
      .orderBy(asc(sites.name))

    const systemRows = await db
      .select({
        id: systems.id,
        name: systems.name,
      })
      .from(systems)
      .orderBy(asc(systems.name))

    const assetRows = await db
      .select({
        id: assets.id,
        serialNumber: assets.serialNumber,
        modelName: assets.modelName,
        warrantyYears: assets.warrantyYears,
        catDate: assets.catDate,
        installationDate: assets.installationDate,
        status: assets.status,
        siteId: assets.siteId,
        siteName: sites.name,
      })
      .from(assets)
      .leftJoin(sites, eq(assets.siteId, sites.id))
      .orderBy(asc(assets.serialNumber))

    const assetSystemRows = await db
      .select({
        assetId: assetSystems.assetId,
        systemId: assetSystems.systemId,
        systemName: systems.name,
        serialNumber: assetSystems.serialNumber,
        swVersion: assetSystems.swVersion,
        userCredentials: assetSystems.userCredentials,
        adminCredentials: assetSystems.adminCredentials,
        status: assetSystems.status,
      })
      .from(assetSystems)
      .leftJoin(systems, eq(assetSystems.systemId, systems.id))

    const systemsByAsset = new Map<number, AssetSystemLinkRow[]>()
    const systemStatusBySystemId = new Map<number, string>()
    for (const row of assetSystemRows) {
      if (!row.assetId || !row.systemId || !row.systemName) continue
      const current = systemsByAsset.get(row.assetId) ?? []
      current.push({
        systemId: row.systemId,
        systemName: row.systemName,
        serialNumber: row.serialNumber ?? null,
        swVersion: row.swVersion ?? null,
        userCredentials: row.userCredentials ?? null,
        adminCredentials: row.adminCredentials ?? null,
        status: row.status,
      })
      systemsByAsset.set(row.assetId, current)

      const existingStatus = systemStatusBySystemId.get(row.systemId)
      if (row.status === 'Operational' || existingStatus === 'Operational') {
        systemStatusBySystemId.set(row.systemId, 'Operational')
      } else {
        systemStatusBySystemId.set(row.systemId, 'De-commissioned')
      }
    }

    return {
      sites: siteRows,
      systems: systemRows.map((system) => ({
        id: system.id,
        name: system.name,
        status: systemStatusBySystemId.get(system.id) ?? 'Operational',
      })),
      assets: assetRows.map((row) => {
        const linked = systemsByAsset.get(row.id) ?? []
        return {
          id: row.id,
          serialNumber: row.serialNumber,
          modelName: row.modelName ?? null,
          warrantyYears: row.warrantyYears ?? null,
          catDate: row.catDate ?? null,
          installationDate: row.installationDate ?? null,
          status: row.status,
          siteId: row.siteId ?? null,
          siteName: row.siteName ?? null,
          systemIds: linked.map((entry) => entry.systemId),
          systemNames: linked.map((entry) => entry.systemName),
          systemLinks: linked,
        }
      }),
    }
  },
)

export const createSiteAdmin = authServerFn({ method: 'POST' })
  .inputValidator((data: { name: string }) => {
    const name = data.name?.trim()
    if (!name) throw new Error('Site name is required')
    return { name }
  })
  .handler(async ({ data }) => {
    await ensureAdminRole()
    const { db, sites } = await getAssetsDbDeps()

    const [created] = await db
      .insert(sites)
      .values({
        name: data.name,
      })
      .returning({ id: sites.id })

    return created
  })

export const updateSiteAdmin = authServerFn({ method: 'POST' })
  .inputValidator((data: { siteId: number; name: string }) => {
    const name = data.name?.trim()
    if (!data.siteId) throw new Error('Site ID is required')
    if (!name) throw new Error('Site name is required')
    return { siteId: data.siteId, name }
  })
  .handler(async ({ data }) => {
    await ensureAdminRole()
    const { db, sites, eq } = await getAssetsDbDeps()

    await db
      .update(sites)
      .set({ name: data.name })
      .where(eq(sites.id, data.siteId))

    return { success: true }
  })

export const createSystemAdmin = authServerFn({ method: 'POST' })
  .inputValidator((data: { name: string }) => {
    const name = data.name?.trim()
    if (!name) throw new Error('System name is required')
    return { name }
  })
  .handler(async ({ data }) => {
    await ensureAdminRole()
    const { db, systems } = await getAssetsDbDeps()

    const [created] = await db
      .insert(systems)
      .values({
        name: data.name,
      })
      .returning({ id: systems.id })

    return created
  })

export const updateSystemAdmin = authServerFn({ method: 'POST' })
  .inputValidator((data: { systemId: number; name: string }) => {
    const name = data.name?.trim()
    if (!data.systemId) throw new Error('System ID is required')
    if (!name) throw new Error('System name is required')
    return { systemId: data.systemId, name }
  })
  .handler(async ({ data }) => {
    await ensureAdminRole()
    const { db, systems, eq } = await getAssetsDbDeps()

    await db
      .update(systems)
      .set({
        name: data.name,
      })
      .where(eq(systems.id, data.systemId))

    return { success: true }
  })

export const decommissionSystemAdmin = authServerFn({ method: 'POST' })
  .inputValidator((data: { systemId: number }) => {
    if (!data.systemId) throw new Error('System ID is required')
    return data
  })
  .handler(async ({ data }) => {
    await ensureAdminRole()
    const { db, assetSystems, eq } = await getAssetsDbDeps()

    await db
      .update(assetSystems)
      .set({ status: 'De-commissioned' })
      .where(eq(assetSystems.systemId, data.systemId))

    return { success: true }
  })

export const createAssetAdmin = authServerFn({ method: 'POST' })
  .inputValidator((data: {
    serialNumber: string
    modelName?: string
    warrantyYears?: number | null
    catDate?: string | null
    installationDate?: string | null
    status?: AssetStatus
    siteId: number
    systemIds: number[]
  }) => {
    const serialNumber = data.serialNumber?.trim()
    if (!serialNumber) throw new Error('Serial number is required')
    if (!data.siteId) throw new Error('Site is required')
    const status = data.status ?? 'Operational'
    if (!['Operational', 'De-commissioned'].includes(status)) {
      throw new Error('Invalid asset status')
    }
    if (!data.systemIds || data.systemIds.length === 0) {
      throw new Error('At least one system is required')
    }

    const uniqueSystemIds = Array.from(new Set(data.systemIds.filter(Boolean)))
    if (uniqueSystemIds.length === 0) {
      throw new Error('At least one valid system is required')
    }

    return {
      serialNumber,
      modelName: data.modelName?.trim() || null,
      warrantyYears: data.warrantyYears ?? null,
      catDate: data.catDate || null,
      installationDate: data.installationDate || null,
      status,
      siteId: data.siteId,
      systemIds: uniqueSystemIds,
    }
  })
  .handler(async ({ data }) => {
    await ensureAdminRole()
    const { db, assets, assetSystems } = await getAssetsDbDeps()

    const [created] = await db
      .insert(assets)
      .values({
        serialNumber: data.serialNumber,
        modelName: data.modelName,
        warrantyYears: data.warrantyYears,
        catDate: data.catDate,
        installationDate: data.installationDate,
        status: data.status,
        siteId: data.siteId,
      })
      .returning({ id: assets.id })

    await db.insert(assetSystems).values(
      data.systemIds.map((systemId) => ({
        assetId: created.id,
        systemId,
        serialNumber: data.serialNumber,
        status: data.status,
      })),
    )

    return created
  })

export const updateAssetAdmin = authServerFn({ method: 'POST' })
  .inputValidator((data: {
    assetId: number
    serialNumber: string
    modelName?: string
    warrantyYears?: number | null
    catDate?: string | null
    installationDate?: string | null
    siteId: number
    status: AssetStatus
    systemIds: number[]
  }) => {
    const serialNumber = data.serialNumber?.trim()
    if (!data.assetId) throw new Error('Asset ID is required')
    if (!serialNumber) throw new Error('Serial number is required')
    if (!data.siteId) throw new Error('Site is required')
    if (!['Operational', 'De-commissioned'].includes(data.status)) {
      throw new Error('Invalid asset status')
    }

    const uniqueSystemIds = Array.from(new Set((data.systemIds ?? []).filter(Boolean)))
    if (uniqueSystemIds.length === 0) {
      throw new Error('At least one system is required')
    }

    return {
      assetId: data.assetId,
      serialNumber,
      modelName: data.modelName?.trim() || null,
      warrantyYears: data.warrantyYears ?? null,
      catDate: data.catDate || null,
      installationDate: data.installationDate || null,
      siteId: data.siteId,
      status: data.status,
      systemIds: uniqueSystemIds,
    }
  })
  .handler(async ({ data }) => {
    await ensureAdminRole()
    const { db, assets, assetSystems, eq } = await getAssetsDbDeps()

    await db
      .update(assets)
      .set({
        serialNumber: data.serialNumber,
        modelName: data.modelName,
        warrantyYears: data.warrantyYears,
        catDate: data.catDate,
        installationDate: data.installationDate,
        siteId: data.siteId,
        status: data.status,
      })
      .where(eq(assets.id, data.assetId))

    await db
      .delete(assetSystems)
      .where(eq(assetSystems.assetId, data.assetId))

    await db.insert(assetSystems).values(
      data.systemIds.map((systemId) => ({
        assetId: data.assetId,
        systemId,
        serialNumber: data.serialNumber,
        status: data.status,
      })),
    )

    return { success: true }
  })

export const decommissionAssetAdmin = authServerFn({ method: 'POST' })
  .inputValidator((data: { assetId: number }) => {
    if (!data.assetId) throw new Error('Asset ID is required')
    return data
  })
  .handler(async ({ data }) => {
    await ensureAdminRole()
    const { db, assets, eq } = await getAssetsDbDeps()

    await db
      .update(assets)
      .set({ status: 'De-commissioned' })
      .where(eq(assets.id, data.assetId))

    return { success: true }
  })
