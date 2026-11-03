import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Opponent } from "@/lib/server/providers"
import type { Choice, RoundRecord } from "@/types/game"
import { OTHER_PLAYER, PLAYER, setupTestDb } from "./db"

const { generateStructured } = vi.hoisted(() => ({ generateStructured: vi.fn() }))
vi.mock("@/lib/server/providers", () => ({ generateStructured, GameError: class extends Error {} }))

import {
  CONSOLIDATE_EVERY,
  addNote,
  addProfile,
  memorySnapshot,
  notesToConsolidate,
  playerContext,
  playersWithMemory,
  readNoteLog,
  readProfiles,
  resolveMemory,
} from "@/lib/server/memory"
import { rememberRound } from "@/lib/server/game"
import { recordRound, touchPlayer } from "@/lib/server/store"

setupTestDb()

beforeEach(async () => {
  generateStructured.mockReset()
  vi.spyOn(console, "error").mockImplementation(() => {})
  await touchPlayer(PLAYER)
  await touchPlayer(OTHER_PLAYER)
})

const grok: Opponent = { model: "grok", apiModel: "grok-4.20-0309-non-reasoning" }
const claude: Opponent = { model: "claude", apiModel: "claude-sonnet-5-5" }

let n = 0
async function playRound(humanDecision: Choice = "SHARE", aiDecision: Choice = "KEEP", playerId = PLAYER): Promise<RoundRecord> {
  const { record } = await recordRound({
    roundId: `round-${++n}`,
    playerId,
    opponent: grok,
    messages: [{ sender: "SYSTEM", content: "welcome", timestamp: 0 }],
    humanDecision,
    aiDecision,
    aiLockInReason: null,
    memory: await memorySnapshot(playerId),
  })
  return record
}

/** Play `count` rounds, each with a note. */
async function notes(count: number, playerId = PLAYER) {
  for (let i = 0; i < count; i++) await addNote(await playRound("SHARE", "KEEP", playerId), grok, { note: `Note ${i + 1}.` })
}

describe("notes", () => {
  it("numbers each player's notes and records when, which round, who wrote them, and the outcome", async () => {
    const record = await playRound("KEEP", "SHARE")
    const note = await addNote(record, grok, { note: " Said share, kept. " }, new Date("2026-10-30T17:42:13Z"))
    expect(note).toEqual({
      playerId: PLAYER,
      noteId: 1,
      addedAt: "2026-10-30T17:42:13.000Z",
      roundId: record.roundId,
      provider: "grok",
      apiModel: "grok-4.20-0309-non-reasoning",
      humanDecision: "KEEP",
      aiDecision: "SHARE",
      status: "ok",
      note: "Said share, kept.",
    })
    expect((await addNote(await playRound(), grok, { note: "Again." })).noteId).toBe(2)
    expect((await addNote(await playRound("SHARE", "KEEP", OTHER_PLAYER), grok, { note: "Someone else." })).noteId).toBe(1)
    expect(await readNoteLog(PLAYER)).toHaveLength(2)
    expect(await playersWithMemory()).toEqual([OTHER_PLAYER, PLAYER])
  })

  it("logs a note that couldn't be written, and leaves it out of the AI's memory", async () => {
    await addNote(await playRound(), grok, { error: "timed out" })
    expect((await readNoteLog(PLAYER))[0]).toMatchObject({ noteId: 1, status: "failed", note: null, error: "timed out" })
    expect(await memorySnapshot(PLAYER)).toEqual({ profileVersion: null, noteIds: [] })
  })
})

describe("memory snapshot", () => {
  it("starts empty", async () => {
    expect(await memorySnapshot(PLAYER)).toEqual({ profileVersion: null, noteIds: [] })
    expect(await resolveMemory(PLAYER, await memorySnapshot(PLAYER))).toEqual({ profile: null, notes: [] })
  })

  it("is the latest profile plus the notes written since", async () => {
    await notes(CONSOLIDATE_EVERY)
    const pending = (await notesToConsolidate(PLAYER))!
    await addProfile(PLAYER, pending.previous, pending.notes, grok, "Shares when flattered.")
    await notes(2)

    const snapshot = await memorySnapshot(PLAYER)
    expect(snapshot).toEqual({ profileVersion: 1, noteIds: [11, 12] })
    expect(await resolveMemory(PLAYER, snapshot)).toMatchObject({
      profile: "Shares when flattered.",
      notes: [{ noteId: 11 }, { noteId: 12 }],
    })
  })

  it("resolves an old snapshot to exactly what the AI saw then", async () => {
    await notes(3)
    const then = await memorySnapshot(PLAYER)
    await notes(2)
    expect((await resolveMemory(PLAYER, then)).notes.map((note) => note.noteId)).toEqual([1, 2, 3])
  })

  it("is each player's own", async () => {
    await notes(2)
    await notes(1, OTHER_PLAYER)
    expect(await memorySnapshot(OTHER_PLAYER)).toEqual({ profileVersion: null, noteIds: [1] })
    expect((await resolveMemory(OTHER_PLAYER, { profileVersion: null, noteIds: [1, 2] })).notes).toMatchObject([
      { playerId: OTHER_PLAYER, note: "Note 1." },
    ])
  })

  it("is saved on each round, and drives the AI's player context", async () => {
    await notes(2)
    await notes(1, OTHER_PLAYER)
    const record = await playRound()
    expect(record.memory).toEqual({ profileVersion: null, noteIds: [1, 2] })
    expect(await playerContext(PLAYER, record.memory)).toMatchObject({
      // The score is everyone's; the history and memory are this player's.
      stats: { gamesPlayed: 4 },
      recentRounds: [{}, {}, {}],
      memory: { profile: null, notes: [{ note: "Note 1." }, { note: "Note 2." }] },
    })
  })
})

describe("consolidation", () => {
  it(`folds a player's notes into a new profile version every ${CONSOLIDATE_EVERY} notes`, async () => {
    await notes(CONSOLIDATE_EVERY - 1)
    expect(await notesToConsolidate(PLAYER)).toBeNull()
    await notes(1)
    const first = (await notesToConsolidate(PLAYER))!
    expect(first.previous).toBeNull()
    expect(first.notes.map((note) => note.noteId)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])

    const v1 = await addProfile(PLAYER, first.previous, first.notes, claude, "v1 text", new Date("2026-11-01T00:00:00Z"))
    expect(v1).toEqual({
      playerId: PLAYER,
      version: 1,
      createdAt: "2026-11-01T00:00:00.000Z",
      provider: "claude",
      apiModel: "claude-sonnet-5-5",
      coversNotesThrough: 10,
      newNoteIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      profile: "v1 text",
    })
    expect(await notesToConsolidate(PLAYER)).toBeNull()

    await notes(CONSOLIDATE_EVERY)
    const second = (await notesToConsolidate(PLAYER))!
    expect(second.previous?.version).toBe(1)
    await addProfile(PLAYER, second.previous, second.notes, grok, "v2 text")
    expect((await readProfiles(PLAYER)).map((p) => [p.version, p.coversNotesThrough])).toEqual([
      [1, 10],
      [2, 20],
    ])
    expect(await readProfiles(OTHER_PLAYER)).toEqual([])
  })
})

describe("rememberRound", () => {
  const reply = (format: { name: string }) =>
    Promise.resolve(format.name === "note" ? "They bluffed." : "Consolidated profile.")

  it("writes the AI's note after a round", async () => {
    generateStructured.mockImplementation((_o, _r, format) => reply(format))
    await rememberRound(grok, await playRound())
    expect(await readNoteLog(PLAYER)).toMatchObject([{ noteId: 1, status: "ok", note: "They bluffed.", provider: "grok" }])
    expect(generateStructured).toHaveBeenCalledTimes(1)
  })

  it(`consolidates once the ${CONSOLIDATE_EVERY}th note is in`, async () => {
    await notes(CONSOLIDATE_EVERY - 1)
    generateStructured.mockImplementation((_o, _r, format) => reply(format))
    await rememberRound(claude, await playRound())

    expect(generateStructured).toHaveBeenCalledTimes(2)
    expect(generateStructured.mock.calls[1][1].turns[0].content).toContain("#10")
    expect(await readProfiles(PLAYER)).toMatchObject([{ version: 1, provider: "claude", profile: "Consolidated profile." }])
  })

  it("logs a failed note and skips consolidation", async () => {
    await notes(CONSOLIDATE_EVERY - 1)
    generateStructured.mockRejectedValue(new Error("rate limited"))
    await rememberRound(grok, await playRound())
    expect((await readNoteLog(PLAYER)).at(-1)).toMatchObject({ status: "failed", error: "rate limited" })
    expect(await readProfiles(PLAYER)).toEqual([])
  })

  it("keeps the notes pending if consolidation fails, so the next round retries", async () => {
    await notes(CONSOLIDATE_EVERY - 1)
    generateStructured.mockImplementation((_o, _r, format) =>
      format.name === "note" ? Promise.resolve("ok") : Promise.reject(new Error("boom")),
    )
    await rememberRound(grok, await playRound())
    expect(await readProfiles(PLAYER)).toEqual([])
    expect((await notesToConsolidate(PLAYER))?.notes).toHaveLength(CONSOLIDATE_EVERY)
  })
})
