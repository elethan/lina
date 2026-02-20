import { createAuthClient } from "better-auth/react"

export const authClient = createAuthClient({
    baseURL: process.env.NODE_ENV === "production" ? process.env.VITE_APP_URL : "http://localhost:3000"
})
