// src/lib/env.ts
// Fail-fast environment validation — imported as a side-effect from auth.ts
// so that critical misconfiguration is caught before the server accepts requests.

function fail(message: string): never {
    process.stderr.write(`[STARTUP_ERROR] ${message}\n`)
    process.exit(1)
}

// 1. BETTER_AUTH_SECRET must be present in production; without it sessions cannot be
//    signed securely.  In dev Better Auth auto-generates one, so we only warn.
const secret = process.env.BETTER_AUTH_SECRET
if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === 'production') {
        fail(
            'BETTER_AUTH_SECRET is missing or too short (minimum 32 chars). ' +
            'Generate one with: openssl rand -hex 32',
        )
    } else {
        process.stderr.write(
            '[STARTUP_WARN] BETTER_AUTH_SECRET is not set — using auto-generated secret (sessions reset on restart).\n',
        )
    }
}

// 2. Microsoft SSO: all-or-nothing.
//    Partial config is silently broken — Better Auth omits the provider entirely
//    when env vars are absent, so having only some vars set is a likely misconfiguration.
const MS_VARS = ['MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET', 'MICROSOFT_TENANT_ID'] as const
const msSet = MS_VARS.filter((v) => !!process.env[v])
if (msSet.length > 0 && msSet.length < MS_VARS.length) {
    fail(
        `Incomplete Microsoft SSO config. Set all three or none: ${MS_VARS.join(', ')}. ` +
        `Currently set: ${msSet.join(', ')}.`,
    )
}

// 3. Production guardrails
if (process.env.NODE_ENV === 'production') {
    const hasBootstrap =
        !!process.env.BOOTSTRAP_ADMIN_EMAILS || !!process.env.BOOTSTRAP_USER_EMAILS
    if (!hasBootstrap) {
        process.stderr.write(
            '[STARTUP_WARN] Neither BOOTSTRAP_ADMIN_EMAILS nor BOOTSTRAP_USER_EMAILS is set. ' +
            'In production all new accounts will use the default role — set these lists to restrict sign-up.\n',
        )
    }
}
