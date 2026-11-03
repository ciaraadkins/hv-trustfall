import "server-only"

import { Pool, type PoolClient } from "pg"
import { Resource } from "sst"

/**
 * Postgres: the game's backend, locally and in AWS.
 *
 * - Locally: DATABASE_URL from .env.local (Homebrew Postgres, database `trustfall`).
 * - In AWS (RUNTIME=aws, set by SST): the `trustfall` database on the shared
 *   Human Versus RDS instance, linked by SST as Resource.Database.
 *
 * Every row belongs to a player: an anonymous ID from the browser for now, and
 * later a signed-in account (players.user_id), so each person's data is theirs.
 * The overall Humans vs AI score is across every player.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS players (
  id           UUID PRIMARY KEY,            -- anonymous ID from the browser's localStorage
  user_id      TEXT UNIQUE,                 -- the account it belongs to, once there are accounts
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per finished round.
CREATE TABLE IF NOT EXISTS rounds (
  round_id            TEXT PRIMARY KEY,
  seq                 BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE, -- the order rounds were recorded in
  player_id           UUID NOT NULL REFERENCES players(id),
  started_at          TIMESTAMPTZ NOT NULL,
  finished_at         TIMESTAMPTZ NOT NULL,
  duration_seconds    INTEGER NOT NULL,
  provider            TEXT NOT NULL,         -- claude | openai | gemini | grok | deepseek
  model_name          TEXT NOT NULL,
  api_model           TEXT NOT NULL,
  human_decision      TEXT NOT NULL,         -- SHARE | KEEP
  ai_decision         TEXT NOT NULL,
  outcome             TEXT NOT NULL,
  human_points        SMALLINT NOT NULL,
  ai_points           SMALLINT NOT NULL,
  score_before        JSONB NOT NULL,        -- { humans, ai, rounds }: the overall score, every player
  score_after         JSONB NOT NULL,
  human_message_count SMALLINT NOT NULL,
  ai_message_count    SMALLINT NOT NULL,
  ai_lock_in_reason   TEXT,
  strategy_version    SMALLINT NOT NULL,
  memory              JSONB NOT NULL,        -- { profileVersion, noteIds }: what the AI knew going in
  transcript          JSONB NOT NULL         -- [{ sender, text, at, secondsIntoRound }]
);
CREATE INDEX IF NOT EXISTS rounds_player_seq ON rounds (player_id, seq);

-- After each round, the AI that played writes a note on how the player played.
CREATE TABLE IF NOT EXISTS notes (
  player_id      UUID NOT NULL REFERENCES players(id),
  note_id        INTEGER NOT NULL,          -- 1, 2, 3, ... per player
  added_at       TIMESTAMPTZ NOT NULL,
  round_id       TEXT NOT NULL REFERENCES rounds(round_id),
  provider       TEXT NOT NULL,
  api_model      TEXT NOT NULL,
  human_decision TEXT NOT NULL,
  ai_decision    TEXT NOT NULL,
  status         TEXT NOT NULL,             -- ok | failed
  note           TEXT,
  error          TEXT,
  PRIMARY KEY (player_id, note_id)
);

-- Every CONSOLIDATE_EVERY notes are folded into a new version of the player's profile.
CREATE TABLE IF NOT EXISTS profiles (
  player_id            UUID NOT NULL REFERENCES players(id),
  version              INTEGER NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL,
  provider             TEXT NOT NULL,
  api_model            TEXT NOT NULL,
  covers_notes_through INTEGER NOT NULL,
  new_note_ids         INTEGER[] NOT NULL,
  profile              TEXT NOT NULL,
  PRIMARY KEY (player_id, version)
);
`

function connectionConfig() {
  if (process.env.RUNTIME !== "aws") {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set")
    return { connectionString: process.env.DATABASE_URL }
  }
  const db = Resource.Database
  return {
    host: db.host,
    port: Number(db.port),
    user: db.username,
    password: db.password,
    database: db.database,
    // RDS requires SSL. Its certificate isn't in Node's default trust store, so
    // the connection is encrypted but the certificate isn't verified.
    ssl: { rejectUnauthorized: false },
  }
}

// Created on first use (not at import) so `next build` never needs a database.
const globalForDb = globalThis as unknown as { __trustfallPool?: Pool; __trustfallSchema?: Promise<void> }

function pool(): Pool {
  return (globalForDb.__trustfallPool ??= new Pool({ ...connectionConfig(), max: 5 }))
}

/** Creates the tables once per process. The advisory lock stops two cold starts racing on CREATE TABLE. */
function ready(): Promise<void> {
  return (globalForDb.__trustfallSchema ??= (async () => {
    const client = await pool().connect()
    try {
      await client.query("BEGIN")
      await client.query("SELECT pg_advisory_xact_lock(8781001)")
      await client.query(SCHEMA)
      await client.query("COMMIT")
    } catch (error) {
      await client.query("ROLLBACK")
      globalForDb.__trustfallSchema = undefined
      throw error
    } finally {
      client.release()
    }
  })())
}

/** Something to run queries on: the pool, or a client inside a transaction. */
export type Db = Pick<PoolClient, "query">

export async function sql<T>(text: string, params: unknown[] = [], db?: Db): Promise<T[]> {
  await ready()
  const result = await (db ?? pool()).query(text, params)
  return result.rows as T[]
}

export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  await ready()
  const client = await pool().connect()
  try {
    await client.query("BEGIN")
    const out = await fn(client)
    await client.query("COMMIT")
    return out
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}

/** Serializes writes that number things (rounds' running score, a player's notes) within a transaction. */
export async function lock(client: Db, key: string): Promise<void> {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [key])
}

/** For tests: close the pool so the process can exit, and forget the schema. */
export async function closeDb(): Promise<void> {
  await globalForDb.__trustfallPool?.end()
  globalForDb.__trustfallPool = undefined
  globalForDb.__trustfallSchema = undefined
}
