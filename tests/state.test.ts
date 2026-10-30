import { describe, expect, it } from "vitest"
import { STRATEGIC_PROFILE_VERSION } from "@/lib/game/prompts"
import { gameReducer, humanFinished, initialGameState, type GameAction, type GameState } from "@/lib/game/state"
import type { Message } from "@/types/game"

const start = (state: GameState = initialGameState, roundId = "r1"): GameState =>
  gameReducer(state, { type: "START_ROUND", model: "claude", roundId, now: 0 })

const run = (state: GameState, ...actions: GameAction[]) => actions.reduce(gameReducer, state)
const you = (content = "hi"): Message => ({ sender: "YOU", content, timestamp: 1 })
const ai = (content = "hey"): Message => ({ sender: "AI", content, timestamp: 1 })
const humanMsg = (roundId = "r1"): GameAction => ({ type: "HUMAN_MESSAGE", roundId, message: you() })
const aiTurn = (message: Message | null, lockIn: "SHARE" | "KEEP" | null = null, lockInReason: string | null = null): GameAction => ({
  type: "AI_TURN",
  roundId: "r1",
  message,
  lockIn,
  lockInReason,
})

describe("gameReducer", () => {
  it("starts a round with the welcome message", () => {
    const state = start()
    expect(state.phase).toBe("chatting")
    expect(state.messages.map((m) => m.sender)).toEqual(["SYSTEM"])
  })

  it("lets either side send several messages in a row", () => {
    const state = run(start(), humanMsg(), humanMsg(), aiTurn(ai()), aiTurn(ai()), aiTurn(ai()))
    expect(state.messages.map((m) => m.sender)).toEqual(["SYSTEM", "YOU", "YOU", "AI", "AI", "AI"])
  })

  it("caps each side at 5 messages", () => {
    const state = run(start(), ...Array(7).fill(humanMsg()), ...Array(7).fill(aiTurn(ai())))
    expect(state.messages.filter((m) => m.sender === "YOU")).toHaveLength(5)
    expect(state.messages.filter((m) => m.sender === "AI")).toHaveLength(5)
  })

  it("keeps chatting after one side locks in, and closes when both have", () => {
    let state = run(start(), { type: "HUMAN_LOCK_IN", roundId: "r1", choice: "SHARE" }, humanMsg())
    expect(state.phase).toBe("chatting")
    expect(state.messages.filter((m) => m.sender === "YOU")).toHaveLength(1)

    state = gameReducer(state, aiTurn(ai("deal"), "KEEP"))
    expect(state.phase).toBe("locked")
    expect(state.messages.at(-1)?.content).toBe("deal")

    // Nothing more can be sent once the chat closes.
    state = run(state, humanMsg(), aiTurn(ai()))
    expect(state.messages.at(-1)?.content).toBe("deal")
  })

  it("makes lock-ins final", () => {
    const state = run(
      start(),
      { type: "HUMAN_LOCK_IN", roundId: "r1", choice: "SHARE" },
      { type: "HUMAN_LOCK_IN", roundId: "r1", choice: "KEEP" },
      aiTurn(null, "KEEP"),
      aiTurn(null, "SHARE"),
    )
    expect(state.humanLockIn).toBe("SHARE")
    expect(state.aiLockIn).toBe("KEEP")
  })

  it("scores the reveal from both lock-ins", () => {
    const state = run(
      start(),
      aiTurn(null, "SHARE"),
      { type: "HUMAN_LOCK_IN", roundId: "r1", choice: "KEEP" },
      { type: "REVEAL", roundId: "r1", date: "d" },
    )
    expect(state.phase).toBe("result")
    expect(state.lastResult).toMatchObject({ yourDecision: "KEEP", aiDecision: "SHARE", yourPoints: 5, aiPoints: 0 })
  })

  it("keeps the AI's first lock-in reason and puts it on the result", () => {
    const state = run(
      start(),
      aiTurn(null, "KEEP", "They dodged every question."),
      aiTurn(null, "SHARE", "changed my mind"),
      { type: "HUMAN_LOCK_IN", roundId: "r1", choice: "SHARE" },
      { type: "REVEAL", roundId: "r1", date: "d" },
    )
    expect(state.lastResult?.aiReasoning).toBe("They dodged every question.")
    expect(state.history[0].aiReasoning).toBe("They dodged every question.")
    expect(state.lastResult?.profileVersion).toBe(STRATEGIC_PROFILE_VERSION)
  })

  it("doesn't reveal until both have locked in", () => {
    const state = run(start(), { type: "HUMAN_LOCK_IN", roundId: "r1", choice: "SHARE" }, { type: "REVEAL", roundId: "r1", date: "d" })
    expect(state.phase).toBe("chatting")
    expect(state.lastResult).toBeNull()
  })

  it("stops your messages after I'M DONE TALKING (only once you've locked in)", () => {
    let state = gameReducer(start(), { type: "HUMAN_DONE", roundId: "r1" })
    expect(state.humanDone).toBe(false)
    state = run(state, { type: "HUMAN_LOCK_IN", roundId: "r1", choice: "KEEP" }, { type: "HUMAN_DONE", roundId: "r1" }, humanMsg())
    expect(state.humanDone).toBe(true)
    expect(state.messages).toHaveLength(1)
  })

  it("ignores actions from a replaced round", () => {
    const state = run(start(start(), "r2"), aiTurn(ai("stale"), "KEEP"))
    expect(state.messages).toHaveLength(1)
    expect(state.aiLockIn).toBeNull()
  })

  it("keeps session history across rounds", () => {
    const played = run(
      start(),
      aiTurn(null, "SHARE"),
      { type: "HUMAN_LOCK_IN", roundId: "r1", choice: "SHARE" },
      { type: "REVEAL", roundId: "r1", date: "d" },
    )
    const next = start(played, "r2")
    expect(next.history).toHaveLength(1)
    expect(next.aiLockIn).toBeNull()
    expect(next.lastResult).toBeNull()
  })
})

describe("humanFinished", () => {
  it("is true once you've locked in and are out of messages or done talking", () => {
    const locked = run(start(), { type: "HUMAN_LOCK_IN", roundId: "r1", choice: "SHARE" })
    expect(humanFinished(locked)).toBe(false)
    expect(humanFinished(gameReducer(locked, { type: "HUMAN_DONE", roundId: "r1" }))).toBe(true)
    expect(humanFinished(run(locked, ...Array(5).fill(humanMsg())))).toBe(true)
    // Out of messages but not locked in: still has something to do.
    expect(humanFinished(run(start(), ...Array(5).fill(humanMsg())))).toBe(false)
  })
})
