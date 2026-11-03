import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import type { Opponent } from "@/lib/server/providers"
import type { Choice, RoundRecord } from "@/types/game"

const { generateStructured } = vi.hoisted(() => ({ generateStructured: vi.fn() }))
vi.mock("@/lib/server/providers", () => ({ generateStructured, GameError: class extends Error {} }))

import {
  CONSOLIDATE_EVERY,
  addNote,
  addProfile,
  memorySnapshot,
  notesToConsolidate,
  playerContext,
  readNoteLog,
  readProfiles,
  resolveMemory,
} from "@/lib/server/memory"
import { rememberRound } from "@/lib/server/game"
import { recordRound } from "@/lib/server/store"

let dir: string

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "trustfall-memory-"))
  process.env.TRUSTFALL_DATA_DIR = dir
  generateStructured.mockReset()
  vi.spyOn(console, "error").mockImplementation(() => {})
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  delete process.env.TRUSTFALL_DATA_DIR
})

const grok: Opponent = { model: "grok", apiModel: "grok-4.20-0309-non-reasoning" }
const claude: Opponent = { model: "claude", apiModel: "claude-sonnet-5-5" }

let n = 0
function playRound(humanDecision: Choice = "SHARE", aiDecision: Choice = "KEEP"): RoundRecord {
  return recordRound({
    roundId: `round-${++n}`,
    opponent: grok,
    messages: [{ sender: "SYSTEM", content: "welcome", timestamp: 0 }],
    humanDecision,
    aiDecision,
    aiLockInReason: null,
    memory: memorySnapshot(),
  }).record
}

/** Play `count` rounds, each with a note. */
function notes(count: number) {
  for (let i = 0; i < count; i++) addNote(playRound(), grok, { note: `Note ${i + 1}.` })
}

describe("notes log", () => {
  it("numbers notes and records when, which round, who wrote them, and the outcome", () => {
    const record = playRound("KEEP", "SHARE")
    const note = addNote(record, grok, { note: " Said share, kept. " }, new Date("2026-10-30T17:42:13Z"))
    expect(note).toEqual({
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
    expect(addNote(playRound(), grok, { note: "Again." }).noteId).toBe(2)
    expect(readNoteLog()).toHaveLength(2)
  })

  it("logs a note that couldn't be written, and leaves it out of the AI's memory", () => {
    addNote(playRound(), grok, { error: "timed out" })
    expect(readNoteLog()[0]).toMatchObject({ noteId: 1, status: "failed", note: null, error: "timed out" })
    expect(memorySnapshot()).toEqual({ profileVersion: null, noteIds: [] })
  })
})

describe("memory snapshot", () => {
  it("starts empty", () => {
    expect(memorySnapshot()).toEqual({ profileVersion: null, noteIds: [] })
    expect(resolveMemory(memorySnapshot())).toEqual({ profile: null, notes: [] })
  })

  it("is the latest profile plus the notes written since", () => {
    notes(CONSOLIDATE_EVERY)
    const pending = notesToConsolidate()!
    addProfile(pending.previous, pending.notes, grok, "Shares when flattered.")
    notes(2)

    const snapshot = memorySnapshot()
    expect(snapshot).toEqual({ profileVersion: 1, noteIds: [11, 12] })
    expect(resolveMemory(snapshot)).toMatchObject({
      profile: "Shares when flattered.",
      notes: [{ noteId: 11 }, { noteId: 12 }],
    })
  })

  it("resolves an old snapshot to exactly what the AI saw then", () => {
    notes(3)
    const then = memorySnapshot()
    notes(2)
    expect(resolveMemory(then).notes.map((note) => note.noteId)).toEqual([1, 2, 3])
  })

  it("is saved on each round, and drives the AI's player context", () => {
    notes(2)
    const record = playRound()
    expect(record.memory).toEqual({ profileVersion: null, noteIds: [1, 2] })
    expect(playerContext(record.memory)).toMatchObject({
      stats: { gamesPlayed: 3 },
      memory: { profile: null, notes: [{ note: "Note 1." }, { note: "Note 2." }] },
    })
  })
})

describe("consolidation", () => {
  it(`folds notes into a new profile version every ${CONSOLIDATE_EVERY} notes`, () => {
    notes(CONSOLIDATE_EVERY - 1)
    expect(notesToConsolidate()).toBeNull()
    notes(1)
    const first = notesToConsolidate()!
    expect(first.previous).toBeNull()
    expect(first.notes.map((note) => note.noteId)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])

    const v1 = addProfile(first.previous, first.notes, claude, "v1 text", new Date("2026-11-01T00:00:00Z"))
    expect(v1).toEqual({
      version: 1,
      createdAt: "2026-11-01T00:00:00.000Z",
      provider: "claude",
      apiModel: "claude-sonnet-5-5",
      coversNotesThrough: 10,
      newNoteIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      profile: "v1 text",
    })
    expect(notesToConsolidate()).toBeNull()

    notes(CONSOLIDATE_EVERY)
    const second = notesToConsolidate()!
    expect(second.previous?.version).toBe(1)
    addProfile(second.previous, second.notes, grok, "v2 text")
    expect(readProfiles().map((p) => [p.version, p.coversNotesThrough])).toEqual([
      [1, 10],
      [2, 20],
    ])
  })
})

describe("readable copy", () => {
  it("regenerates data/ai-memory.md with the profile and every note", () => {
    notes(CONSOLIDATE_EVERY)
    const pending = notesToConsolidate()!
    addProfile(pending.previous, pending.notes, claude, "The profile.")
    addNote(playRound("KEEP", "KEEP"), grok, { error: "boom" })

    const md = readFileSync(path.join(dir, "ai-memory.md"), "utf8")
    expect(md).toContain("## Profile v1")
    expect(md).toContain("covers notes #1-#10")
    expect(md).toContain("The profile.")
    expect(md).toContain("### #11 ·")
    expect(md).toContain("(Couldn't be written: boom)")
    expect(md).toContain("by GROK")
  })
})

describe("rememberRound", () => {
  const reply = (format: { name: string }) =>
    Promise.resolve(format.name === "note" ? "They bluffed." : "Consolidated profile.")

  it("writes the AI's note after a round", async () => {
    generateStructured.mockImplementation((_o, _r, format) => reply(format))
    await rememberRound(grok, playRound())
    expect(readNoteLog()).toMatchObject([{ noteId: 1, status: "ok", note: "They bluffed.", provider: "grok" }])
    expect(generateStructured).toHaveBeenCalledTimes(1)
  })

  it(`consolidates once the ${CONSOLIDATE_EVERY}th note is in`, async () => {
    notes(CONSOLIDATE_EVERY - 1)
    generateStructured.mockImplementation((_o, _r, format) => reply(format))
    await rememberRound(claude, playRound())

    expect(generateStructured).toHaveBeenCalledTimes(2)
    expect(generateStructured.mock.calls[1][1].turns[0].content).toContain("#10")
    expect(readProfiles()).toMatchObject([{ version: 1, provider: "claude", profile: "Consolidated profile." }])
  })

  it("logs a failed note and skips consolidation", async () => {
    notes(CONSOLIDATE_EVERY - 1)
    generateStructured.mockRejectedValue(new Error("rate limited"))
    await rememberRound(grok, playRound())
    expect(readNoteLog().at(-1)).toMatchObject({ status: "failed", error: "rate limited" })
    expect(readProfiles()).toEqual([])
  })

  it("keeps the notes pending if consolidation fails, so the next round retries", async () => {
    notes(CONSOLIDATE_EVERY - 1)
    generateStructured.mockImplementation((_o, _r, format) =>
      format.name === "note" ? Promise.resolve("ok") : Promise.reject(new Error("boom")),
    )
    await rememberRound(grok, playRound())
    expect(readProfiles()).toEqual([])
    expect(notesToConsolidate()?.notes).toHaveLength(CONSOLIDATE_EVERY)
  })
})
