import { authServerFn } from '../lib/server-utils'

type ActorMeta = {
  id: string
  email?: string | null
  role?: string | null
}

function withActor(user: ActorMeta) {
  return {
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    actorRole: user.role ?? null,
  }
}

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
  assetId: number
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
  const {
    sites,
    systems,
    assets,
    assetSystems,
    assetPmResults,
    pmEngineers,
    workOrders,
    workOrderNotes,
    workOrderParts,
    userRequests,
    assetPm,
    downtimeEvents,
    spareParts,
  } = schemaMod
  const { eq, asc, inArray, and, sql } = ormMod

  return {
    db,
    sites,
    systems,
    assets,
    assetSystems,
    assetPmResults,
    pmEngineers,
    workOrders,
    workOrderNotes,
    workOrderParts,
    userRequests,
    assetPm,
    downtimeEvents,
    spareParts,
    eq,
    asc,
    inArray,
    and,
    sql,
  }
}

function ensureAdminRole() {
  return import('../lib/auth-guards.server').then(({ requireRole }) => requireRole('admin'))
}

function ensureAssetsReadRole() {
  return import('../lib/auth-guards.server').then(({ requireRole }) => requireRole('admin', 'engineer', 'scientist'))
}

async function cascadeDeleteAssetById(
  deps: Awaited<ReturnType<typeof getAssetsDbDeps>>,
  assetId: number,
) {
  const {
    db,
    assets,
    assetSystems,
    assetPmResults,
    pmEngineers,
    workOrders,
    workOrderNotes,
    workOrderParts,
    userRequests,
    assetPm,
    downtimeEvents,
    eq,
    inArray,
  } = deps

  const pmRows = await db
    .select({ id: assetPm.id })
    .from(assetPm)
    .where(eq(assetPm.assetId, assetId))

  const woRows = await db
    .select({ id: workOrders.id })
    .from(workOrders)
    .where(eq(workOrders.assetId, assetId))

  const pmIds = pmRows.map((row) => row.id)
  const woIds = woRows.map((row) => row.id)

  if (pmIds.length > 0) {
    await db
      .delete(pmEngineers)
      .where(inArray(pmEngineers.pmInstanceId, pmIds))

    await db
      .delete(assetPmResults)
      .where(inArray(assetPmResults.pmInstanceId, pmIds))
  }

  if (woIds.length > 0) {
    await db
      .update(userRequests)
      .set({ woId: null })
      .where(inArray(userRequests.woId, woIds))

    await db
      .delete(workOrderNotes)
      .where(inArray(workOrderNotes.woId, woIds))

    await db
      .delete(workOrderParts)
      .where(inArray(workOrderParts.woId, woIds))

    await db
      .delete(downtimeEvents)
      .where(inArray(downtimeEvents.woId, woIds))
  }

  await db
    .delete(assetPm)
    .where(eq(assetPm.assetId, assetId))

  await db
    .delete(workOrders)
    .where(eq(workOrders.assetId, assetId))

  await db
    .delete(userRequests)
    .where(eq(userRequests.assetId, assetId))

  await db
    .delete(downtimeEvents)
    .where(eq(downtimeEvents.assetId, assetId))

  await db
    .delete(assetSystems)
    .where(eq(assetSystems.assetId, assetId))

  await db
    .delete(assets)
    .where(eq(assets.id, assetId))
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
        assetId: row.assetId,
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
    const user = await ensureAdminRole()
    const { db, sites } = await getAssetsDbDeps()

    const [created] = await db
      .insert(sites)
      .values({
        name: data.name,
      })
      .returning({ id: sites.id })

    const { logger } = await import('../lib/logger')
    logger.info('ASSET_SITE_CREATED', {
      siteId: created.id,
      name: data.name,
      ...withActor(user),
    })

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
    const user = await ensureAdminRole()
    const { db, sites, eq } = await getAssetsDbDeps()

    await db
      .update(sites)
      .set({ name: data.name })
      .where(eq(sites.id, data.siteId))

    const { logger } = await import('../lib/logger')
    logger.info('ASSET_SITE_UPDATED', {
      siteId: data.siteId,
      name: data.name,
      ...withActor(user),
    })

    return { success: true }
  })

export const deleteSiteAdmin = authServerFn({ method: 'POST' })
  .inputValidator((data: { siteId: number }) => {
    if (!data.siteId) throw new Error('Site ID is required')
    return data
  })
  .handler(async ({ data }) => {
    const user = await ensureAdminRole()
    const deps = await getAssetsDbDeps()
    const { db, sites, assets, spareParts, eq } = deps

    const [siteRow] = await db
      .select({ id: sites.id, name: sites.name })
      .from(sites)
      .where(eq(sites.id, data.siteId))
      .limit(1)

    if (!siteRow) {
      throw new Error('Site not found')
    }

    const siteAssets = await db
      .select({ id: assets.id })
      .from(assets)
      .where(eq(assets.siteId, data.siteId))

    for (const asset of siteAssets) {
      await cascadeDeleteAssetById(deps, asset.id)
    }

    await db
      .delete(spareParts)
      .where(eq(spareParts.siteId, data.siteId))

    await db
      .delete(sites)
      .where(eq(sites.id, data.siteId))

    const { logger } = await import('../lib/logger')
    logger.info('ASSET_SITE_DELETED', {
      siteId: siteRow.id,
      name: siteRow.name,
      deletedAssetsCount: siteAssets.length,
      ...withActor(user),
    })

    return { success: true }
  })

export const createSystemAdmin = authServerFn({ method: 'POST' })
  .inputValidator((data: { name: string }) => {
    const name = data.name?.trim()
    if (!name) throw new Error('System name is required')
    return { name }
  })
  .handler(async ({ data }) => {
    const user = await ensureAdminRole()
    const { db, systems } = await getAssetsDbDeps()

    const [created] = await db
      .insert(systems)
      .values({
        name: data.name,
      })
      .returning({ id: systems.id })

    const { logger } = await import('../lib/logger')
    logger.info('ASSET_SYSTEM_CREATED', {
      systemId: created.id,
      name: data.name,
      ...withActor(user),
    })

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
    const user = await ensureAdminRole()
    const { db, systems, eq } = await getAssetsDbDeps()

    await db
      .update(systems)
      .set({
        name: data.name,
      })
      .where(eq(systems.id, data.systemId))

    const { logger } = await import('../lib/logger')
    logger.info('ASSET_SYSTEM_UPDATED', {
      systemId: data.systemId,
      name: data.name,
      ...withActor(user),
    })

    return { success: true }
  })

export const createSystemWithLinkAdmin = authServerFn({ method: 'POST' })
  .inputValidator((data: {
    name: string
    assetId?: number | null
    serialNumber?: string | null
    swVersion?: string | null
    userCredentials?: string | null
    adminCredentials?: string | null
    status?: AssetStatus
  }) => {
    const name = data.name?.trim()
    if (!name) throw new Error('System name is required')

    const status = data.status ?? 'Operational'
    if (!['Operational', 'De-commissioned'].includes(status)) {
      throw new Error('Invalid system link status')
    }

    return {
      name,
      assetId: data.assetId ?? null,
      serialNumber: data.serialNumber?.trim() || null,
      swVersion: data.swVersion?.trim() || null,
      userCredentials: data.userCredentials?.trim() || null,
      adminCredentials: data.adminCredentials?.trim() || null,
      status,
    }
  })
  .handler(async ({ data }) => {
    const user = await ensureAdminRole()
    const { db, systems, assetSystems } = await getAssetsDbDeps()

    const [created] = await db
      .insert(systems)
      .values({ name: data.name })
      .returning({ id: systems.id })

    if (data.assetId) {
      await db.insert(assetSystems).values({
        assetId: data.assetId,
        systemId: created.id,
        serialNumber: data.serialNumber,
        swVersion: data.swVersion,
        userCredentials: data.userCredentials,
        adminCredentials: data.adminCredentials,
        status: data.status,
      })
    }

    const { logger } = await import('../lib/logger')
    logger.info('ASSET_SYSTEM_CREATED_WITH_LINK', {
      systemId: created.id,
      name: data.name,
      linkedAssetId: data.assetId,
      ...withActor(user),
    })

    return created
  })

export const createAssetSystemLinkAdmin = authServerFn({ method: 'POST' })
  .inputValidator((data: {
    assetId: number
    systemId: number
    serialNumber?: string | null
    swVersion?: string | null
    userCredentials?: string | null
    adminCredentials?: string | null
    status?: AssetStatus
  }) => {
    if (!data.assetId) throw new Error('Asset ID is required')
    if (!data.systemId) throw new Error('System ID is required')

    const status = data.status ?? 'Operational'
    if (!['Operational', 'De-commissioned'].includes(status)) {
      throw new Error('Invalid system link status')
    }

    return {
      assetId: data.assetId,
      systemId: data.systemId,
      serialNumber: data.serialNumber?.trim() || null,
      swVersion: data.swVersion?.trim() || null,
      userCredentials: data.userCredentials?.trim() || null,
      adminCredentials: data.adminCredentials?.trim() || null,
      status,
    }
  })
  .handler(async ({ data }) => {
    const user = await ensureAdminRole()
    const { db, assetSystems } = await getAssetsDbDeps()

    await db.insert(assetSystems).values({
      assetId: data.assetId,
      systemId: data.systemId,
      serialNumber: data.serialNumber,
      swVersion: data.swVersion,
      userCredentials: data.userCredentials,
      adminCredentials: data.adminCredentials,
      status: data.status,
    })

    const { logger } = await import('../lib/logger')
    logger.info('ASSET_SYSTEM_LINK_CREATED', {
      assetId: data.assetId,
      systemId: data.systemId,
      status: data.status,
      ...withActor(user),
    })

    return { success: true }
  })

export const updateAssetSystemLinkAdmin = authServerFn({ method: 'POST' })
  .inputValidator((data: {
    assetId: number
    systemId: number
    serialNumber?: string | null
    swVersion?: string | null
    userCredentials?: string | null
    adminCredentials?: string | null
    status: AssetStatus
  }) => {
    if (!data.assetId) throw new Error('Asset ID is required')
    if (!data.systemId) throw new Error('System ID is required')
    if (!['Operational', 'De-commissioned'].includes(data.status)) {
      throw new Error('Invalid system link status')
    }

    return {
      assetId: data.assetId,
      systemId: data.systemId,
      serialNumber: data.serialNumber?.trim() || null,
      swVersion: data.swVersion?.trim() || null,
      userCredentials: data.userCredentials?.trim() || null,
      adminCredentials: data.adminCredentials?.trim() || null,
      status: data.status,
    }
  })
  .handler(async ({ data }) => {
    const user = await ensureAdminRole()
    const { db, assetSystems, eq, and } = await getAssetsDbDeps()

    await db
      .update(assetSystems)
      .set({
        serialNumber: data.serialNumber,
        swVersion: data.swVersion,
        userCredentials: data.userCredentials,
        adminCredentials: data.adminCredentials,
        status: data.status,
      })
      .where(and(eq(assetSystems.assetId, data.assetId), eq(assetSystems.systemId, data.systemId)))

    const { logger } = await import('../lib/logger')
    logger.info('ASSET_SYSTEM_LINK_UPDATED', {
      assetId: data.assetId,
      systemId: data.systemId,
      status: data.status,
      ...withActor(user),
    })

    return { success: true }
  })

export const decommissionSystemAdmin = authServerFn({ method: 'POST' })
  .inputValidator((data: { systemId: number }) => {
    if (!data.systemId) throw new Error('System ID is required')
    return data
  })
  .handler(async ({ data }) => {
    const user = await ensureAdminRole()
    const { db, assetSystems, eq } = await getAssetsDbDeps()

    await db
      .update(assetSystems)
      .set({ status: 'De-commissioned' })
      .where(eq(assetSystems.systemId, data.systemId))

    const { logger } = await import('../lib/logger')
    logger.info('ASSET_SYSTEM_DECOMMISSIONED', {
      systemId: data.systemId,
      ...withActor(user),
    })

    return { success: true }
  })

export const deleteAssetSystemEntryAdmin = authServerFn({ method: 'POST' })
  .inputValidator((data: { assetId: number; systemId: number }) => {
    if (!data.assetId) throw new Error('Asset ID is required')
    if (!data.systemId) throw new Error('System ID is required')
    return data
  })
  .handler(async ({ data }) => {
    const user = await ensureAdminRole()
    const {
      db,
      assetSystems,
      assetPmResults,
      pmEngineers,
      workOrders,
      workOrderNotes,
      workOrderParts,
      userRequests,
      assetPm,
      downtimeEvents,
      eq,
      and,
      inArray,
    } = await getAssetsDbDeps()

    const [existingLink] = await db
      .select({
        assetId: assetSystems.assetId,
        systemId: assetSystems.systemId,
      })
      .from(assetSystems)
      .where(and(eq(assetSystems.assetId, data.assetId), eq(assetSystems.systemId, data.systemId)))
      .limit(1)

    if (!existingLink) {
      throw new Error('Asset-system entry not found')
    }

    const pmRows = await db
      .select({ id: assetPm.id })
      .from(assetPm)
      .where(and(eq(assetPm.assetId, data.assetId), eq(assetPm.systemId, data.systemId)))

    const woRows = await db
      .select({ id: workOrders.id })
      .from(workOrders)
      .where(and(eq(workOrders.assetId, data.assetId), eq(workOrders.systemId, data.systemId)))

    const pmIds = pmRows.map((row) => row.id)
    const woIds = woRows.map((row) => row.id)

    if (pmIds.length > 0) {
      await db
        .delete(pmEngineers)
        .where(inArray(pmEngineers.pmInstanceId, pmIds))

      await db
        .delete(assetPmResults)
        .where(inArray(assetPmResults.pmInstanceId, pmIds))
    }

    if (woIds.length > 0) {
      await db
        .update(userRequests)
        .set({ woId: null })
        .where(inArray(userRequests.woId, woIds))

      await db
        .delete(workOrderNotes)
        .where(inArray(workOrderNotes.woId, woIds))

      await db
        .delete(workOrderParts)
        .where(inArray(workOrderParts.woId, woIds))

      await db
        .delete(downtimeEvents)
        .where(inArray(downtimeEvents.woId, woIds))
    }

    await db
      .delete(assetPm)
      .where(and(eq(assetPm.assetId, data.assetId), eq(assetPm.systemId, data.systemId)))

    await db
      .delete(workOrders)
      .where(and(eq(workOrders.assetId, data.assetId), eq(workOrders.systemId, data.systemId)))

    await db
      .delete(userRequests)
      .where(and(eq(userRequests.assetId, data.assetId), eq(userRequests.systemId, data.systemId)))

    await db
      .delete(downtimeEvents)
      .where(and(eq(downtimeEvents.assetId, data.assetId), eq(downtimeEvents.systemId, data.systemId)))

    await db
      .delete(assetSystems)
      .where(and(eq(assetSystems.assetId, data.assetId), eq(assetSystems.systemId, data.systemId)))

    const { logger } = await import('../lib/logger')
    logger.info('ASSET_SYSTEM_ENTRY_DELETED', {
      assetId: data.assetId,
      systemId: data.systemId,
      ...withActor(user),
    })

    return { success: true }
  })

// Backward-compatible alias; this action deletes the asset_systems row.
export const deleteAssetSystemLinkAdmin = deleteAssetSystemEntryAdmin

export const previewCloseWarningsAdmin = authServerFn({ method: 'POST' })
  .inputValidator((data: { kind: 'asset' | 'system' | 'site'; assetId?: number; systemId?: number; siteId?: number }) => {
    if (data.kind === 'site') {
      if (!data.siteId) throw new Error('Site ID is required')
      return {
        kind: data.kind,
        assetId: null,
        systemId: null,
        siteId: data.siteId,
      }
    }

    if (!data.assetId) throw new Error('Asset ID is required')
    if (data.kind === 'system' && !data.systemId) throw new Error('System ID is required')

    return {
      kind: data.kind,
      assetId: data.assetId,
      systemId: data.systemId ?? null,
      siteId: null,
    }
  })
  .handler(async ({ data }) => {
    await ensureAdminRole()
    const {
      db,
      assets,
      spareParts,
      assetSystems,
      workOrders,
      userRequests,
      assetPm,
      downtimeEvents,
      eq,
      and,
      inArray,
      sql,
    } = await getAssetsDbDeps()

    const warnings: string[] = []

    if (data.kind === 'site') {
      const siteAssets = await db
        .select({ id: assets.id })
        .from(assets)
        .where(eq(assets.siteId, data.siteId!))

      const assetIds = siteAssets.map((row) => row.id)
      const assetCount = assetIds.length

      const [sparePartRows] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(spareParts)
        .where(eq(spareParts.siteId, data.siteId!))

      let systemEntryCount = 0
      let historyCount = 0

      if (assetIds.length > 0) {
        const [systemRows, woRows, requestRows, pmRows, downtimeRows] = await Promise.all([
          db
            .select({ count: sql<number>`COUNT(*)` })
            .from(assetSystems)
            .where(inArray(assetSystems.assetId, assetIds)),
          db
            .select({ count: sql<number>`COUNT(*)` })
            .from(workOrders)
            .where(inArray(workOrders.assetId, assetIds)),
          db
            .select({ count: sql<number>`COUNT(*)` })
            .from(userRequests)
            .where(inArray(userRequests.assetId, assetIds)),
          db
            .select({ count: sql<number>`COUNT(*)` })
            .from(assetPm)
            .where(inArray(assetPm.assetId, assetIds)),
          db
            .select({ count: sql<number>`COUNT(*)` })
            .from(downtimeEvents)
            .where(inArray(downtimeEvents.assetId, assetIds)),
        ])

        systemEntryCount = Number(systemRows[0]?.count ?? 0)
        historyCount =
          Number(woRows[0]?.count ?? 0) +
          Number(requestRows[0]?.count ?? 0) +
          Number(pmRows[0]?.count ?? 0) +
          Number(downtimeRows[0]?.count ?? 0)
      }

      if (assetCount > 0) {
        warnings.push(`This site has ${assetCount} asset record(s). Deleting the site will delete those assets.`)
        warnings.push(`Deleting those assets will delete ${systemEntryCount} asset-systems entry(ies) and ${historyCount} related history record(s).`)
      }

      const sparePartsCount = Number(sparePartRows?.count ?? 0)
      if (sparePartsCount > 0) {
        warnings.push(`This site has ${sparePartsCount} spare part record(s). They will also be deleted.`)
      }

      return { warnings }
    }

    if (data.kind === 'asset') {
      const [linkedSystems] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(assetSystems)
        .where(eq(assetSystems.assetId, data.assetId))

      const [woRows, requestRows, pmRows, downtimeRows] = await Promise.all([
        db
          .select({ count: sql<number>`COUNT(*)` })
          .from(workOrders)
          .where(eq(workOrders.assetId, data.assetId)),
        db
          .select({ count: sql<number>`COUNT(*)` })
          .from(userRequests)
          .where(eq(userRequests.assetId, data.assetId)),
        db
          .select({ count: sql<number>`COUNT(*)` })
          .from(assetPm)
          .where(eq(assetPm.assetId, data.assetId)),
        db
          .select({ count: sql<number>`COUNT(*)` })
          .from(downtimeEvents)
          .where(eq(downtimeEvents.assetId, data.assetId)),
      ])

      const systemCount = Number(linkedSystems?.count ?? 0)
      const historyCount =
        Number(woRows[0]?.count ?? 0) +
        Number(requestRows[0]?.count ?? 0) +
        Number(pmRows[0]?.count ?? 0) +
        Number(downtimeRows[0]?.count ?? 0)

      if (systemCount > 0) {
        warnings.push(`This asset has ${systemCount} linked system record(s). They will be removed.`)
      }

      if (historyCount > 0) {
        warnings.push(`This asset has ${historyCount} related history record(s). They will be removed.`)
      }

      return { warnings }
    }

    const [woRows, requestRows, pmRows, downtimeRows] = await Promise.all([
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(workOrders)
        .where(and(eq(workOrders.assetId, data.assetId), eq(workOrders.systemId, data.systemId!))),
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(userRequests)
        .where(and(eq(userRequests.assetId, data.assetId), eq(userRequests.systemId, data.systemId!))),
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(assetPm)
        .where(and(eq(assetPm.assetId, data.assetId), eq(assetPm.systemId, data.systemId!))),
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(downtimeEvents)
        .where(and(eq(downtimeEvents.assetId, data.assetId), eq(downtimeEvents.systemId, data.systemId!))),
    ])

    const historyCount =
      Number(woRows[0]?.count ?? 0) +
      Number(requestRows[0]?.count ?? 0) +
      Number(pmRows[0]?.count ?? 0) +
      Number(downtimeRows[0]?.count ?? 0)

    if (historyCount > 0) {
      warnings.push(`This asset-systems entry has ${historyCount} related history record(s). They will be removed.`)
    }

    return { warnings }
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
    const user = await ensureAdminRole()
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

    const { logger } = await import('../lib/logger')
    logger.info('ASSET_CREATED', {
      assetId: created.id,
      siteId: data.siteId,
      serialNumber: data.serialNumber,
      systemIds: data.systemIds,
      status: data.status,
      ...withActor(user),
    })

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
    const user = await ensureAdminRole()
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

    const { logger } = await import('../lib/logger')
    logger.info('ASSET_UPDATED', {
      assetId: data.assetId,
      siteId: data.siteId,
      serialNumber: data.serialNumber,
      systemIds: data.systemIds,
      status: data.status,
      ...withActor(user),
    })

    return { success: true }
  })

export const decommissionAssetAdmin = authServerFn({ method: 'POST' })
  .inputValidator((data: { assetId: number }) => {
    if (!data.assetId) throw new Error('Asset ID is required')
    return data
  })
  .handler(async ({ data }) => {
    const user = await ensureAdminRole()
    const { db, assets, eq } = await getAssetsDbDeps()

    await db
      .update(assets)
      .set({ status: 'De-commissioned' })
      .where(eq(assets.id, data.assetId))

    const { logger } = await import('../lib/logger')
    logger.info('ASSET_DECOMMISSIONED', {
      assetId: data.assetId,
      ...withActor(user),
    })

    return { success: true }
  })

export const deleteAssetAdmin = authServerFn({ method: 'POST' })
  .inputValidator((data: { assetId: number }) => {
    if (!data.assetId) throw new Error('Asset ID is required')
    return data
  })
  .handler(async ({ data }) => {
    const user = await ensureAdminRole()
    const deps = await getAssetsDbDeps()
    const { db, assets, eq } = deps

    const [assetRow] = await db
      .select({
        id: assets.id,
        serialNumber: assets.serialNumber,
        siteId: assets.siteId,
      })
      .from(assets)
      .where(eq(assets.id, data.assetId))
      .limit(1)

    if (!assetRow) {
      throw new Error('Asset not found')
    }

    await cascadeDeleteAssetById(deps, data.assetId)

    const { logger } = await import('../lib/logger')
    logger.info('ASSET_DELETED', {
      assetId: assetRow.id,
      siteId: assetRow.siteId,
      serialNumber: assetRow.serialNumber,
      ...withActor(user),
    })

    return { success: true }
  })
