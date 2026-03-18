import { authServerFn } from '../lib/server-utils'

async function getPmDbDeps() {
    const [dbMod, schemaMod, ormMod] = await Promise.all([
        import('../db/client'),
        import('../db/schema'),
        import('drizzle-orm'),
    ])

    const { db } = dbMod
    const { assetPm, assets, sites, systems, engineers } = schemaMod
    const { eq, and, desc, isNull, sql } = ormMod

    return {
        db,
        assetPm,
        assets,
        sites,
        systems,
        engineers,
        eq,
        and,
        desc,
        isNull,
        sql,
    }
}

export type PmRow = {
    id: number
    assetId: number | null
    systemId: number | null
    engineerId: number | null
    serialNumber: string | null
    siteName: string | null
    systemName: string | null
    intervalMonths: number | null
    startAt: string | null
    completedAt: string | null
    engineerName: string | null
    createdAt: string | null
}

export type PmFormData = {
    id: number
    assetId: number
    systemId: number
    intervalMonths: number
    startAt: string
    engineerId: number | null
    completedAt: string | null
}

export type PmFormOptions = {
    assets: Array<{ id: number; label: string }>
    systems: Array<{ id: number; label: string }>
    engineers: Array<{ id: number; label: string }>
}

export const fetchPmRows = authServerFn({ method: 'GET' }).handler(
    async (): Promise<PmRow[]> => {
        const {
            db,
            assetPm,
            assets,
            sites,
            systems,
            engineers,
            eq,
            desc,
            isNull,
            sql,
        } = await getPmDbDeps()

        const rows = await db
            .select({
                id: assetPm.id,
                assetId: assetPm.assetId,
                systemId: assetPm.systemId,
                engineerId: assetPm.engineerId,
                serialNumber: assets.serialNumber,
                siteName: sites.name,
                systemName: systems.name,
                intervalMonths: assetPm.intervalMonths,
                startAt: sql<string>`${assetPm.startAt}`,
                completedAt: sql<string>`${assetPm.completedAt}`,
                createdAt: sql<string>`${assetPm.createdAt}`,
                engineerName: sql<string | null>`${engineers.firstName} || ' ' || ${engineers.lastName}`,
            })
            .from(assetPm)
            .leftJoin(assets, eq(assetPm.assetId, assets.id))
            .leftJoin(sites, eq(assets.siteId, sites.id))
            .leftJoin(systems, eq(assetPm.systemId, systems.id))
            .leftJoin(engineers, eq(assetPm.engineerId, engineers.id))
            .where(isNull(assetPm.deletedAt))
            .orderBy(desc(assetPm.startAt), desc(assetPm.id))

        return rows.map((row) => ({
            id: row.id,
            assetId: row.assetId ?? null,
            systemId: row.systemId ?? null,
            engineerId: row.engineerId ?? null,
            serialNumber: row.serialNumber ?? null,
            siteName: row.siteName ?? null,
            systemName: row.systemName ?? null,
            intervalMonths: row.intervalMonths ?? null,
            startAt: row.startAt ?? null,
            completedAt: row.completedAt ?? null,
            createdAt: row.createdAt ?? null,
            engineerName: row.engineerName?.trim() || null,
        }))
    },
)

export const duplicatePmInstance = authServerFn({ method: 'POST' })
    .inputValidator((data: { sourcePmId: number; newStartAt: string }) => {
        if (!data.sourcePmId) {
            throw new Error('A source PM record is required')
        }
        if (!data.newStartAt) {
            throw new Error('A new start date is required')
        }
        return data
    })
    .handler(async ({ data }) => {
        const { db, assetPm, eq, and, isNull } = await getPmDbDeps()
        const { requirePermission } = await import('../lib/auth-guards.server')

        await requirePermission('pmInstances', 'create')

        const parsedStartAt = new Date(data.newStartAt)
        if (Number.isNaN(parsedStartAt.getTime())) {
            throw new Error('Invalid start date')
        }
        const startAtIso = parsedStartAt.toISOString()

        const [source] = await db
            .select({
                id: assetPm.id,
                assetId: assetPm.assetId,
                systemId: assetPm.systemId,
                intervalMonths: assetPm.intervalMonths,
                startAt: assetPm.startAt,
            })
            .from(assetPm)
            .where(and(eq(assetPm.id, data.sourcePmId), isNull(assetPm.deletedAt)))

        if (!source) {
            throw new Error('Source PM record not found')
        }

        if (!source.assetId || !source.systemId || !source.intervalMonths || !source.startAt) {
            throw new Error('Source PM record is missing required fields for duplication')
        }

        const existingCollision = await db
            .select({ id: assetPm.id })
            .from(assetPm)
            .where(
                and(
                    eq(assetPm.assetId, source.assetId),
                    eq(assetPm.systemId, source.systemId),
                    eq(assetPm.startAt, startAtIso),
                    isNull(assetPm.deletedAt),
                ),
            )
            .limit(1)

        if (existingCollision.length > 0) {
            throw new Error('A PM already exists for this asset, system, and start date')
        }

        const [created] = await db
            .insert(assetPm)
            .values({
                assetId: source.assetId,
                systemId: source.systemId,
                intervalMonths: source.intervalMonths,
                startAt: startAtIso,
                engineerId: null,
                completedAt: null,
            })
            .returning({ id: assetPm.id })

        return { id: created.id }
    })

export const reopenPmInstance = authServerFn({ method: 'POST' })
    .inputValidator((data: { pmId: number }) => {
        if (!data.pmId) {
            throw new Error('PM record is required')
        }
        return data
    })
    .handler(async ({ data }) => {
        const { db, assetPm, eq, and, isNull } = await getPmDbDeps()
        const { requirePermission } = await import('../lib/auth-guards.server')

        await requirePermission('pmInstances', 'update')

        const [current] = await db
            .select({
                id: assetPm.id,
                completedAt: assetPm.completedAt,
            })
            .from(assetPm)
            .where(and(eq(assetPm.id, data.pmId), isNull(assetPm.deletedAt)))

        if (!current) {
            throw new Error('PM record not found')
        }

        if (!current.completedAt) {
            return { reopened: false }
        }

        await db
            .update(assetPm)
            .set({ completedAt: null })
            .where(eq(assetPm.id, data.pmId))

        return { reopened: true }
    })

export const fetchPmById = authServerFn({ method: 'GET' })
    .inputValidator((data: { pmId: number }) => {
        if (!data.pmId) {
            throw new Error('PM record is required')
        }
        return data
    })
    .handler(async ({ data }): Promise<PmFormData> => {
        const { db, assetPm, eq, and, isNull, sql } = await getPmDbDeps()

        const [row] = await db
            .select({
                id: assetPm.id,
                assetId: assetPm.assetId,
                systemId: assetPm.systemId,
                intervalMonths: assetPm.intervalMonths,
                engineerId: assetPm.engineerId,
                startAt: sql<string>`${assetPm.startAt}`,
                completedAt: sql<string>`${assetPm.completedAt}`,
            })
            .from(assetPm)
            .where(and(eq(assetPm.id, data.pmId), isNull(assetPm.deletedAt)))

        if (!row || !row.assetId || !row.systemId || !row.intervalMonths || !row.startAt) {
            throw new Error('PM record not found or incomplete')
        }

        return {
            id: row.id,
            assetId: row.assetId,
            systemId: row.systemId,
            intervalMonths: row.intervalMonths,
            startAt: row.startAt,
            engineerId: row.engineerId ?? null,
            completedAt: row.completedAt ?? null,
        }
    })

export const fetchPmFormOptions = authServerFn({ method: 'GET' }).handler(
    async (): Promise<PmFormOptions> => {
        const { db } = await import('../db/client')
        const { assets, systems, engineers } = await import('../db/schema')

        const [assetRows, systemRows, engineerRows] = await Promise.all([
            db.select({ id: assets.id, serialNumber: assets.serialNumber }).from(assets),
            db.select({ id: systems.id, name: systems.name }).from(systems),
            db.select({ id: engineers.id, firstName: engineers.firstName, lastName: engineers.lastName }).from(engineers),
        ])

        return {
            assets: assetRows.map((a) => ({ id: a.id, label: a.serialNumber })),
            systems: systemRows.map((s) => ({ id: s.id, label: s.name })),
            engineers: engineerRows.map((e) => ({ id: e.id, label: `${e.firstName} ${e.lastName}` })),
        }
    },
)

export const savePm = authServerFn({ method: 'POST' })
    .inputValidator((data: {
        pmId?: number
        assetId: number
        systemId: number
        intervalMonths: number
        startAt: string
        engineerId?: number | null
    }) => {
        if (!data.assetId || !data.systemId || !data.intervalMonths || !data.startAt) {
            throw new Error('Missing required PM fields')
        }
        return data
    })
    .handler(async ({ data }) => {
        const { db, assetPm, eq } = await getPmDbDeps()
        const { requirePermission } = await import('../lib/auth-guards.server')

        if (data.pmId) {
            await requirePermission('pmInstances', 'update')
        } else {
            await requirePermission('pmInstances', 'create')
        }

        const parsedStartAt = new Date(data.startAt)
        if (Number.isNaN(parsedStartAt.getTime())) {
            throw new Error('Invalid start date')
        }

        const values = {
            assetId: data.assetId,
            systemId: data.systemId,
            intervalMonths: data.intervalMonths,
            startAt: parsedStartAt.toISOString(),
            engineerId: data.engineerId ?? null,
        }

        if (data.pmId) {
            await db.update(assetPm).set(values).where(eq(assetPm.id, data.pmId))
            return { id: data.pmId }
        }

        const [created] = await db
            .insert(assetPm)
            .values({ ...values, completedAt: null })
            .returning({ id: assetPm.id })

        return { id: created.id }
    })
