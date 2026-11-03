import { afterAll, beforeEach } from "vitest"
import { closeDb, sql } from "@/lib/server/db"

/**
 * Point the store at a local test database and empty it before each test.
 * Needs Postgres running locally with a `trustfall_test` database
 * (`createdb trustfall_test`), or TEST_DATABASE_URL.
 */
export function setupTestDb() {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://localhost:5432/trustfall_test"
  beforeEach(async () => {
    await sql("TRUNCATE profiles, notes, rounds, players")
  })
  afterAll(closeDb)
}

export const PLAYER = "00000000-0000-4000-8000-000000000001"
export const OTHER_PLAYER = "00000000-0000-4000-8000-000000000002"
