import { authServerFn } from '../lib/server-utils'

export const ASSET_STATUS_DASHBOARD_QUERY_KEY = ['asset-status-dashboard'] as const
export const ASSET_STATUS_DASHBOARD_DETAIL_FIELDS = [
  'catDate',
  'gunDate',
  'mirrorDate',
  'ionDate',
  'magnetronDate',
  'thyratronDate',
  'htHours',
] as const

export type AssetStatusDashboardEditableField =
  (typeof ASSET_STATUS_DASHBOARD_DETAIL_FIELDS)[number]

export type AssetStatusDashboardRow = {
  assetId: number
  siteName: string | null
  serialNumber: string
  modelName: string | null
  status: string
  catDate: string | null
  gunDate: string | null
  mirrorDate: string | null
  ionDate: string | null
  magnetronDate: string | null
  thyratronDate: string | null
  htHours: number | null
  infoUpdatedAt: string | null
  infoDeletedAt: string | null
}

async function getDashboardDbDeps() {
  const [dbMod, schemaMod, ormMod] = await Promise.all([
    import('../db/client'),
    import('../db/schema'),
    import('drizzle-orm'),
  ])

  const { db } = dbMod
  const { assets, assetInfo, sites } = schemaMod
  const { eq, ne, asc } = ormMod

  return { db, assets, assetInfo, sites, eq, ne, asc }
}

function withActor(user: {
  id: string
  email?: string | null
  role?: string | null
}) {
  return {
    actorUserId: user.id,
    actorEmail: user.email ?? null,
    actorRole: user.role ?? null,
  }
}

function normalizeDashboardEditableValue(
  field: AssetStatusDashboardEditableField,
  value: unknown,
): string | number | null {
  const raw = typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim()

  if (raw.length === 0) {
    return null
  }

  if (field === 'htHours') {
    const parsed = Number(raw)
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new Error('HT Hours must be a non-negative number')
    }

    return parsed
  }

  return raw
}

export const fetchAssetStatusDashboard = authServerFn({ method: 'GET' }).handler(
  async (): Promise<AssetStatusDashboardRow[]> => {
    const { requirePermission } = await import('../lib/auth-guards.server')
    await requirePermission('dashboard', 'read')

    const { db, assets, assetInfo, sites, eq, ne, asc } = await getDashboardDbDeps()

    const rows = await db
      .select({
        assetId: assets.id,
        siteName: sites.name,
        serialNumber: assets.serialNumber,
        modelName: assets.modelName,
        status: assets.status,
        catDate: assets.catDate,
        gunDate: assetInfo.gunDate,
        mirrorDate: assetInfo.mirrorDate,
        ionDate: assetInfo.ionDate,
        magnetronDate: assetInfo.magnetronDate,
        thyratronDate: assetInfo.thyratronDate,
        htHours: assetInfo.htHours,
        infoUpdatedAt: assetInfo.updatedAt,
        infoDeletedAt: assetInfo.deletedAt,
      })
      .from(assets)
      .leftJoin(assetInfo, eq(assets.infoId, assetInfo.id))
      .leftJoin(sites, eq(assets.siteId, sites.id))
      .where(ne(assets.status, 'De-commissioned'))
      .orderBy(
        asc(sites.name),
        asc(assets.modelName),
        asc(assets.serialNumber),
      )

    return rows.map((row) => ({
      assetId: row.assetId,
      siteName: row.siteName ?? null,
      serialNumber: row.serialNumber,
      modelName: row.modelName ?? null,
      status: row.status,
      catDate: row.catDate ?? null,
      gunDate: row.gunDate ?? null,
      mirrorDate: row.mirrorDate ?? null,
      ionDate: row.ionDate ?? null,
      magnetronDate: row.magnetronDate ?? null,
      thyratronDate: row.thyratronDate ?? null,
      htHours: row.htHours ?? null,
      infoUpdatedAt: row.infoUpdatedAt ?? null,
      infoDeletedAt: row.infoDeletedAt ?? null,
    }))
  },
)

export const updateAssetStatusDashboardField = authServerFn({ method: 'POST' })
  .inputValidator((data: {
    assetId: number
    field: AssetStatusDashboardEditableField
    value: string | null
  }) => {
    if (!data.assetId || !Number.isFinite(data.assetId)) {
      throw new Error('assetId is required')
    }

    if (!ASSET_STATUS_DASHBOARD_DETAIL_FIELDS.includes(data.field)) {
      throw new Error('Invalid dashboard field')
    }

    return {
      assetId: data.assetId,
      field: data.field,
      value: normalizeDashboardEditableValue(data.field, data.value),
    }
  })
  .handler(async ({ data }) => {
    const [{ requirePermission }, { logger }] = await Promise.all([
      import('../lib/auth-guards.server'),
      import('../lib/logger'),
    ])

    const user = await requirePermission('dashboard', 'update')
    const { db, assets, assetInfo, eq } = await getDashboardDbDeps()

    const [assetRow] = await db
      .select({
        assetId: assets.id,
        infoId: assets.infoId,
      })
      .from(assets)
      .where(eq(assets.id, data.assetId))
      .limit(1)

    if (!assetRow) {
      throw new Error('Asset not found')
    }

    if (data.field === 'catDate') {
      await db
        .update(assets)
        .set({ catDate: data.value as string | null })
        .where(eq(assets.id, data.assetId))
    } else {
      let infoId = assetRow.infoId

      if (!infoId) {
        const [createdInfo] = await db
          .insert(assetInfo)
          .values({})
          .returning({ id: assetInfo.id })

        infoId = createdInfo.id

        await db
          .update(assets)
          .set({ infoId })
          .where(eq(assets.id, data.assetId))
      }

      if (data.field === 'gunDate') {
        await db
          .update(assetInfo)
          .set({ gunDate: data.value as string | null })
          .where(eq(assetInfo.id, infoId))
      } else if (data.field === 'mirrorDate') {
        await db
          .update(assetInfo)
          .set({ mirrorDate: data.value as string | null })
          .where(eq(assetInfo.id, infoId))
      } else if (data.field === 'ionDate') {
        await db
          .update(assetInfo)
          .set({ ionDate: data.value as string | null })
          .where(eq(assetInfo.id, infoId))
      } else if (data.field === 'magnetronDate') {
        await db
          .update(assetInfo)
          .set({ magnetronDate: data.value as string | null })
          .where(eq(assetInfo.id, infoId))
      } else if (data.field === 'thyratronDate') {
        await db
          .update(assetInfo)
          .set({ thyratronDate: data.value as string | null })
          .where(eq(assetInfo.id, infoId))
      } else if (data.field === 'htHours') {
        await db
          .update(assetInfo)
          .set({ htHours: data.value as number | null })
          .where(eq(assetInfo.id, infoId))
      }
    }

    logger.info('ASSET_DASHBOARD_FIELD_UPDATED', {
      assetId: data.assetId,
      field: data.field,
      value: data.value,
      ...withActor(user),
    })

    return {
      success: true,
      assetId: data.assetId,
      field: data.field,
      value: data.value,
    }
  })
