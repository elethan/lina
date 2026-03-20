/**
 * PM CSV Seed Script
 *
 * Seeds sites, systems, assets, asset-system links, and PM tasks from pm-tasks.csv.
 * Run with: npm run seed:pm-csv
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { eq } from 'drizzle-orm'
import { auth } from '../lib/auth'
import { db } from './client'
import { assetPm, assetSystems, assets, engineers, pmTasks, sites, systems, user, userRequests, workOrders } from './schema'

type CsvTaskRow = {
  sectionId: string
  taskTitle: string
  system: string
  category: string
  intervalMonthsRaw: string
  rowNumber: number
}

type SeedRole = 'admin' | 'user' | 'scientist'

const REQUIRED_HEADERS = [
  'Section ID',
  'Task Title',
  'System',
  'Category',
  'Check Interval (months)',
] as const

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

function normalizeKey(value: string) {
  return normalizeText(value).toLowerCase()
}

function parseCsv(content: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i]
    const next = content[i + 1]

    if (ch === '"') {
      if (inQuotes && next === '"') {
        cell += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (!inQuotes && ch === ',') {
      row.push(cell)
      cell = ''
      continue
    }

    if (!inQuotes && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && next === '\n') {
        i += 1
      }
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      continue
    }

    cell += ch
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }

  return rows.filter((r) => r.some((value) => value.trim().length > 0))
}

function loadCsvRows(): CsvTaskRow[] {
  const csvPath = resolve(process.cwd(), 'pm-tasks.csv')
  const content = readFileSync(csvPath, 'utf-8')
  const records = parseCsv(content)

  if (records.length < 2) {
    throw new Error('pm-tasks.csv has no data rows')
  }

  const headerRow = records[0].map((h) => normalizeText(h))
  const headerIndex = new Map<string, number>()
  for (let i = 0; i < headerRow.length; i += 1) {
    headerIndex.set(headerRow[i], i)
  }

  const missingHeaders = REQUIRED_HEADERS.filter((header) => !headerIndex.has(header))
  if (missingHeaders.length > 0) {
    throw new Error(`pm-tasks.csv is missing required headers: ${missingHeaders.join(', ')}`)
  }

  return records.slice(1).map((row, idx) => ({
    sectionId: normalizeText(row[headerIndex.get('Section ID')!] ?? ''),
    taskTitle: normalizeText(row[headerIndex.get('Task Title')!] ?? ''),
    system: normalizeText(row[headerIndex.get('System')!] ?? ''),
    category: normalizeText(row[headerIndex.get('Category')!] ?? ''),
    intervalMonthsRaw: normalizeText(row[headerIndex.get('Check Interval (months)')!] ?? ''),
    rowNumber: idx + 2,
  }))
}

function assertNoGenesiscareInAssets(seedAssets: Array<{ modelName: string }>) {
  const hasForbiddenAssetName = seedAssets.some((asset) => /genesiscare/i.test(asset.modelName))
  if (hasForbiddenAssetName) {
    throw new Error('Asset model names must not include "genesiscare"')
  }
}

function assertLinacSerialPattern(seedAssets: Array<{ serialNumber: string }>) {
  const invalid = seedAssets.find((asset) => !/^15\d{4}$/.test(asset.serialNumber))
  if (invalid) {
    throw new Error(`Invalid Elekta linac serial number: ${invalid.serialNumber}. Expected 15xxxx`)
  }
}

function pickDefaultSystemId(systemRows: Array<{ id: number; name: string }>): number | undefined {
  const linac = systemRows.find((row) => normalizeKey(row.name) === 'linac')
  return linac?.id ?? systemRows[0]?.id
}

async function seedAuthUsers() {
  const seedUsers: Array<{
    email: string
    password: string
    name: string
    role: SeedRole
  }> = [
    {
      email: 'admin@lina.com',
      password: 'linaAdmin',
      name: 'Lina Admin',
      role: 'admin',
    },
    {
      email: 'therapist@lina.com',
      password: 'therapist',
      name: 'Lina Therapist',
      role: 'user',
    },
    {
      email: 'scientist@lina.com',
      password: 'scientist',
      name: 'Lina Scientist',
      role: 'scientist',
    },
  ]

  for (const seedUser of seedUsers) {
    const existing = await db
      .select()
      .from(user)
      .where(eq(user.email, seedUser.email))
      .limit(1)

    if (existing.length === 0) {
      await auth.api.signUpEmail({
        body: {
          email: seedUser.email,
          password: seedUser.password,
          name: seedUser.name,
        },
      })
    }

    await db
      .update(user)
      .set({ role: seedUser.role })
      .where(eq(user.email, seedUser.email))
  }

  console.log(`Auth users ensured: ${seedUsers.length}`)
}

async function seedEngineers() {
  const targetEngineers = [
    { firstName: 'Guy', lastName: 'Fielden', userId: null },
    { firstName: 'Thanos', lastName: 'Papageorgiou', userId: null },
    { firstName: 'Allington', lastName: 'Butau', userId: null },
    { firstName: 'Abishek', lastName: 'Verma', userId: null },
    { firstName: 'Jason', lastName: 'Cammish', userId: null },
    { firstName: 'Phil', lastName: 'Yeo', userId: null },
    { firstName: 'Hersi', lastName: 'Mohamud', userId: null },
  ]

  const existingRows = await db.select().from(engineers)
  const existingKeys = new Set(existingRows.map((row) => `${row.firstName}|${row.lastName}`))
  const inserts = targetEngineers.filter((eng) => !existingKeys.has(`${eng.firstName}|${eng.lastName}`))

  if (inserts.length > 0) {
    await db.insert(engineers).values(inserts)
  }

  console.log(`Engineers ensured: ${targetEngineers.length}`)
}

async function seedFromCsv() {
  console.log('Starting CSV seed...')
  await seedAuthUsers()
  await seedEngineers()

  const csvRows = loadCsvRows()
  console.log(`CSV rows loaded: ${csvRows.length}`)

  const siteRows = await db
    .insert(sites)
    .values([
      { name: 'Oxford' },
      { name: 'Chelmsford' },
      { name: 'Bristol' },
    ])
    .onConflictDoNothing()
    .returning()

  const allSiteRows = siteRows.length > 0 ? siteRows : await db.select().from(sites)
  console.log(`Sites available: ${allSiteRows.length}`)

  // Dedupe systems case/whitespace-insensitively so CSV inconsistencies do not create duplicate system rows.
  const csvSystemNameByKey = new Map<string, string>()
  for (const row of csvRows) {
    if (!row.system) {
      continue
    }
    const key = normalizeKey(row.system)
    if (!csvSystemNameByKey.has(key)) {
      csvSystemNameByKey.set(key, row.system)
    }
  }
  const uniqueSystemNames = Array.from(csvSystemNameByKey.values())

  await db
    .insert(systems)
    .values(uniqueSystemNames.map((name) => ({ name })))
    .onConflictDoNothing()

  const allSystemRows = await db.select().from(systems)
  const systemByKey = new Map(allSystemRows.map((row) => [normalizeKey(row.name), row]))
  const csvSystemRows = uniqueSystemNames
    .map((name) => systemByKey.get(normalizeKey(name)))
    .filter((row): row is NonNullable<typeof row> => row !== undefined)
  console.log(`Systems available: ${allSystemRows.length}`)

  const siteByName = new Map(allSiteRows.map((row) => [row.name, row]))
  const seedAssets = [
    { serialNumber: '150101', modelName: 'Elekta Versa HD', siteName: 'Oxford', warrantyYears: 5, status: 'Operational' },
    { serialNumber: '150102', modelName: 'Elekta Infinity', siteName: 'Oxford', warrantyYears: 4, status: 'Operational' },
    { serialNumber: '150201', modelName: 'Elekta Versa HD', siteName: 'Chelmsford', warrantyYears: 5, status: 'Operational' },
    { serialNumber: '150202', modelName: 'Elekta Infinity', siteName: 'Chelmsford', warrantyYears: 4, status: 'Operational' },
    { serialNumber: '150301', modelName: 'Elekta Versa HD', siteName: 'Bristol', warrantyYears: 5, status: 'Operational' },
    { serialNumber: '150302', modelName: 'Elekta Infinity', siteName: 'Bristol', warrantyYears: 4, status: 'Operational' },
  ]

  assertNoGenesiscareInAssets(seedAssets)
  assertLinacSerialPattern(seedAssets)

  const insertedAssets = await db
    .insert(assets)
    .values(
      seedAssets.map((asset) => ({
        serialNumber: asset.serialNumber,
        modelName: asset.modelName,
        warrantyYears: asset.warrantyYears,
        status: asset.status,
        siteId: siteByName.get(asset.siteName)?.id,
      })),
    )
    .onConflictDoNothing()
    .returning()

  const allAssets = insertedAssets.length > 0 ? insertedAssets : await db.select().from(assets)
  console.log(`Assets available: ${allAssets.length}`)

  const assetSystemRows = allAssets.flatMap((asset) =>
    csvSystemRows.map((systemRow) => ({ assetId: asset.id, systemId: systemRow.id })),
  )

  if (assetSystemRows.length > 0) {
    await db.insert(assetSystems).values(assetSystemRows).onConflictDoNothing()
  }
  console.log(`Asset-system links attempted: ${assetSystemRows.length}`)

  const requestPayloads = allAssets.flatMap((asset, assetIndex) => {
    const defaultSystemId = pickDefaultSystemId(csvSystemRows)
    return [
      {
        assetId: asset.id,
        systemId: defaultSystemId,
        reportedBy: 'RTT Duty Lead',
        commentText: `Intermittent console warning observed on asset ${asset.serialNumber}.`,
        status: 'Open',
      },
      {
        assetId: asset.id,
        systemId: defaultSystemId,
        reportedBy: 'Clinical Physicist',
        commentText: `Output trend drift check requested for asset ${asset.serialNumber}.`,
        status: assetIndex % 2 === 0 ? 'Open' : 'Closed',
      },
      {
        assetId: asset.id,
        systemId: defaultSystemId,
        reportedBy: 'Radiotherapy Supervisor',
        commentText: `Routine pre-treatment readiness concern logged for ${asset.serialNumber}.`,
        status: 'Open',
      },
    ]
  })

  await db.insert(userRequests).values(requestPayloads)
  console.log(`Requests inserted: ${requestPayloads.length}`)

  const workOrderPayloads = allAssets.flatMap((asset) => {
    const defaultSystemId = pickDefaultSystemId(csvSystemRows)
    return [
      {
        assetId: asset.id,
        systemId: defaultSystemId,
        description: `Investigate reported operational issue on ${asset.serialNumber}.`,
        physicsHandOver: 'Pending',
        status: 'Open',
      },
      {
        assetId: asset.id,
        systemId: defaultSystemId,
        description: `Perform corrective and verification checks on ${asset.serialNumber}.`,
        physicsHandOver: 'Pending',
        status: 'Open',
      },
    ]
  })

  await db.insert(workOrders).values(workOrderPayloads)
  console.log(`Work orders inserted: ${workOrderPayloads.length}`)

  const pmIntervals = [6, 12, 24, 36]
  const pmInstancePayloads = allAssets.flatMap((asset) =>
    csvSystemRows.flatMap((systemRow) =>
      pmIntervals.map((intervalMonths) => ({
        assetId: asset.id,
        systemId: systemRow.id,
        intervalMonths,
        physicsHandOver: 'Pending',
        startAt: new Date().toISOString(),
      })),
    ),
  )

  await db.insert(assetPm).values(pmInstancePayloads)
  console.log(`Asset PM instances inserted: ${pmInstancePayloads.length}`)

  const errors: string[] = []
  const dedupe = new Set<string>()

  const taskInserts: Array<{
    systemId: number
    instruction: string
    docSection: string
    category: string | null
    intervalMonths: number
  }> = []

  for (const row of csvRows) {
    if (!row.system) {
      errors.push(`Row ${row.rowNumber}: missing System`)
      continue
    }
    if (!row.taskTitle) {
      errors.push(`Row ${row.rowNumber}: missing Task Title`)
      continue
    }
    if (!row.sectionId) {
      errors.push(`Row ${row.rowNumber}: missing Section ID`)
      continue
    }

    const intervalMonths = Number.parseInt(row.intervalMonthsRaw, 10)
    if (!Number.isInteger(intervalMonths) || intervalMonths <= 0) {
      errors.push(`Row ${row.rowNumber}: invalid Check Interval (months) -> ${row.intervalMonthsRaw}`)
      continue
    }

    const system = systemByKey.get(normalizeKey(row.system))
    if (!system) {
      errors.push(`Row ${row.rowNumber}: unknown system -> ${row.system}`)
      continue
    }

    const category = row.category.length > 0 ? row.category : null
    const dedupeKey = [
      normalizeKey(row.system),
      intervalMonths,
      normalizeKey(row.taskTitle),
      normalizeKey(row.sectionId),
      normalizeKey(category ?? ''),
    ].join('|')

    if (dedupe.has(dedupeKey)) {
      continue
    }
    dedupe.add(dedupeKey)

    taskInserts.push({
      systemId: system.id,
      instruction: row.taskTitle,
      docSection: row.sectionId,
      category,
      intervalMonths,
    })
  }

  if (errors.length > 0) {
    console.error('CSV validation failed. Fix these rows first:')
    for (const message of errors.slice(0, 30)) {
      console.error(`  - ${message}`)
    }
    if (errors.length > 30) {
      console.error(`  ...and ${errors.length - 30} more`)
    }
    throw new Error(`Validation failed with ${errors.length} error(s)`)
  }

  const insertedTasks = await db.insert(pmTasks).values(taskInserts).returning()

  console.log(`PM tasks inserted: ${insertedTasks.length}`)
  console.log(`Seed complete. Parsed: ${csvRows.length}, Unique inserted: ${taskInserts.length}`)
}

seedFromCsv().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
