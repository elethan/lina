import { createFileRoute } from '@tanstack/react-router'
import { auth } from '../../../lib/auth'

export const Route = createFileRoute('/api/auth/$')({
    GET: ({ request }: { request: Request }) => {
        return auth.handler(request)
    },
    POST: ({ request }: { request: Request }) => {
        return auth.handler(request)
    }
})
