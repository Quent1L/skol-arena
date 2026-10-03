/**
 * Origin of the backend. Kept apart from ApiConfig so that code which only builds
 * URLs (avatar images) does not pull the HTTP client and its interceptors in.
 */
export const apiBaseURL = import.meta.env.DEV ? 'http://localhost:3000' : window.location.origin
