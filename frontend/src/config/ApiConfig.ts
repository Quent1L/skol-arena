import xior, { XiorError } from 'xior'
import { convertStringDatesToJS } from '@/utils/DateUtils'
import { NETWORK_ERROR, isTransientStatus } from '@/utils/HttpErrors'
import { isRateLimited, rateLimitMessage, retryAfterFrom } from '@/utils/RateLimit'
export const apiBaseURL = import.meta.env.DEV ? 'http://localhost:3000' : window.location.origin

/**
 * Major version of the backend API this client is built against, sent on every
 * request. Hardcoded on purpose: it is not the app version, and a release must
 * never silently move a client onto a new API major. Bump it only when the client
 * has been adapted to that major — the server keeps serving the old one meanwhile.
 */
export const API_VERSION = 'v1'
export const API_VERSION_HEADER = 'accept-version'

const baseURL = apiBaseURL

const http = xior.create({
  baseURL,
  credentials: 'include',
})

http.interceptors.request.use((config) => {
  config.headers = { ...config.headers, [API_VERSION_HEADER]: API_VERSION }

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
    // it is written in the browser's Accept-Language, not the locale picked in the
    // app, and it says nothing about how long the wait is.
    const rateLimited = isRateLimited({ status, code: apiError?.code, details: apiError?.details })
    const message = rateLimited
      ? rateLimitMessage(retryAfterFrom({ details: apiError?.details }, error.response?.headers))
      : (apiError?.message ?? error.message)
    const err = new Error(message, { cause })
    if (apiError?.details) (err as Error & { details: unknown }).details = apiError.details
    ;(err as Error & { status?: number }).status = status
    throw err
  },
)

export default http
