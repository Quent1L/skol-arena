# Contributing to Skol Arena

Thanks for taking the time. Issues, bug reports and pull requests are all welcome — this is
a real project used by real leagues, and it gets better fastest when the people running
them say what is missing.

By participating, you agree to the [Code of Conduct](CODE_OF_CONDUCT.md). Found a security
issue? Don't open a public issue — see [SECURITY.md](SECURITY.md).

## Getting the project running

**Prerequisites:** [Bun](https://bun.sh) 1.3+ and an empty PostgreSQL 16+ database.

The app connects to a database, it never creates one. Create it yourself, owned by a role
allowed to create tables — that is all the setup the database needs:

```bash
createdb skol_arena
```

```bash
# 1. Fork the repository on GitHub, then clone your fork
git clone https://github.com/<your-username>/skol-arena.git
cd skol-arena

# 2. Install every workspace
bun install

# 3. Configure the backend
cp backend/.env.example backend/.env
#    At minimum, set DATABASE_URL and BETTER_AUTH_SECRET.
#    Every variable is documented at
#    https://skol-arena.com/docs/environment-variables

# 4. Start everything — this also creates the schema on first run
bun run dev
```

There is no setup or migration command to run: `backend/src/index.ts` calls
`runMigrations()` before the server accepts any traffic, so every pending migration in
`backend/drizzle/` is applied at each startup. On an empty database, the first
`bun run dev` builds the whole schema.

| Service | URL |
|---|---|
| Backend (Hono + Bun) | http://localhost:3000 |
| Frontend (Vue 3 + Vite) | http://localhost:5173 |
| Docs site (Astro) | http://localhost:4321 |
| API reference (Scalar) | http://localhost:3000/api/docs |

## Repository layout

This is a Bun workspace monorepo with four packages:

```
skol-arena/
├── shared/     # @skol-arena/shared — TypeScript types + Zod schemas, used by both sides
├── backend/    # Hono API server (Bun, Drizzle ORM, PostgreSQL, Better Auth)
├── frontend/   # Vue 3 SPA (Vite, Nuxt UI, TailwindCSS, vue-i18n)
└── docs/       # @skol-arena/docs — Astro static site (showcase, blog, self-hosting docs)
```

`shared/` is compiled, not consumed as source. `bun run dev` builds it first and then keeps
it in watch mode, but if you ever see:

```
Cannot find module '@skol-arena/shared'
```

run `cd shared && bun run build`.

## Architecture

**Backend — Routes → Services → Repositories.** Each layer only talks to the one below it.

- `backend/src/routes/` — HTTP handling only. Validate with `validate()` from
  `backend/src/api/validator.ts` and document with `describe()` from
  `backend/src/api/describe.ts`. No business logic.
- `backend/src/services/` — business logic, no HTTP concerns.
- `backend/src/repository/` — Drizzle ORM queries only.

**Frontend — Views → Components → Composables.**

- `frontend/src/views/` — page-level components.
- `frontend/src/components/` — reusable UI. They consume services, never the API directly.
- `frontend/src/composables/` — two layers in the same folder:
  - `*.api.ts` — a 1:1 mirror of the backend routes. No logic, no try/catch: the xior
    interceptor handles errors and date revival centrally.
  - `*.service.ts` — state management and error handling.

**Database.** The schema lives in `backend/src/db/schema.ts`. Migrations in
`backend/drizzle/` are **applied automatically at server startup** — there is no manual
migrate command. To add one: run `bun run db:generate` inside `backend/`, then restart the
server.

`backend/` also exposes `db:push` (`drizzle-kit push`), which writes the schema straight to
the database. It is an iteration shortcut while you are still shaping a table — **not a
setup step**. It bypasses the migration journal, so a database built with it has the tables
but no record of them, and the next startup replays migration `0000` against existing
tables and fails. If you use it, write the matching migration SQL with `IF NOT EXISTS` /
conditional blocks so it stays idempotent.

## Commands

### Development

| Command | Description |
|---------|-------------|
| `bun run dev` | **Start everything** ⭐ |
| `bun run dev:shared` | Shared types in watch mode only |
| `bun run dev:backend` | Backend only |
| `bun run dev:frontend` | Frontend only |
| `bun run dev:docs` | Docs site only |

### Build

| Command | Description |
|---------|-------------|
| `bun run build` | Full production build (shared → frontend → backend → docs) |
| `bun run build:shared` | Compile shared types only |
| `bun run build:frontend` | Frontend production build |
| `bun run build:docs` | Docs site only (also generates the Pagefind search index) |

### Quality

| Command | Description |
|---------|-------------|
| `bun run type-check` | TypeScript check across all workspaces |
| `bun run lint` | Lint all workspaces — note this runs with `--fix` and will rewrite files |
| `bun run test:unit` | Backend + frontend + scripts tests |
| `bun run test:unit:cov` | Same, with coverage reports |
| `bun run test:e2e` | Playwright end-to-end suite (spins up a dedicated Postgres, see below) |

### Utilities

| Command | Description |
|---------|-------------|
| `bun run clean` | Remove every build directory |

## Testing

```bash
bun run test:unit                       # everything
cd backend  && bun run test:unit        # backend unit tests only
cd backend  && bun run test:integration # backend integration tests (needs a database)
cd frontend && bun run test:unit        # frontend (Vitest)
```

Two things to know:

- **`bun run test:unit` at the root also runs the backend integration tests**, which need a
  reachable PostgreSQL database. If you only want the fast pass, run
  `cd backend && bun run test:unit` instead.
- **Never run a bare `bun test` in `backend/`.** The workspace scripts pass `--isolate`,
  which is required: without it state leaks between test files and you get dozens of bogus
  failures.

The end-to-end suite is separate. `bun run test:e2e` runs `e2e:prepare` first, which starts
a throwaway Postgres via Docker Compose on port 5435 and seeds it.

Test files live in `__tests__/` directories next to the code they cover.

## Before you open a pull request

```bash
bun run lint
bun run type-check
bun run test:unit
```

All three must pass. Then fill in the pull request template — what the change does, why,
and how you tested it.

## Commit convention

Commits must follow [Conventional Commits](https://www.conventionalcommits.org/).
[commitlint](https://commitlint.js.org/) enforces this through a Husky hook, installed
automatically by `bun install`.

```
type(scope): description

# Examples
feat(ranked): add MMR recalculation
fix(bracket): correct seeding order
docs: update setup instructions
```

Accepted types: `feat`, `fix`, `perf`, `refactor`, `docs`, `style`, `test`, `chore`, `ci`,
`revert`.

This is not cosmetic. release-it derives the next version number and the entire changelog
from these commits when `main` is released. As a consequence:

> **Never edit `VERSION`, `MIN_VERSION` or `CHANGELOG.md` by hand.** All three are written
> by the release process.

If your change breaks compatibility with older clients badly enough that they must not keep
running, commit an empty `FORCE_UPDATE` marker file in the same pull request. The release
script resolves it into the published version and deletes it.

## Code conventions

Only what is actually enforced or consistently applied:

- **Everything in English** — code, comments, commit messages, documentation.
- **No `any`.** Use a proper type, or `unknown`.
- **Functions stay under 30 lines.**
- **Types come from `@skol-arena/shared`**, never duplicated locally.
- **Backend errors use i18n keys**, not sentences:
  `throw new ValidationError('INVALID_EMAIL_FORMAT')`.
- **Never throw a `ZodError`.** Zod 4's `ZodError` does not extend `Error`, and Hono
  rethrows anything failing `instanceof Error` instead of routing it to `app.onError` — it
  escapes the app and surfaces as a crash page. Throw an `AppError` subclass instead.
- **Validate with `validate()`** from `backend/src/api/validator.ts`, never `zValidator` or
  `hono-openapi`'s `validator` directly: the wrapper also registers the schema with the
  OpenAPI generator and converts failures into the canonical error envelope.
- **Use Font Awesome icons** for action buttons, not Lucide. In Nuxt UI components pass them
  through Iconify: `icon="i-fa7-solid:pen"`.

## Documentation

User-facing documentation lives in the `docs/` workspace and is published to the website —
not in this repository's markdown files. If your change affects how the app behaves for the
people running or playing in a tournament, update the relevant page under
`docs/src/pages/docs/`.

Note that `docs/src/pages/docs/` pages are real routes and must be added by hand to the
sidebar array in `docs/src/layouts/DocsLayout.astro`.

## Troubleshooting

### `Cannot find module '@skol-arena/shared'`

The shared package hasn't been compiled yet:

```bash
cd shared && bun run build
```

### `bun: not found` when committing

Husky runs hooks in a restricted shell that doesn't load your user profile. If Bun isn't on
the PATH at commit time:

```
.husky/commit-msg: bun: not found
husky - commit-msg script failed (code 127)
```

Add Bun to `~/.config/husky/init.sh`, which Husky sources before every hook:

```bash
mkdir -p ~/.config/husky
echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.config/husky/init.sh
```

This file is machine-local and is not committed. Each contributor using Bun needs to do it
once.

## License

By contributing, you agree that your contributions will be licensed under the
[GNU Affero General Public License v3.0](LICENSE), the same license that covers the project.
