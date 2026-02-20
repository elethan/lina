/**
 * Dev Seed Script
 *
 * Creates a test user: super@lina / test
 * Run with: npx tsx src/db/seed-dev.ts
 */
import { auth } from '../lib/auth'

async function seedDevUser() {
    const email = 'super@lina.com'
    const password = 'genesiscare'
    const name = 'Super Admin'

    console.log(`Seeding dev user: ${email}...`)

    try {
        // Check if the user already exists
        const existing = await auth.api.signInEmail({
            body: { email, password },
        })
        if (existing) {
            console.log('Dev user already exists and credentials are valid.')
            return
        }
    } catch {
        // User doesn't exist or wrong password — proceed to create
    }

    try {
        await auth.api.signUpEmail({
            body: {
                email,
                password,
                name,
            },
        })
        console.log('Dev user created successfully!')
        console.log(`  Email:    ${email}`)
        console.log(`  Password: ${password}`)
        console.log(`  Name:     ${name}`)
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        if (message.includes('already exists') || message.includes('UNIQUE constraint')) {
            console.log('Dev user already exists.')
        } else {
            console.error('Failed to create dev user:', message)
            process.exit(1)
        }
    }
}

seedDevUser()
