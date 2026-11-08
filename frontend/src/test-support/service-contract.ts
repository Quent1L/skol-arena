import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest'

/**
 * Contract shared by the CRUD-style composable services: each method forwards its
 * arguments to one API call, never leaves `loading` stuck on, and surfaces an API
 * failure (a thrown error, an `error` ref or an error toast). Individual specs add
 * whatever behaviour is specific to their service on top.
 */
export interface ServiceCase<S> {
  /** Name shown in the report. */
  name: string
  /** Invokes the service method under test. */
  call: (service: S) => Promise<unknown>
  /** The API object and method the service must reach. */
  api: object
  method: string
  /** Arguments the API call must receive, when worth pinning. */
  args?: unknown[]
  /** What the stubbed API call resolves with on the happy path. */
  result?: unknown
}

interface ServiceShape {
  loading?: { value: boolean }
  error?: { value: unknown }
}

export function describeServiceContract<S extends ServiceShape>(
  label: string,
  makeService: () => S,
  cases: ServiceCase<S>[],
  toastAdd: Mock,
): void {
  describe(`${label} contract`, () => {
    beforeEach(() => {
      vi.restoreAllMocks()
      toastAdd.mockReset()
    })

    describe.each(cases)('$name', ({ call, api, method, args, result }) => {
      it('reaches the API with the given arguments and clears loading', async () => {
        const spy = vi.spyOn(api as never, method as never).mockResolvedValue((result ?? {}) as never)
        const service = makeService()

        await call(service)

        if (args) expect(spy).toHaveBeenCalledWith(...args)
        else expect(spy).toHaveBeenCalled()
        expect(service.loading?.value ?? false).toBe(false)
      })

      it('clears loading and surfaces an API failure', async () => {
        vi.spyOn(api as never, method as never).mockRejectedValue(new Error('boom') as never)
        const service = makeService()
        let thrown = false

        await call(service).catch(() => {
          thrown = true
        })

        const toasted = toastAdd.mock.calls.some(([toast]) => toast?.severity === 'error')
        expect(service.loading?.value ?? false).toBe(false)
        expect(thrown || Boolean(service.error?.value) || toasted).toBe(true)
      })
    })
  })
}
