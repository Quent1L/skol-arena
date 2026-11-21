/**
 * Runs the SSO suite against real identity providers, one at a time:
 *
 *   bun run test:e2e:sso keycloak|dex|authentik|all
 *
 * For each: boot the IdP (e2e/sso/docker-compose.yml), wait for its discovery document,
 * reseed the e2e database from scratch, run playwright.sso.config.ts, stop the IdP.
 * The dev stack must be stopped: the suite owns ports 3000 and 5173.
 */
import { $ } from 'bun'
import { PROVIDERS } from './providers'

const COMPOSE = ['-f', 'e2e/sso/docker-compose.yml']
const DISCOVERY_TIMEOUT_MS = 300_000

async function waitForDiscovery(issuer: string) {
  const url = `${issuer}/.well-known/openid-configuration`
  const deadline = Date.now() + DISCOVERY_TIMEOUT_MS
  while (Date.now() < deadline) {
    const ok = await fetch(url)
      .then((res) => res.ok)
      .catch(() => false)
    if (ok) return
    await Bun.sleep(2_000)
  }
  throw new Error(`${url} did not answer within ${DISCOVERY_TIMEOUT_MS / 1000}s`)
}

async function runOne(id: string): Promise<boolean> {
  const provider = PROVIDERS[id]!
  console.log(`\n=== SSO e2e: ${id} ===`)
  try {
    await $`docker compose ${COMPOSE} --profile ${id} up -d`
    await waitForDiscovery(provider.issuer)
    // A new account per run: the newcomer must not exist yet.
    await $`bun run e2e:db:down && bun run e2e:prepare`.quiet()
    const result = await $`bun run test:e2e -c playwright.sso.config.ts`
      .env({ ...process.env, SSO_PROVIDER: id })
      .nothrow()
    return result.exitCode === 0
  } finally {
    await $`docker compose ${COMPOSE} --profile ${id} down -v`.quiet().nothrow()
  }
}

const arg = process.argv[2] ?? ''
const ids = arg === 'all' ? Object.keys(PROVIDERS) : [arg]
if (!ids.every((id) => id in PROVIDERS)) {
  console.error(`usage: bun run test:e2e:sso <${[...Object.keys(PROVIDERS), 'all'].join('|')}>`)
  process.exit(2)
}

const results: Record<string, boolean> = {}
for (const id of ids) results[id] = await runOne(id)

console.log('\n=== SSO e2e summary ===')
for (const [id, ok] of Object.entries(results)) console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}`)
process.exit(Object.values(results).every(Boolean) ? 0 : 1)
