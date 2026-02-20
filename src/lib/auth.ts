// src/lib/auth.ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db/client";
import * as schema from "../db/schema";

export const auth = betterAuth({
    // 1. Tell Better-Auth to use our SQLite database and schema
    database: drizzleAdapter(db, {
        provider: "sqlite",
        schema: schema,
    }),

    // 2. Email + Password (enabled for dev/testing)
    emailAndPassword: {
        enabled: true,
    },

    // 3. Configure Microsoft Entra ID (Azure AD) for SSO
    socialProviders: {
        microsoft: {
            clientId: process.env.MICROSOFT_CLIENT_ID as string,
            clientSecret: process.env.MICROSOFT_CLIENT_SECRET as string,
            tenantId: process.env.MICROSOFT_TENANT_ID as string, // Your company's Entra ID tenant
        },
    },

    // 3. The Mapping Hook
    databaseHooks: {
        user: {
            create: {
                before: async (user) => {
                    // By default, everyone is a basic user.
                    let assignedRole = "user";

                    // (Optional) Hardcode your first admin
                    if (user.email === "your.email@company.com") {
                        assignedRole = "admin";
                    }

                    // *If using Entra ID Groups, you would check the incoming profile data here*

                    return {
                        data: {
                            ...user,
                            role: assignedRole,
                        },
                    };
                },
            },
        },
    },
});