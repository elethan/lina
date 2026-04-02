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

if (process.env.MICROSOFT_GROUP_USER_IDS && !process.env.MICROSOFT_GROUP_THERAPIST_IDS) {
    process.stderr.write(
        '[STARTUP_WARN] MICROSOFT_GROUP_USER_IDS is deprecated. Use MICROSOFT_GROUP_THERAPIST_IDS instead.\n',
    )
}

// 3. Provisioning visibility
if (process.env.NODE_ENV === 'production') {
    const hasBootstrap =
        !!process.env.BOOTSTRAP_ADMIN_EMAILS ||
        !!process.env.BOOTSTRAP_THERAPIST_EMAILS ||
        !!process.env.BOOTSTRAP_USER_EMAILS
    if (!hasBootstrap) {
        process.stderr.write(
            '[STARTUP_WARN] Neither BOOTSTRAP_ADMIN_EMAILS nor BOOTSTRAP_THERAPIST_EMAILS is set. ' +
            'New account creation is disabled until at least one bootstrap allowlist is configured.\n',
        )
    }
}

if (process.env.BOOTSTRAP_USER_EMAILS && !process.env.BOOTSTRAP_THERAPIST_EMAILS) {
    process.stderr.write(
        '[STARTUP_WARN] BOOTSTRAP_USER_EMAILS is deprecated. Use BOOTSTRAP_THERAPIST_EMAILS instead.\n',
    )
}
