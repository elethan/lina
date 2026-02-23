/**
 * Dev Seed Script
 *
 * Seeds auth user + domain data for local development.
 * Run with: npx tsx src/db/seed-dev.ts
 */
import { auth } from '../lib/auth'
import { db } from './client'
import {
    sites,
    systems,
    engineers,
    assets,
    userRequests,
    workOrders,
    workOrderRequests,
    pmTasks,
} from './schema'

// ── 1. Auth User ──────────────────────────────────────────────
async function seedDevUser() {
    const email = 'super@lina.com'
    const password = 'genesiscare'
    const name = 'Super Admin'

    console.log(`🔑 Seeding dev user: ${email}...`)

    try {
        const existing = await auth.api.signInEmail({
            body: { email, password },
        })
        if (existing) {
            console.log('   Dev user already exists and credentials are valid.')
            return
        }
    } catch {
        // User doesn't exist or wrong password — proceed to create
    }

    try {
        await auth.api.signUpEmail({
            body: { email, password, name },
        })
        console.log('   Dev user created successfully!')
        console.log(`   Email:    ${email}`)
        console.log(`   Password: ${password}`)
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        if (message.includes('already exists') || message.includes('UNIQUE constraint')) {
            console.log('   Dev user already exists.')
        } else {
            console.error('   Failed to create dev user:', message)
            process.exit(1)
        }
    }
}

// ── 2. Domain Data ────────────────────────────────────────────
async function seedDomainData() {
    console.log('\n📦 Seeding domain data...')

    // --- Sites ---
    const siteRows = await db
        .insert(sites)
        .values([
            { name: 'GenesisCare Oxford' },
            { name: 'GenesisCare Chelmsford' },
            { name: 'GenesisCare Bristol' },
        ])
        .onConflictDoNothing()
        .returning()
    console.log(`   Sites: ${siteRows.length} inserted`)

    // --- Systems ---
    const systemRows = await db
        .insert(systems)
        .values([
            { name: 'Magnetron' },
            { name: 'Thyratron' },
            { name: 'Cooling System' },
            { name: 'Beam Transport' },
            { name: 'Patient Positioning' },
            { name: 'MR Imaging' },
            { name: 'RF System' },
        ])
        .onConflictDoNothing()
        .returning()
    console.log(`   Systems: ${systemRows.length} inserted`)

    // --- Engineers ---
    const engineerRows = await db
        .insert(engineers)
        .values([
            { firstName: 'Thanos', lastName: 'Papageorgiou' },
            { firstName: 'James', lastName: 'Allington' },
            { firstName: 'Abishek', lastName: 'Sharma' },
        ])
        .returning()
    console.log(`   Engineers: ${engineerRows.length} inserted`)

    const [thanos, allington, abishek] = engineerRows

    // --- Assets (Elekta Linacs & MR-Linac) ---
    const assetRows = await db
        .insert(assets)
        .values([
            {
                serialNumber: 'ELK-VHD-OX-001',
                modelName: 'Elekta Versa HD',
                warrantyYears: 5,
                status: 'Operational',
                siteId: siteRows[0]?.id,
            },
            {
                serialNumber: 'ELK-INF-OX-002',
                modelName: 'Elekta Infinity',
                warrantyYears: 4,
                status: 'Operational',
                siteId: siteRows[0]?.id,
            },
            {
                serialNumber: 'ELK-UNI-CH-001',
                modelName: 'Elekta Unity MR-Linac',
                warrantyYears: 5,
                status: 'Operational',
                siteId: siteRows[1]?.id,
            },
            {
                serialNumber: 'ELK-VHD-CH-002',
                modelName: 'Elekta Versa HD',
                warrantyYears: 3,
                status: 'Under Maintenance',
                siteId: siteRows[1]?.id,
            },
            {
                serialNumber: 'ELK-UNI-BR-001',
                modelName: 'Elekta Unity MR-Linac',
                warrantyYears: 5,
                status: 'Operational',
                siteId: siteRows[2]?.id,
            },
            {
                serialNumber: 'ELK-INF-BR-002',
                modelName: 'Elekta Infinity',
                warrantyYears: 4,
                status: 'Operational',
                siteId: siteRows[2]?.id,
            },
        ])
        .onConflictDoNothing()
        .returning()
    console.log(`   Assets: ${assetRows.length} inserted`)

    // --- PM Tasks ---
    const pmTaskRows = await db
        .insert(pmTasks)
        .values([
            { systemId: systemRows[0]?.id, instruction: 'Inspect magnetron output power and pulse stability', docSection: 'PM-MAG-01', intervalMonths: 6 },
            { systemId: systemRows[1]?.id, instruction: 'Check thyratron pulse shape and timing', docSection: 'PM-THY-01', intervalMonths: 12 },
            { systemId: systemRows[2]?.id, instruction: 'Clean cooling filters and verify flow rate', docSection: 'PM-COOL-01', intervalMonths: 3 },
            { systemId: systemRows[3]?.id, instruction: 'Verify beam symmetry, flatness and output', docSection: 'PM-BT-01', intervalMonths: 6 },
            { systemId: systemRows[5]?.id, instruction: 'MR imaging QA — check SNR, geometric distortion', docSection: 'PM-MRI-01', intervalMonths: 1 },
            { systemId: systemRows[6]?.id, instruction: 'RF system calibration and coil inspection', docSection: 'PM-RF-01', intervalMonths: 6 },
        ])
        .returning()
    console.log(`   PM Tasks: ${pmTaskRows.length} inserted`)

    // --- User Requests (mix of assigned / unassigned) ---
    const requestRows = await db
        .insert(userRequests)
        .values([
            {
                assetId: assetRows[0]?.id,
                systemId: systemRows[0]?.id,
                reportedBy: 'Dr. Sarah Mitchell',
                commentText: 'Unusual noise during beam-on at 6MV. Please investigate.',
                status: 'Open',
                engineerId: thanos?.id,
            },
            {
                assetId: assetRows[2]?.id,
                systemId: systemRows[5]?.id,
                reportedBy: 'RTT James Cooper',
                commentText: 'MR image artefacts appearing on daily QA scans.',
                status: 'Open',
                engineerId: null,
            },
            {
                assetId: assetRows[3]?.id,
                systemId: systemRows[2]?.id,
                reportedBy: 'RTT Emily Watson',
                commentText: 'Cooling water temperature reading higher than normal after long treatment run.',
                status: 'Open',
                engineerId: allington?.id,
            },
            {
                assetId: assetRows[4]?.id,
                systemId: systemRows[6]?.id,
                reportedBy: 'Dr. Richard Hayes',
                commentText: 'RF coil intermittently dropping signal during treatment.',
                status: 'Open',
                engineerId: null,
            },
            {
                assetId: assetRows[1]?.id,
                systemId: systemRows[4]?.id,
                reportedBy: 'RTT Lucy Chen',
                commentText: 'HexaPOD couch top not responding to remote corrections.',
                status: 'Open',
                engineerId: abishek?.id,
            },
            {
                assetId: assetRows[5]?.id,
                systemId: systemRows[1]?.id,
                reportedBy: 'Dr. Sarah Mitchell',
                commentText: 'Beam dropout during VMAT delivery — suspected thyratron issue.',
                status: 'Open',
                engineerId: null,
            },
        ])
        .returning()
    console.log(`   User Requests: ${requestRows.length} inserted (${requestRows.filter(r => r.engineerId).length} assigned, ${requestRows.filter(r => !r.engineerId).length} unassigned)`)

    // --- Work Orders ---
    const woRows = await db
        .insert(workOrders)
        .values([
            {
                assetId: assetRows[0]?.id,
                description: 'Investigate magnetron noise on Versa HD (Oxford) — reported by clinical staff.',
                status: 'Open',
            },
            {
                assetId: assetRows[3]?.id,
                description: 'Cooling system investigation on Versa HD (Chelmsford) — elevated temps.',
                status: 'Open',
            },
        ])
        .returning()
    console.log(`   Work Orders: ${woRows.length} inserted`)

    // Link requests to work orders
    if (woRows[0] && requestRows[0]) {
        await db.insert(workOrderRequests).values({ woId: woRows[0].id, requestId: requestRows[0].id })
        console.log(`   Linked Request #${requestRows[0].id} → WO #${woRows[0].id}`)
    }
    if (woRows[1] && requestRows[2]) {
        await db.insert(workOrderRequests).values({ woId: woRows[1].id, requestId: requestRows[2].id })
        console.log(`   Linked Request #${requestRows[2].id} → WO #${woRows[1].id}`)
    }

    console.log('\n✅ Domain data seeded successfully!')
}

// ── Run ───────────────────────────────────────────────────────
async function main() {
    try {
        await seedDevUser()
        await seedDomainData()
    } catch (err) {
        console.error('❌ Seed failed:', err)
        process.exit(1)
    }
}

main()
