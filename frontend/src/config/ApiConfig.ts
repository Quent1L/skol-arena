import xior, { XiorError } from 'xior'
import { convertStringDatesToJS } from '@/utils/DateUtils'
import { NETWORK_ERROR, isTransientStatus } from '@/utils/HttpErrors'
import { isRateLimited, rateLimitMessage, retryAfterFrom } from '@/utils/RateLimit'
import { apiBaseURL } from './api-base'
import { i18n } from '@/i18n'
export { apiBaseURL }

/**
 * Major version of the backend API this client is built against, sent on every
 * request. Hardcoded on purpose: it is not the app version, and a release must
 * never silently move a client onto a new API major. Bump it only when the client
 * has been adapted to that major — the server keeps serving the old one meanwhile.
 */
export const API_VERSION = 'v1'
export const API_VERSION_HEADER = 'accept-version'

const baseURL = apiBaseURL

let writeCount = 0
/**
 * How many requests that may change server data this client has sent. A screen kept
 * alive behind another page compares it on return to know whether it went stale.
 */
export const writeSequence = (): number => writeCount
// Non-GET requests that change nothing another screen shows: a read sent as POST (its
// player list is too long for a query string) and the reader's own notification state.
// Anything not listed counts: an unknown write refreshes rather than risk stale data.
const NEUTRAL_WRITES = [/\/mmr-snapshot$/, /^\/api\/me\/notifications\//]

const http = xior.create({
  baseURL,
  credentials: 'include',
})

http.interceptors.request.use((config) => {
  const isWrite = config.method && config.method.toUpperCase() !== 'GET'
  if (isWrite && !NEUTRAL_WRITES.some((re) => re.test(config.url ?? ''))) writeCount += 1
  // The server renders its messages in this language: the one picked in the app,
  // not the browser's own Accept-Language.
  config.headers = {
    ...config.headers,
    [API_VERSION_HEADER]: API_VERSION,
    'accept-language': i18n.global.locale.value,
  }

  return config
})

http.interceptors.response.use(
  (response) => {
    response.data = convertStringDatesToJS(response.data)

    return response
  },
  async (error: XiorError) => {
    console.error('HTTP Error:', error.message, error.response)
    const apiError = error.response?.data?.error
    const status = error.response?.status
    // With no application code, a missing status or >= 500 is a transient failure:
    // mark it so callers never mistake it for an auth refusal.
    const cause = apiError?.code ?? (isTransientStatus(status) ? NETWORK_ERROR : undefined)
    // A throttled call is the one case where the server's own sentence is dropped:
    // Better Auth's is hardcoded English, and it says nothing about how long the wait is.
    const rateLimited = isRateLimited({ status, code: apiError?.code, details: apiError?.details })
    const message = rateLimited
      ? rateLimitMessage(retryAfterFrom({ details: apiError?.details }, error.response?.headers))
      : (apiError?.message ?? error.message)
    const err = Object.assign(new Error(message, { cause }), {
      status,
      ...(apiError?.details ? { details: apiError.details } : {}),
    })
    throw err
  },
)

export default http
