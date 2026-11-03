import { beforeEach, describe, expect, it, vi } from "vitest"
import { EMPTY_STATS } from "@/lib/game/scoring"
import type { PlayerContext } from "@/lib/game/prompts"
import type { TurnRequest } from "@/lib/game/schemas"

const { generateStructured } = vi.hoisted(() => ({ generateStructured: vi.fn() }))

vi.mock("@/lib/server/providers", () => ({
  generateStructured,
  GameError: class extends Error {},
}))

import { takeAiTurn as takeTurn } from "@/lib/server/game"

const opponent = { model: "claude" as const, apiModel: "claude-sonnet-5-5" }
const player: PlayerContext = {
  stats: EMPTY_STATS,
  recentRounds: [],
  memory: {
    profile: null,
    notes: [{ noteId: 1, addedAt: "2026-10-30T00:00:00Z", humanDecision: "SHARE", aiDecision: "KEEP", note: "Bluffs early, then shares." }],
  },
}
const takeAiTurn = (req: TurnRequest) => takeTurn(req, opponent, player)

let round = 0
const request = (overrides: Partial<TurnRequest> = {}): TurnRequest => ({
  roundToken: "token",
  roundId: `round-${++round}`,
  messages: [{ sender: "SYSTEM", content: "welcome", timestamp: 0 }, { sender: "YOU", content: "hi", timestamp: 1 }],
  now: 2,
  trigger: "human_message",
  humanLockedIn: false,
  aiLockIn: null,
  mustLockIn: false,
  ...overrides,
})

const aiMessages = (n: number) => Array.from({ length: n }, (_, i) => ({ sender: "AI" as const, content: "x", timestamp: i }))
const humanMessages = (n: number) => Array.from({ length: n }, (_, i) => ({ sender: "YOU" as const, content: "y", timestamp: i }))
const turn = (fields: object) => ({ message: "", pace: "soon", lockIn: "NONE", lockInReason: "", followUp: false, ...fields })

/** Answer the turn call with `turn`, and any forced decision with `decision`. */
function modelReturns(turnOutput: object, decision = "KEEP") {
  generateStructured.mockImplementation((_model, _req, format: { name: string }) =>
    Promise.resolve(format.name === "turn" ? turn(turnOutput) : { reasoning: "forced reason", decision }),
  )
}

describe("takeAiTurn", () => {
  beforeEach(() => {
    generateStructured.mockReset()
  })

  it("returns the AI's message, pace, and follow-up choice", async () => {
    modelReturns({ message: "**Deal?**", pace: "later", lockIn: "NONE", followUp: true })
    await expect(takeAiTurn(request())).resolves.toEqual({
      message: "Deal?",
      pace: "later",
      lockIn: null,
      lockInReason: null,
      followUp: true,
    })
  })

  it("treats an empty message as staying silent", async () => {
    modelReturns({ message: "  ", pace: "soon", lockIn: "NONE", followUp: true })
    await expect(takeAiTurn(request())).resolves.toMatchObject({ message: null, followUp: false })
  })

  it("drops a lock-in during the opening of the round", async () => {
    modelReturns({ message: "I'm in", pace: "immediate", lockIn: "SHARE", lockInReason: "trusting", followUp: false })
    await expect(takeAiTurn(request({ now: 30_000 }))).resolves.toMatchObject({
      message: "I'm in",
      lockIn: null,
      lockInReason: null,
    })
  })

  it("allows a lock-in after the human's 3rd message, with its reason", async () => {
    modelReturns({ message: "ok", lockIn: "KEEP", lockInReason: "They keep dodging." })
    const messages = [{ sender: "SYSTEM" as const, content: "welcome", timestamp: 0 }, ...humanMessages(3)]
    await expect(takeAiTurn(request({ messages, now: 30_000 }))).resolves.toMatchObject({
      lockIn: "KEEP",
      lockInReason: "They keep dodging.",
    })
  })

  it("allows a lock-in 2 minutes into the round", async () => {
    modelReturns({ message: "", lockIn: "SHARE", lockInReason: "Waited long enough." })
    await expect(takeAiTurn(request({ now: 120_000 }))).resolves.toMatchObject({ lockIn: "SHARE" })
  })

  it("still allows a required lock-in during the opening", async () => {
    modelReturns({ message: "", lockIn: "KEEP", lockInReason: "They're done talking." })
    await expect(
      takeAiTurn(request({ now: 5_000, trigger: "human_finished", mustLockIn: true })),
    ).resolves.toMatchObject({ lockIn: "KEEP", lockInReason: "They're done talking." })
  })

  it("keeps an earlier lock-in final", async () => {
    modelReturns({ message: "hm", pace: "soon", lockIn: "SHARE", followUp: false })
    await expect(takeAiTurn(request({ aiLockIn: "KEEP" }))).resolves.toMatchObject({ lockIn: null })
  })

  it("forces a lock-in with the AI's last message", async () => {
    modelReturns({ message: "last one", pace: "soon", lockIn: "NONE", followUp: true })
    const result = await takeAiTurn(request({ messages: aiMessages(4) }))
    expect(result).toMatchObject({ message: "last one", lockIn: "KEEP", lockInReason: "forced reason", followUp: false })
  })

  it("forces a lock-in when the human is waiting", async () => {
    modelReturns({ message: "", pace: "later", lockIn: "NONE", followUp: false }, "SHARE")
    await expect(takeAiTurn(request({ trigger: "human_finished", mustLockIn: true }))).resolves.toMatchObject({
      lockIn: "SHARE",
      lockInReason: "forced reason",
    })
  })

  it("still locks in if the turn call fails but a lock-in is required", async () => {
    generateStructured.mockImplementation((_m, _r, format: { name: string }) =>
      format.name === "turn" ? Promise.reject(new Error("boom")) : Promise.resolve({ reasoning: "r", decision: "SHARE" }),
    )
    await expect(takeAiTurn(request({ mustLockIn: true }))).resolves.toMatchObject({ message: null, lockIn: "SHARE" })
  })

  it("passes the error on when no lock-in is required", async () => {
    generateStructured.mockRejectedValue(new Error("boom"))
    await expect(takeAiTurn(request())).rejects.toThrow("boom")
  })

  it("skips the chat call when the AI is out of messages", async () => {
    modelReturns({ message: "never", pace: "soon", lockIn: "NONE", followUp: false })
    expect(await takeAiTurn(request({ messages: aiMessages(5), aiLockIn: "KEEP" }))).toEqual({
      message: null,
      pace: "immediate",
      lockIn: null,
      lockInReason: null,
      followUp: false,
    })
    expect(generateStructured).not.toHaveBeenCalled()
  })

  it("makes one model call per turn, using the fixed strategy", async () => {
    modelReturns({ message: "ok" })
    await takeAiTurn(request())
    expect(generateStructured).toHaveBeenCalledTimes(1)
    expect(generateStructured.mock.calls[0][0]).toEqual(opponent)
    expect(generateStructured.mock.calls[0][1].system).toContain("win the world's remaining freshwater for AI")
    expect(generateStructured.mock.calls[0][1].system).toContain("Bluffs early, then shares.")
  })

  it("sends the game update as the final user turn", async () => {
    modelReturns({ message: "ok", pace: "soon", lockIn: "NONE", followUp: false })
    await takeAiTurn(request({ trigger: "human_quiet", now: 32_000 }))
    const turns = generateStructured.mock.calls[0][1].turns
    expect(turns.at(-1).role).toBe("user")
    expect(turns.at(-1).content).toContain("[GAME UPDATE]")
    expect(turns.at(-1).content).toContain("quiet for 32 seconds")
  })
})
