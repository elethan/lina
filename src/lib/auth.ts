// src/lib/auth.ts
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

const getRequiredEnv = (name: string): string => {
    const value = process.env[name];
    if (value && value.trim()) return value;

    throw new Error(`Missing required environment variable: ${name}`);
};

const envGroupRoleMap: Record<Exclude<AppRole, "user">, Set<string>> = {
    admin: parseCsvSet(getRequiredEnv("MICROSOFT_GROUP_ADMIN_IDS")),
    engineer: parseCsvSet(getRequiredEnv("MICROSOFT_GROUP_ENGINEER_IDS")),
    scientist: parseCsvSet(getRequiredEnv("MICROSOFT_GROUP_SCIENTIST_IDS")),
};

const microsoftUserGroup = parseCsvSet(getRequiredEnv("MICROSOFT_GROUP_USER_IDS"));

const bootstrapAdminEmails = parseCsvSet(getRequiredEnv("BOOTSTRAP_ADMIN_EMAILS"));
const bootstrapUserEmails = parseCsvSet(getRequiredEnv("BOOTSTRAP_USER_EMAILS"));

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

    if (groups.some((groupId) => envGroupRoleMap.admin.has(groupId))) return "admin";
    if (groups.some((groupId) => envGroupRoleMap.engineer.has(groupId))) return "engineer";
    if (groups.some((groupId) => envGroupRoleMap.scientist.has(groupId))) return "scientist";
    if (groups.some((groupId) => microsoftUserGroup.has(groupId))) return "user";

    throw new Error("User is not in an authorized Entra group");
};

export const auth = betterAuth({
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

    // 3. Email + Password (enabled for dev/testing)
    emailAndPassword: {
        enabled: true,
    },

    // 3. Configure Microsoft Entra ID (Azure AD) for SSO
    socialProviders: {
        microsoft: {
            clientId: process.env.MICROSOFT_CLIENT_ID as string,
            clientSecret: process.env.MICROSOFT_CLIENT_SECRET as string,
            tenantId: process.env.MICROSOFT_TENANT_ID as string, // Your company's Entra ID tenant
            mapProfileToUser: async (profile) => {
                const role = resolveRoleFromEntraProfile(profile as Record<string, unknown>);

                return {
                    role,
                };
            },
        },
    },

    // 3. The Mapping Hook
    databaseHooks: {
        user: {
            create: {
                before: async (user) => {
                    let assignedRole = user.role as AppRole | undefined;

                    if (user.email && bootstrapAdminEmails.has(user.email)) {
                        assignedRole = "admin";
                    } else if (user.email && bootstrapUserEmails.has(user.email)) {
                        assignedRole = "user";
                    }

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