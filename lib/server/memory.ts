import "server-only"

import { RECENT_ROUNDS_IN_PROMPT, type Memory, type PlayerContext } from "@/lib/game/prompts"
import type { AIModel, Choice, MemorySnapshot, NoteRecord, ProfileRecord, RoundRecord } from "@/types/game"
import { lock, sql, transaction } from "./db"
import type { Opponent } from "./providers"
import { overallStats, recentRounds } from "./store"

/**
 * The AI's memory of each player, in Postgres:
 *
 * - notes: after every round, the AI that played writes a note. Append-only.
 * - profiles: every CONSOLIDATE_EVERY notes, they're folded into a new version
 *   of the AI's consolidated read on the player. Every version is kept.
 *
 * The AI reads the player's latest profile plus the notes written since, so its
 * memory stays short however many rounds are played.
 */

/** Fold the notes into the profile once this many have built up since the last version. */
export const CONSOLIDATE_EVERY = 10

/** A cap on raw notes in the prompt, in case consolidation keeps failing. */
const MAX_NOTES_IN_PROMPT = 15

type NoteRow = {
  player_id: string
  note_id: number
  added_at: Date
  round_id: string
  provider: AIModel
  api_model: string
  human_decision: Choice
  ai_decision: Choice
  status: "ok" | "failed"
  note: string | null
  error: string | null
}

const toNote = (r: NoteRow): NoteRecord => ({
  playerId: r.player_id,
  noteId: r.note_id,
  addedAt: r.added_at.toISOString(),
  roundId: r.round_id,
  provider: r.provider,
  apiModel: r.api_model,
  humanDecision: r.human_decision,
  aiDecision: r.ai_decision,
  status: r.status,
  note: r.note,
  ...(r.error ? { error: r.error } : {}),
})

type ProfileRow = {
  player_id: string
  version: number
  created_at: Date
  provider: AIModel
  api_model: string
  covers_notes_through: number
  new_note_ids: number[]
  profile: string
}

const toProfile = (r: ProfileRow): ProfileRecord => ({
  playerId: r.player_id,
  version: r.version,
  createdAt: r.created_at.toISOString(),
  provider: r.provider,
  apiModel: r.api_model,
  coversNotesThrough: r.covers_notes_through,
  newNoteIds: r.new_note_ids,
  profile: r.profile,
})

/** A player's notes, oldest first. */
export async function readNoteLog(playerId: string): Promise<NoteRecord[]> {
  const rows = await sql<NoteRow>("SELECT * FROM notes WHERE player_id = $1 ORDER BY note_id", [playerId])
  return rows.map(toNote)
}

/** Every player's notes (for the local DATA page). */
export async function readAllNotes(): Promise<NoteRecord[]> {
  const rows = await sql<NoteRow>("SELECT * FROM notes ORDER BY added_at")
  return rows.map(toNote)
}

/** A player's profile versions, oldest first. */
export async function readProfiles(playerId: string): Promise<ProfileRecord[]> {
  const rows = await sql<ProfileRow>("SELECT * FROM profiles WHERE player_id = $1 ORDER BY version", [playerId])
  return rows.map(toProfile)
}

/** Every player the AI has notes on, most recently played first (for the local MEMORY page). */
export async function playersWithMemory(): Promise<string[]> {
  const rows = await sql<{ player_id: string }>(
    "SELECT player_id FROM notes GROUP BY player_id ORDER BY max(added_at) DESC",
  )
  return rows.map((r) => r.player_id)
}

/** Notes the latest profile doesn't cover yet, oldest first. */
function pendingNotes(notes: NoteRecord[], profile: ProfileRecord | undefined): NoteRecord[] {
  const through = profile?.coversNotesThrough ?? 0
  return notes.filter((n) => n.status === "ok" && n.noteId > through)
}

/** What the AI remembers about a player right now. Taken at the start of a round and frozen for the whole of it. */
export async function memorySnapshot(playerId: string): Promise<MemorySnapshot> {
  const [notes, profiles] = await Promise.all([readNoteLog(playerId), readProfiles(playerId)])
  const profile = profiles.at(-1)
  return {
    profileVersion: profile?.version ?? null,
    noteIds: pendingNotes(notes, profile)
      .slice(-MAX_NOTES_IN_PROMPT)
      .map((n) => n.noteId),
  }
}

/** The memory a snapshot points to. */
export async function resolveMemory(playerId: string, snapshot: MemorySnapshot): Promise<Memory> {
  const [notes, profiles] = await Promise.all([readNoteLog(playerId), readProfiles(playerId)])
  const profile = snapshot.profileVersion === null ? undefined : profiles.find((p) => p.version === snapshot.profileVersion)
  const ids = new Set(snapshot.noteIds)
  return {
    profile: profile?.profile ?? null,
    notes: notes.filter((n) => ids.has(n.noteId) && n.status === "ok"),
  }
}

/** Everything the AI knows going into a turn: the overall score, and this player's history and memory. */
export async function playerContext(playerId: string, snapshot: MemorySnapshot): Promise<PlayerContext> {
  const [stats, rounds, memory] = await Promise.all([
    overallStats(),
    recentRounds(playerId, RECENT_ROUNDS_IN_PROMPT),
    resolveMemory(playerId, snapshot),
  ])
  return {
    stats,
    recentRounds: rounds.map(({ humanDecision, aiDecision }) => ({ humanDecision, aiDecision })),
    memory,
  }
}

/** Log the AI's note on a round, or that it couldn't write one. */
export async function addNote(
  record: RoundRecord,
  opponent: Opponent,
  result: { note: string } | { error: string },
  now = new Date(),
): Promise<NoteRecord> {
  return transaction(async (client) => {
    await lock(client, `notes:${record.playerId}`)
    const [row] = await sql<NoteRow>(
      `INSERT INTO notes (player_id, note_id, added_at, round_id, provider, api_model, human_decision, ai_decision, status, note, error)
       VALUES ($1, (SELECT coalesce(max(note_id), 0) + 1 FROM notes WHERE player_id = $1), $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        record.playerId,
        now.toISOString(),
        record.roundId,
        opponent.model,
        opponent.apiModel,
        record.humanDecision,
        record.aiDecision,
        "note" in result ? "ok" : "failed",
        "note" in result ? result.note.trim() : null,
        "error" in result ? result.error : null,
      ],
      client,
    )
    return toNote(row)
  })
}

/** The notes to fold into a new profile version, or null if it isn't time yet. */
export async function notesToConsolidate(
  playerId: string,
): Promise<{ previous: ProfileRecord | null; notes: NoteRecord[] } | null> {
  const [notes, profiles] = await Promise.all([readNoteLog(playerId), readProfiles(playerId)])
  const previous = profiles.at(-1) ?? null
  const pending = pendingNotes(notes, previous ?? undefined)
  return pending.length >= CONSOLIDATE_EVERY ? { previous, notes: pending } : null
}

export async function addProfile(
  playerId: string,
  previous: ProfileRecord | null,
  notes: NoteRecord[],
  opponent: Opponent,
  profile: string,
  now = new Date(),
): Promise<ProfileRecord> {
  const [row] = await sql<ProfileRow>(
    `INSERT INTO profiles (player_id, version, created_at, provider, api_model, covers_notes_through, new_note_ids, profile)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      playerId,
      (previous?.version ?? 0) + 1,
      now.toISOString(),
      opponent.model,
      opponent.apiModel,
      Math.max(previous?.coversNotesThrough ?? 0, ...notes.map((n) => n.noteId)),
      notes.map((n) => n.noteId),
      profile.trim(),
    ],
  )
  return toProfile(row)
}
