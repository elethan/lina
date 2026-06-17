import { authServerFn } from '../lib/server-utils'

export const ASSET_STATUS_DASHBOARD_QUERY_KEY = ['asset-status-dashboard'] as const

export const LINAC_DETAIL_FIELDS = [
  'catDate',
  'gunDate',
  'mirrorDate',
  'ionDate',
  'magnetronDate',
  'thyratronDate',
  'htHours',
] as const

export const MRL_DETAIL_FIELDS = [
  'catDate',
  'magnetFieldStrength',
  'cryogenDate',
  'gradientCoilDate',
  'rfAmplifierDate',
  'htHours',
] as const

export type LinacEditableField = (typeof LINAC_DETAIL_FIELDS)[number]
export type MrlEditableField = (typeof MRL_DETAIL_FIELDS)[number]
export type AssetStatusDashboardEditableField = LinacEditableField | MrlEditableField

export function getDetailFieldsForType(assetType: 'Linac' | 'MR Linac'): readonly string[] {
  return assetType === 'Linac' ? LINAC_DETAIL_FIELDS : MRL_DETAIL_FIELDS
}

export type AssetStatusDashboardRow = {
  assetId: number
  assetType: 'Linac' | 'MR Linac'
  siteName: string | null
  serialNumber: string
  modelName: string | null
  status: string
  // Common field
  catDate: string | null
  // Linac-specific fields
  gunDate: string | null
  mirrorDate: string | null
  ionDate: string | null
  magnetronDate: string | null
  thyratronDate: string | null
  // MRL-specific fields
  magnetFieldStrength: number | null
  cryogenDate: string | null
  gradientCoilDate: string | null
  rfAmplifierDate: string | null
  // Shared numeric
  htHours: number | null
  // Audit
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
  const { assets, linacInfo, mrlInfo, sites } = schemaMod
  const { eq, ne, asc } = ormMod

  return { db, assets, linacInfo, mrlInfo, sites, eq, ne, asc }
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

  if (field === 'htHours' || field === 'magnetFieldStrength') {
    const parsed = Number(raw)
    if (!Number.isFinite(parsed) || parsed < 0) {
      const label = field === 'htHours' ? 'HT Hours' : 'Magnet Field Strength'
      throw new Error(`${label} must be a non-negative number`)
    }

    return parsed
  }

  return raw
}

export const fetchAssetStatusDashboard = authServerFn({ method: 'GET' }).handler(
  async (): Promise<AssetStatusDashboardRow[]> => {
    const { requirePermission } = await import('../lib/auth-guards.server')
    await requirePermission('dashboard', 'read')

    const { db, assets, linacInfo, mrlInfo, sites, eq, ne, asc } = await getDashboardDbDeps()

    const rows = await db
      .select({
        assetId: assets.id,
        assetType: assets.assetType,
        siteName: sites.name,
        serialNumber: assets.serialNumber,
        modelName: assets.modelName,
        status: assets.status,
        catDate: assets.catDate,
        // Linac-specific
        gunDate: linacInfo.gunDate,
        mirrorDate: linacInfo.mirrorDate,
        ionDate: linacInfo.ionDate,
        magnetronDate: linacInfo.magnetronDate,
        thyratronDate: linacInfo.thyratronDate,
        linacHtHours: linacInfo.htHours,
        linacUpdatedAt: linacInfo.updatedAt,
        linacDeletedAt: linacInfo.deletedAt,
        // MRL-specific
        magnetFieldStrength: mrlInfo.magnetFieldStrength,
        cryogenDate: mrlInfo.cryogenDate,
        gradientCoilDate: mrlInfo.gradientCoilDate,
        rfAmplifierDate: mrlInfo.rfAmplifierDate,
        mrlHtHours: mrlInfo.htHours,
        mrlUpdatedAt: mrlInfo.updatedAt,
        mrlDeletedAt: mrlInfo.deletedAt,
      })
      .from(assets)
      .leftJoin(linacInfo, eq(assets.id, linacInfo.assetId))
      .leftJoin(mrlInfo, eq(assets.id, mrlInfo.assetId))
      .leftJoin(sites, eq(assets.siteId, sites.id))
      .where(ne(assets.status, 'De-commissioned'))
      .orderBy(
        asc(sites.name),
        asc(assets.modelName),
        asc(assets.serialNumber),
      )

    return rows.map((row) => ({
      assetId: row.assetId,
      assetType: row.assetType,
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
      magnetFieldStrength: row.magnetFieldStrength ?? null,
      cryogenDate: row.cryogenDate ?? null,
      gradientCoilDate: row.gradientCoilDate ?? null,
      rfAmplifierDate: row.rfAmplifierDate ?? null,
      htHours: row.assetType === 'Linac' ? (row.linacHtHours ?? null) : (row.mrlHtHours ?? null),
      infoUpdatedAt: row.assetType === 'Linac'
        ? (row.linacUpdatedAt ?? null)
        : (row.mrlUpdatedAt ?? null),
      infoDeletedAt: row.assetType === 'Linac'
        ? (row.linacDeletedAt ?? null)
        : (row.mrlDeletedAt ?? null),
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
    const { db, assets, linacInfo, mrlInfo, eq } = await getDashboardDbDeps()

    // 1. Fetch asset to determine type
    const [assetRow] = await db
      .select({
        assetId: assets.id,
        assetType: assets.assetType,
      })
      .from(assets)
      .where(eq(assets.id, data.assetId))
      .limit(1)

    if (!assetRow) {
      throw new Error('Asset not found')
    }

    // 2. Validate field belongs to this asset type
    const validFields = getDetailFieldsForType(assetRow.assetType)
    if (!validFields.includes(data.field)) {
      throw new Error(`Field "${data.field}" is not valid for asset type "${assetRow.assetType}"`)
    }

    // 3. Route the update
    if (data.field === 'catDate') {
      await db
        .update(assets)
        .set({ catDate: data.value as string | null })
        .where(eq(assets.id, data.assetId))
    } else {
      // Determine which info table to use
      const infoTable = assetRow.assetType === 'Linac' ? linacInfo : mrlInfo

      // Look up existing info row by assetId
      const [existingInfo] = await db
        .select({ id: infoTable.id })
        .from(infoTable)
        .where(eq(infoTable.assetId, data.assetId))
        .limit(1)

      let infoId: number
      if (!existingInfo) {
        // Lazy-create the info row
        const [created] = await db
          .insert(infoTable)
          .values({ assetId: data.assetId } as never)
          .returning({ id: infoTable.id })

        infoId = created.id
      } else {
        infoId = existingInfo.id
      }

      // Update the specific field in the info table
      // We know the field is valid for this table, so cast accordingly
      await db
        .update(infoTable)
        .set({ [data.field]: data.value } as never)
        .where(eq(infoTable.id, infoId))
    }

    logger.info('ASSET_DASHBOARD_FIELD_UPDATED', {
      assetId: data.assetId,
      assetType: assetRow.assetType,
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
