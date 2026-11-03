import "server-only"

import { MODELS } from "@/lib/models"
import { RECENT_ROUNDS_IN_PROMPT, type Memory, type PlayerContext } from "@/lib/game/prompts"
import type { MemorySnapshot, NoteRecord, ProfileRecord, RoundRecord } from "@/types/game"
import type { Opponent } from "./providers"
import { appendJsonl, dataPath, overallStats, readJsonl, readRounds, writeText } from "./store"

/**
 * The AI's memory of the player, in data/memory/:
 *
 * - notes.jsonl: after every round, the AI that played writes a note. Append-only.
 * - profile.jsonl: every CONSOLIDATE_EVERY notes, they're folded into a new
 *   version of the AI's consolidated read on the player. Every version is kept.
 *
 * The AI reads the latest profile plus the notes written since, so its memory
 * stays short however many rounds are played. data/ai-memory.md is a readable
 * copy, regenerated after every change.
 */

/** Fold the notes into the profile once this many have built up since the last version. */
export const CONSOLIDATE_EVERY = 10

/** A cap on raw notes in the prompt, in case consolidation keeps failing. */
const MAX_NOTES_IN_PROMPT = 15

const notesFile = () => dataPath("memory", "notes.jsonl")
const profileFile = () => dataPath("memory", "profile.jsonl")
const markdownFile = () => dataPath("ai-memory.md")

export const readNoteLog = () => readJsonl<NoteRecord>(notesFile())
export const readProfiles = () => readJsonl<ProfileRecord>(profileFile())

/** Notes the latest profile doesn't cover yet, oldest first. */
function pendingNotes(notes = readNoteLog(), profile = readProfiles().at(-1)): NoteRecord[] {
  const through = profile?.coversNotesThrough ?? 0
  return notes.filter((n) => n.status === "ok" && n.noteId > through)
}

/** What the AI remembers right now. Taken at the start of a round and frozen for the whole of it. */
export function memorySnapshot(): MemorySnapshot {
  const profile = readProfiles().at(-1)
  return {
    profileVersion: profile?.version ?? null,
    noteIds: pendingNotes(readNoteLog(), profile)
      .slice(-MAX_NOTES_IN_PROMPT)
      .map((n) => n.noteId),
  }
}

/** The memory a snapshot points to. */
export function resolveMemory(snapshot: MemorySnapshot): Memory {
  const profile = snapshot.profileVersion === null ? undefined : readProfiles().find((p) => p.version === snapshot.profileVersion)
  const ids = new Set(snapshot.noteIds)
  return {
    profile: profile?.profile ?? null,
    notes: readNoteLog().filter((n) => ids.has(n.noteId) && n.status === "ok"),
  }
}

/** Everything the AI knows about the player during a round. */
export function playerContext(snapshot: MemorySnapshot): PlayerContext {
  const rounds = readRounds()
  return {
    stats: overallStats(rounds),
    recentRounds: rounds
      .slice(-RECENT_ROUNDS_IN_PROMPT)
      .map(({ humanDecision, aiDecision }) => ({ humanDecision, aiDecision })),
    memory: resolveMemory(snapshot),
  }
}

/** Log the AI's note on a round, or that it couldn't write one. */
export function addNote(
  record: RoundRecord,
  opponent: Opponent,
  result: { note: string } | { error: string },
  now = new Date(),
): NoteRecord {
  const notes = readNoteLog()
  const entry: NoteRecord = {
    noteId: (notes.at(-1)?.noteId ?? 0) + 1,
    addedAt: now.toISOString(),
    roundId: record.roundId,
    provider: opponent.model,
    apiModel: opponent.apiModel,
    humanDecision: record.humanDecision,
    aiDecision: record.aiDecision,
    ...("note" in result ? { status: "ok", note: result.note.trim() } : { status: "failed", note: null, error: result.error }),
  }
  appendJsonl(notesFile(), entry)
  writeMarkdown()
  return entry
}

/** The notes to fold into a new profile version, or null if it isn't time yet. */
export function notesToConsolidate(): { previous: ProfileRecord | null; notes: NoteRecord[] } | null {
  const previous = readProfiles().at(-1) ?? null
  const notes = pendingNotes(readNoteLog(), previous ?? undefined)
  return notes.length >= CONSOLIDATE_EVERY ? { previous, notes } : null
}

export function addProfile(
  previous: ProfileRecord | null,
  notes: NoteRecord[],
  opponent: Opponent,
  profile: string,
  now = new Date(),
): ProfileRecord {
  const entry: ProfileRecord = {
    version: (previous?.version ?? 0) + 1,
    createdAt: now.toISOString(),
    provider: opponent.model,
    apiModel: opponent.apiModel,
    coversNotesThrough: Math.max(previous?.coversNotesThrough ?? 0, ...notes.map((n) => n.noteId)),
    newNoteIds: notes.map((n) => n.noteId),
    profile: profile.trim(),
  }
  appendJsonl(profileFile(), entry)
  writeMarkdown()
  return entry
}

const utc = (iso: string) => `${iso.slice(0, 19).replace("T", " ")} UTC`

/** Regenerate data/ai-memory.md, a readable copy of the memory. Edits to it are overwritten. */
function writeMarkdown() {
  const profile = readProfiles().at(-1)
  const notes = readNoteLog()
  const lines = [
    "# Trustfall: the AI's memory of the player",
    "",
    "Generated from data/memory/notes.jsonl and data/memory/profile.jsonl after every change. Edits here are overwritten.",
    "",
    profile
      ? `## Profile v${profile.version} (${utc(profile.createdAt)}, by ${MODELS[profile.provider].displayName}, covers notes #1-#${profile.coversNotesThrough})`
      : "## Profile",
    "",
    profile?.profile ?? `None yet. The first one is written after ${CONSOLIDATE_EVERY} notes.`,
    "",
    "## Notes, newest first",
  ]
  for (const n of [...notes].reverse()) {
    lines.push(
      "",
      `### #${n.noteId} · ${utc(n.addedAt)} · human ${n.humanDecision}, AI ${n.aiDecision} · by ${MODELS[n.provider].displayName} · round ${n.roundId}`,
      "",
      n.status === "ok" ? (n.note ?? "") : `(Couldn't be written: ${n.error})`,
    )
  }
  writeText(markdownFile(), `${lines.join("\n")}\n`)
}
