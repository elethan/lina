import { auth } from './auth'

export async function fetchSessionFromHeaders(headers: Headers) {
  return auth.api.getSession({ headers })
}