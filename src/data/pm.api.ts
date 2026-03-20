import { authServerFn } from '../lib/server-utils'

async function getPmDbDeps() {
    const [dbMod, schemaMod, ormMod] = await Promise.all([
        import('../db/client'),
        import('../db/schema'),
        import('drizzle-orm'),
    ])

    const { db } = dbMod
    const {
        assetPm,
        assets,
        sites,
        systems,
        engineers,
        pmTasks,
        assetPmResults,
        pmEngineers,
    } = schemaMod
    const { eq, and, desc, isNull, sql, lte, inArray } = ormMod

    return {
        db,
        assetPm,
        assets,
        sites,
        systems,
        engineers,
        pmTasks,
        assetPmResults,
        pmEngineers,
        eq,
        and,
        desc,
        isNull,
        sql,
        lte,
        inArray,
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

export type PmExecutionTaskRow = {
    taskId: number
    docSection: string | null
    instruction: string
    category: string | null
    intervalMonths: number
    resultId: number | null
    status: 'Pass' | 'Fail' | 'N/A' | null
    findings: string | null
    engineer: string | null
}

export type PmExecutionData = {
    pmId: number
    serialNumber: string | null
    siteName: string | null
    systemName: string | null
    intervalMonths: number
    physicsHandOver: string
    startAt: string
    completedAt: string | null
    assignedEngineerIds: number[]
    tasks: PmExecutionTaskRow[]
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
                physicsHandOver: assetPm.physicsHandOver,
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
                physicsHandOver: source.physicsHandOver,
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

export const fetchPmExecutionData = authServerFn({ method: 'GET' })
    .inputValidator((data: { pmId: number }) => {
        if (!data.pmId) {
            throw new Error('PM record is required')
        }
        return data
    })
    .handler(async ({ data }): Promise<PmExecutionData> => {
        const {
            db,
            assetPm,
            assets,
            sites,
            systems,
            engineers,
            pmTasks,
            assetPmResults,
            pmEngineers,
            eq,
            and,
            isNull,
            lte,
        } = await getPmDbDeps()
        const { requirePermission } = await import('../lib/auth-guards.server')

        await requirePermission('pmInstances', 'read')

        const [pmRow] = await db
            .select({
                pmId: assetPm.id,
                systemId: assetPm.systemId,
                intervalMonths: assetPm.intervalMonths,
                physicsHandOver: assetPm.physicsHandOver,
                startAt: assetPm.startAt,
                completedAt: assetPm.completedAt,
                serialNumber: assets.serialNumber,
                siteName: sites.name,
                systemName: systems.name,
            })
            .from(assetPm)
            .leftJoin(assets, eq(assetPm.assetId, assets.id))
            .leftJoin(sites, eq(assets.siteId, sites.id))
            .leftJoin(systems, eq(assetPm.systemId, systems.id))
            .where(and(eq(assetPm.id, data.pmId), isNull(assetPm.deletedAt)))

        if (!pmRow || !pmRow.systemId || !pmRow.intervalMonths || !pmRow.startAt) {
            throw new Error('PM record not found or incomplete')
        }

        const taskRows = await db
            .select({
                taskId: pmTasks.id,
                docSection: pmTasks.docSection,
                instruction: pmTasks.instruction,
                category: pmTasks.category,
                intervalMonths: pmTasks.intervalMonths,
            })
            .from(pmTasks)
            .where(
                and(
                    eq(pmTasks.systemId, pmRow.systemId),
                    lte(pmTasks.intervalMonths, pmRow.intervalMonths),
                    isNull(pmTasks.deletedAt),
                ),
            )

        const taskIds = taskRows.map((task) => task.taskId)
        const resultRows = taskIds.length === 0
            ? []
            : await db
                .select({
                    resultId: assetPmResults.id,
                    taskId: assetPmResults.taskId,
                    status: assetPmResults.status,
                    findings: assetPmResults.findings,
                    engineer: assetPmResults.engineer,
                })
                .from(assetPmResults)
                .where(
                    and(
                        eq(assetPmResults.pmInstanceId, data.pmId),
                        isNull(assetPmResults.deletedAt),
                    ),
                )

        const resultByTaskId = new Map(
            resultRows
                .filter((row) => row.taskId !== null)
                .map((row) => [row.taskId as number, row]),
        )

        const assignedRows = await db
            .select({ engineerId: pmEngineers.engineerId })
            .from(pmEngineers)
            .where(eq(pmEngineers.pmInstanceId, data.pmId))

        const tasks: PmExecutionTaskRow[] = taskRows.map((task) => {
            const result = resultByTaskId.get(task.taskId)
            const status = result?.status === 'Pass' || result?.status === 'Fail' || result?.status === 'N/A'
                ? result.status
                : null

            return {
                taskId: task.taskId,
                docSection: task.docSection ?? null,
                instruction: task.instruction,
                category: task.category ?? null,
                intervalMonths: task.intervalMonths,
                resultId: result?.resultId ?? null,
                status,
                findings: result?.findings ?? null,
                engineer: result?.engineer ?? null,
            }
        })

        return {
            pmId: pmRow.pmId,
            serialNumber: pmRow.serialNumber ?? null,
            siteName: pmRow.siteName ?? null,
            systemName: pmRow.systemName ?? null,
            intervalMonths: pmRow.intervalMonths,
            physicsHandOver: pmRow.physicsHandOver,
            startAt: pmRow.startAt,
            completedAt: pmRow.completedAt ?? null,
            assignedEngineerIds: assignedRows
                .map((row) => row.engineerId)
                .filter((id): id is number => id !== null),
            tasks,
        }
    })

export const savePmTaskResult = authServerFn({ method: 'POST' })
    .inputValidator((data: {
        pmInstanceId: number
        taskId: number
        status: 'Pass' | 'Fail' | 'N/A'
        findings?: string | null
        engineer?: string | null
    }) => {
        if (!data.pmInstanceId || !data.taskId) {
            throw new Error('PM record and task are required')
        }
        if (!['Pass', 'Fail', 'N/A'].includes(data.status)) {
            throw new Error('Status must be Pass, Fail, or N/A')
        }
        return data
    })
    .handler(async ({ data }) => {
        const { db, assetPmResults, eq, and, isNull } = await getPmDbDeps()
        const { requirePermission } = await import('../lib/auth-guards.server')

        await requirePermission('pmInstances', 'update')

        const [existing] = await db
            .select({ id: assetPmResults.id })
            .from(assetPmResults)
            .where(
                and(
                    eq(assetPmResults.pmInstanceId, data.pmInstanceId),
                    eq(assetPmResults.taskId, data.taskId),
                    isNull(assetPmResults.deletedAt),
                ),
            )
            .limit(1)

        if (existing) {
            await db
                .update(assetPmResults)
                .set({
                    status: data.status,
                    findings: data.findings ?? null,
                    engineer: data.engineer ?? null,
                })
                .where(eq(assetPmResults.id, existing.id))
            return { id: existing.id }
        }

        const [created] = await db
            .insert(assetPmResults)
            .values({
                pmInstanceId: data.pmInstanceId,
                taskId: data.taskId,
                status: data.status,
                findings: data.findings ?? null,
                engineer: data.engineer ?? null,
            })
            .returning({ id: assetPmResults.id })

        return { id: created.id }
    })

export const updatePmEngineers = authServerFn({ method: 'POST' })
    .inputValidator((data: { pmId: number; engineerIds: number[] }) => {
        if (!data.pmId) {
            throw new Error('PM record is required')
        }
        return {
            pmId: data.pmId,
            engineerIds: Array.from(new Set(data.engineerIds.filter((id) => Number.isInteger(id) && id > 0))),
        }
    })
    .handler(async ({ data }) => {
        const { db, pmEngineers, eq } = await getPmDbDeps()
        const { requirePermission } = await import('../lib/auth-guards.server')

        await requirePermission('pmInstances', 'update')

        await db.delete(pmEngineers).where(eq(pmEngineers.pmInstanceId, data.pmId))

        if (data.engineerIds.length > 0) {
            await db.insert(pmEngineers).values(
                data.engineerIds.map((engineerId) => ({
                    pmInstanceId: data.pmId,
                    engineerId,
                })),
            )
        }

        return { ok: true }
    })

export const updatePmPhysicsHandOver = authServerFn({ method: 'POST' })
    .inputValidator((data: { pmId: number; physicsHandOver: string }) => {
        if (!data.pmId) {
            throw new Error('PM record is required')
        }
        if (!data.physicsHandOver?.trim()) {
            throw new Error('Physics handover is required')
        }
        return {
            pmId: data.pmId,
            physicsHandOver: data.physicsHandOver.trim(),
        }
    })
    .handler(async ({ data }) => {
        const { db, assetPm, eq } = await getPmDbDeps()
        const { requirePermission } = await import('../lib/auth-guards.server')

        await requirePermission('pmInstances', 'update')

        await db
            .update(assetPm)
            .set({ physicsHandOver: data.physicsHandOver })
            .where(eq(assetPm.id, data.pmId))

        return { ok: true }
    })

export const completePmInstance = authServerFn({ method: 'POST' })
    .inputValidator((data: { pmId: number }) => {
        if (!data.pmId) {
            throw new Error('PM record is required')
        }
        return data
    })
    .handler(async ({ data }) => {
        const { db, assetPm, eq } = await getPmDbDeps()
        const { requirePermission } = await import('../lib/auth-guards.server')

        await requirePermission('pmInstances', 'update')

        await db
            .update(assetPm)
            .set({ completedAt: new Date().toISOString() })
            .where(eq(assetPm.id, data.pmId))

        return { completed: true }
    })

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
            physicsHandOver: 'Pending',
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
