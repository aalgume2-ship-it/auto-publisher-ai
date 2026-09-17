/**
 * Prisma CLI config — offline/WASM path.
 *
 * Why this exists: the sandbox cannot reach binaries.prisma.sh (engine
 * downloads). Prisma 6.16 runs its schema engine as WebAssembly and only
 * needs a driver adapter when `adapter` is defined here, so `db push`,
 * `generate`, and `migrate` work with zero native binaries.
 *
 * The connection comes from the repo root `.env.local` (DATABASE_URL).
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { defineConfig } from 'prisma/config'
import { PrismaPg } from '@prisma/adapter-pg'

function loadEnvLocal(): void {
  try {
    const here = fileURLToPath(new URL('.', import.meta.url))
    const txt = readFileSync(new URL('../../.env.local', import.meta.url), 'utf8')
    for (const raw of txt.split('\n')) {
      const m = /^([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/.exec(raw)
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
      }
    }
    void here
  } catch {
    // .env.local optional — fall back to ambient env
  }
}

loadEnvLocal()

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error('DATABASE_URL is not set (expected in ../../.env.local)')
}

export default defineConfig({
  // Prisma 6.16: CLI driver adapters (WASM schema engine) are gated behind
  // this experimental flag; without it the CLI downloads native binaries.
  experimental: {
    adapter: true,
  },
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  adapter: async () =>
    new PrismaPg(new pg.Pool({ connectionString, max: 1 })) as never,
})
