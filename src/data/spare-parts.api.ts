import { authServerFn } from '../lib/server-utils'

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

export type SparePartRow = {
    id: number
    code: string
    name: string
    siteId: number
    siteName: string | null
    quantity: number
    locationId: number | null
    locationName: string | null
}

export type SparePartOption = {
    id: number
    name: string
}

export type SparePartOptionsPayload = {
    sites: SparePartOption[]
    locations: SparePartOption[]
}

async function getSparePartsDbDeps() {
    const [dbMod, schemaMod, ormMod] = await Promise.all([
        import('../db/client'),
        import('../db/schema'),
        import('drizzle-orm'),
    ])

    const { db } = dbMod
    const { spareParts, sites, locations } = schemaMod
    const { eq, asc, and, inArray, isNull } = ormMod

    return {
        db,
        spareParts,
        sites,
        locations,
        eq,
        asc,
        and,
        inArray,
        isNull,
    }
}

function ensureSparePartsPermission(action: 'read' | 'create' | 'update' | 'delete') {
    return import('../lib/auth-guards.server').then(({ requirePermission }) =>
        requirePermission('spareParts', action),
    )
}

async function ensureSiteExists(
    deps: Awaited<ReturnType<typeof getSparePartsDbDeps>>,
    siteId: number,
) {
    const { db, sites, eq, and, isNull } = deps

    const [site] = await db
        .select({ id: sites.id })
        .from(sites)
        .where(and(eq(sites.id, siteId), isNull(sites.deletedAt)))
        .limit(1)

    if (!site) {
        throw new Error('Site not found')
    }
}

async function ensureLocationExists(
    deps: Awaited<ReturnType<typeof getSparePartsDbDeps>>,
    locationId: number | null,
) {
    if (locationId === null) {
        return
    }

    const { db, locations, eq, and, isNull } = deps
    const [location] = await db
        .select({ id: locations.id })
        .from(locations)
        .where(and(eq(locations.id, locationId), isNull(locations.deletedAt)))
        .limit(1)

    if (!location) {
        throw new Error('Location not found')
    }
}

async function getExistingSparePart(
    deps: Awaited<ReturnType<typeof getSparePartsDbDeps>>,
    partId: number,
) {
    const { db, spareParts, eq, and, isNull } = deps

    const [part] = await db
        .select({
            id: spareParts.id,
            code: spareParts.code,
            name: spareParts.name,
            siteId: spareParts.siteId,
            quantity: spareParts.quantity,
            locationId: spareParts.locationId,
        })
        .from(spareParts)
        .where(and(eq(spareParts.id, partId), isNull(spareParts.deletedAt)))
        .limit(1)

    return part ?? null
}

export const fetchSpareParts = authServerFn({ method: 'GET' }).handler(
    async (): Promise<SparePartRow[]> => {
        await ensureSparePartsPermission('read')
        const { db, spareParts, sites, locations, eq, asc, isNull } = await getSparePartsDbDeps()

        return db
            .select({
                id: spareParts.id,
                code: spareParts.code,
                name: spareParts.name,
                siteId: spareParts.siteId,
                siteName: sites.name,
                quantity: spareParts.quantity,
                locationId: spareParts.locationId,
                locationName: locations.name,
            })
            .from(spareParts)
            .innerJoin(sites, eq(spareParts.siteId, sites.id))
            .leftJoin(locations, eq(spareParts.locationId, locations.id))
            .where(isNull(spareParts.deletedAt))
            .orderBy(asc(sites.name), asc(spareParts.name), asc(spareParts.code))
    },
)

export const fetchSparePartOptions = authServerFn({ method: 'GET' }).handler(
    async (): Promise<SparePartOptionsPayload> => {
        await ensureSparePartsPermission('read')
        const { db, sites, locations, asc, isNull } = await getSparePartsDbDeps()

        const [siteRows, locationRows] = await Promise.all([
            db
                .select({ id: sites.id, name: sites.name })
                .from(sites)
                .where(isNull(sites.deletedAt))
                .orderBy(asc(sites.name)),
            db
                .select({ id: locations.id, name: locations.name })
                .from(locations)
                .where(isNull(locations.deletedAt))
                .orderBy(asc(locations.name)),
        ])

        return {
            sites: siteRows,
            locations: locationRows,
        }
    },
)

export const createSparePart = authServerFn({ method: 'POST' })
    .inputValidator((data: {
        code: string
        name: string
        siteId: number
        quantity?: number
        locationId?: number | null
    }) => {
        const code = data.code?.trim()
        const name = data.name?.trim()
        const quantity = data.quantity ?? 0

        if (!code) throw new Error('Code is required')
        if (!name) throw new Error('Name is required')
        if (!data.siteId) throw new Error('Site is required')
        if (!Number.isInteger(quantity) || quantity < 0) {
            throw new Error('Quantity must be a non-negative integer')
        }

        return {
            code,
            name,
            siteId: Number(data.siteId),
            quantity,
            locationId: data.locationId ?? null,
        }
    })
    .handler(async ({ data }) => {
        const [user, { logger }] = await Promise.all([
            ensureSparePartsPermission('create'),
            import('../lib/logger'),
        ])
        const deps = await getSparePartsDbDeps()

        await ensureSiteExists(deps, data.siteId)
        await ensureLocationExists(deps, data.locationId)

        const [part] = await deps.db
            .insert(deps.spareParts)
            .values({
                code: data.code,
                name: data.name,
                siteId: data.siteId,
                quantity: data.quantity,
                locationId: data.locationId,
            })
            .returning({ id: deps.spareParts.id })

        logger.info('SPARE_PART_CREATED', {
            partId: part.id,
            code: data.code,
            name: data.name,
            siteId: data.siteId,
            quantity: data.quantity,
            locationId: data.locationId,
            ...withActor(user),
        })

        return { success: true, partId: part.id }
    })

export const updateSparePart = authServerFn({ method: 'POST' })
    .inputValidator((data: {
        partId: number
        code?: string
        name?: string
        siteId?: number
        quantity?: number
        locationId?: number | null
    }) => {
        if (!data.partId) throw new Error('Part ID is required')

        const payload: {
            partId: number
            code?: string
            name?: string
            siteId?: number
            quantity?: number
            locationId?: number | null
        } = { partId: Number(data.partId) }

        if (data.code !== undefined) {
            const code = data.code.trim()
            if (!code) throw new Error('Code is required')
            payload.code = code
        }

        if (data.name !== undefined) {
            const name = data.name.trim()
            if (!name) throw new Error('Name is required')
            payload.name = name
        }

        if (data.siteId !== undefined) {
            if (!data.siteId) throw new Error('Site is required')
            payload.siteId = Number(data.siteId)
        }

        if (data.quantity !== undefined) {
            if (!Number.isInteger(data.quantity) || data.quantity < 0) {
                throw new Error('Quantity must be a non-negative integer')
            }
            payload.quantity = data.quantity
        }

        if (Object.prototype.hasOwnProperty.call(data, 'locationId')) {
            payload.locationId = data.locationId ?? null
        }

        if (Object.keys(payload).length === 1) {
            throw new Error('No changes provided')
        }

        return payload
    })
    .handler(async ({ data }) => {
        const [user, { logger }] = await Promise.all([
            ensureSparePartsPermission('update'),
            import('../lib/logger'),
        ])
        const deps = await getSparePartsDbDeps()
        const existing = await getExistingSparePart(deps, data.partId)

        if (!existing) {
            throw new Error('Spare part not found')
        }

        if (data.siteId !== undefined) {
            await ensureSiteExists(deps, data.siteId)
        }

        if (Object.prototype.hasOwnProperty.call(data, 'locationId')) {
            await ensureLocationExists(deps, data.locationId ?? null)
        }

        const updateSet: Partial<typeof deps.spareParts.$inferInsert> = {}
        const changes: Record<string, { before: unknown; after: unknown }> = {}

        if (data.code !== undefined && data.code !== existing.code) {
            updateSet.code = data.code
            changes.code = { before: existing.code, after: data.code }
        }

        if (data.name !== undefined && data.name !== existing.name) {
            updateSet.name = data.name
            changes.name = { before: existing.name, after: data.name }
        }

        if (data.siteId !== undefined && data.siteId !== existing.siteId) {
            updateSet.siteId = data.siteId
            changes.siteId = { before: existing.siteId, after: data.siteId }
        }

        if (data.quantity !== undefined && data.quantity !== existing.quantity) {
            updateSet.quantity = data.quantity
            changes.quantity = { before: existing.quantity, after: data.quantity }
        }

        if (
            Object.prototype.hasOwnProperty.call(data, 'locationId') &&
            (data.locationId ?? null) !== existing.locationId
        ) {
            updateSet.locationId = data.locationId ?? null
            changes.locationId = { before: existing.locationId, after: data.locationId ?? null }
        }

        if (Object.keys(updateSet).length === 0) {
            return { success: true, unchanged: true }
        }

        await deps.db
            .update(deps.spareParts)
            .set(updateSet)
            .where(deps.eq(deps.spareParts.id, data.partId))

        logger.info('SPARE_PART_UPDATED', {
            partId: data.partId,
            changes,
            ...withActor(user),
        })

        return { success: true }
    })

export const deleteSparePart = authServerFn({ method: 'POST' })
    .inputValidator((data: { partId: number }) => {
        if (!data.partId) throw new Error('Part ID is required')
        return { partId: Number(data.partId) }
    })
    .handler(async ({ data }) => {
        const [user, { logger }] = await Promise.all([
            ensureSparePartsPermission('delete'),
            import('../lib/logger'),
        ])
        const deps = await getSparePartsDbDeps()
        const existing = await getExistingSparePart(deps, data.partId)

        if (!existing) {
            throw new Error('Spare part not found')
        }

        await deps.db
            .update(deps.spareParts)
            .set({ deletedAt: new Date().toISOString() })
            .where(deps.eq(deps.spareParts.id, data.partId))

        logger.info('SPARE_PART_DELETED', {
            partId: data.partId,
            code: existing.code,
            name: existing.name,
            siteId: existing.siteId,
            quantity: existing.quantity,
            locationId: existing.locationId,
            ...withActor(user),
        })

        return { success: true }
    })

export const moveSpareParts = authServerFn({ method: 'POST' })
    .inputValidator((data: { partIds: number[]; siteId: number }) => {
        const partIds = Array.from(
            new Set(
                (data.partIds ?? [])
                    .map((partId) => Number(partId))
                    .filter((partId) => Number.isInteger(partId) && partId > 0),
            ),
        )

        if (partIds.length === 0) {
            throw new Error('Select at least one spare part')
        }

        if (!data.siteId) {
            throw new Error('Site is required')
        }

        return {
            partIds,
            siteId: Number(data.siteId),
        }
    })
    .handler(async ({ data }) => {
        const [user, { logger }] = await Promise.all([
            ensureSparePartsPermission('update'),
            import('../lib/logger'),
        ])
        const deps = await getSparePartsDbDeps()

        await ensureSiteExists(deps, data.siteId)

        const existingParts = await deps.db
            .select({
                id: deps.spareParts.id,
                code: deps.spareParts.code,
                siteId: deps.spareParts.siteId,
            })
            .from(deps.spareParts)
            .where(deps.and(deps.inArray(deps.spareParts.id, data.partIds), deps.isNull(deps.spareParts.deletedAt)))

        if (existingParts.length !== data.partIds.length) {
            throw new Error('One or more spare parts could not be found')
        }

        await deps.db
            .update(deps.spareParts)
            .set({ siteId: data.siteId })
            .where(deps.inArray(deps.spareParts.id, data.partIds))

        logger.info('SPARE_PARTS_MOVED', {
            partIds: data.partIds,
            targetSiteId: data.siteId,
            changes: existingParts.map((part) => ({
                partId: part.id,
                code: part.code,
                fromSiteId: part.siteId,
                toSiteId: data.siteId,
            })),
            ...withActor(user),
        })

        return { success: true, movedCount: existingParts.length }
    })