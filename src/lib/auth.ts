// src/lib/auth.ts
import './env'
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db/client";
import * as schema from "../db/schema";
import { logger } from "./logger";

type AppRole = "admin" | "engineer" | "scientist" | "user";

const parseCsvSet = (value?: string) => {
    return new Set(
        (value ?? "")
            .split(",")
            .map((token) => token.trim())
            .filter(Boolean),
    );
};

const normalizeGroups = (groups: unknown): string[] => {
    if (Array.isArray(groups)) {
        return groups.filter((entry): entry is string => typeof entry === "string");
    }

    if (typeof groups === "string") {
        return groups
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean);
    }

    return [];
};

const resolveRoleFromEntraProfile = (profile: Record<string, unknown>): AppRole => {
    const groups = normalizeGroups(profile.groups);

    // Group maps are read lazily (inside the function) to avoid startup crash when env vars absent
    const groupRoleMap: Record<Exclude<AppRole, "user">, Set<string>> = {
        admin: parseCsvSet(process.env.MICROSOFT_GROUP_ADMIN_IDS),
        engineer: parseCsvSet(process.env.MICROSOFT_GROUP_ENGINEER_IDS),
        scientist: parseCsvSet(process.env.MICROSOFT_GROUP_SCIENTIST_IDS),
    };
    const microsoftUserGroup = parseCsvSet(process.env.MICROSOFT_GROUP_USER_IDS);

    if (groups.some((groupId) => groupRoleMap.admin.has(groupId))) return "admin";
    if (groups.some((groupId) => groupRoleMap.engineer.has(groupId))) return "engineer";
    if (groups.some((groupId) => groupRoleMap.scientist.has(groupId))) return "scientist";
    if (groups.some((groupId) => microsoftUserGroup.has(groupId))) return "user";

    throw new Error("User is not in an authorized Entra group");
};

export const auth = betterAuth({
    // 1. Explicitly trust your magic domain
  trustedOrigins: ['https://46.101.53.201.sslip.io'], 
  
  advanced: {
    // 2. Tell Better Auth to trust Caddy's X-Forwarded-* headers
    trustedProxyHeaders: true,
    useSecureCookies: process.env.NODE_ENV === 'production',
        // Explicit hardened defaults for all auth cookies.
        // Keep sameSite=lax for compatibility with OAuth redirect flows.
        defaultCookieAttributes: {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
        },
  },

    // 1. Tell Better-Auth to use our SQLite database and schema
    database: drizzleAdapter(db, {
        provider: "sqlite",
        schema: schema,
    }),

    // 2. Expose custom user fields in the session
    user: {
        additionalFields: {
            role: {
                type: "string",
                defaultValue: "user",
                input: false, // not settable via sign-up
            },
        },
    },

    // 3. Email + Password sign-in is enabled; account creation is gated in databaseHooks.user.create
    emailAndPassword: {
        enabled: true,
    },

    // Session expiry and cookie security (Check 7)
    session: {
        expiresIn: 60 * 60 * 2,  // 2 hours
        updateAge: 60 * 60,       // extend token on activity after 1 hour
    },
    ...(process.env.VITE_APP_URL
        ? { trustedOrigins: [process.env.VITE_APP_URL] }
        : {}),

    // 4. Microsoft Entra ID SSO — only enabled when all three env vars are present.
    //    Without them the app starts normally and falls back to email/password login.
    ...(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET && process.env.MICROSOFT_TENANT_ID
        ? {
              socialProviders: {
                  microsoft: {
                      clientId: process.env.MICROSOFT_CLIENT_ID,
                      clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
                      tenantId: process.env.MICROSOFT_TENANT_ID,
                      mapProfileToUser: async (profile) => {
                          const role = resolveRoleFromEntraProfile(profile as Record<string, unknown>);
                          return { role };
                      },
                  },
              },
          }
        : {}),

    // 5. Database hooks for provisioning and auditing
    databaseHooks: {
        user: {
            create: {
                before: async (user) => {
                    let assignedRole = user.role as AppRole | undefined;

                    // Bootstrap email lists are read lazily to avoid startup crash when not set
                    const bootstrapAdminEmails = parseCsvSet(process.env.BOOTSTRAP_ADMIN_EMAILS);
                    const bootstrapUserEmails = parseCsvSet(process.env.BOOTSTRAP_USER_EMAILS);

                    if (user.email && bootstrapAdminEmails.has(user.email)) {
                        assignedRole = "admin";
                    } else if (user.email && bootstrapUserEmails.has(user.email)) {
                        assignedRole = "user";
                    }

                    // Provisioning policy:
                    // - Only emails in bootstrap allowlists can create accounts.
                    // - If allowlists are empty, no new account creation is allowed.
                    if (!assignedRole) {
                        throw new Error("User is not provisioned for Lina access");
                    }

                    return {
                        data: {
                            ...user,
                            role: assignedRole,
                        },
                    };
                },
                after: async (user) => {
                    logger.info('USER_CREATED', { userId: user.id, email: user.email, role: user.role });
                }
            },
        },
        session: {
            create: {
                after: async (session) => {
                    // Logs every time an authentication token is successfully generated (login)
                    logger.info('USER_LOGIN', { userId: session.userId });
                }
            }
        }
    },
});
