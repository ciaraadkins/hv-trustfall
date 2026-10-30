import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createGameEngine } from "@/lib/game/engine"
import type { TurnRequest, TurnResponse } from "@/lib/game/schemas"

type Call = { payload: TurnRequest; resolve: (r: TurnResponse) => void; reject: (e: Error) => void; signal: AbortSignal }

function setup() {
  const calls: Call[] = []
  const engine = createGameEngine({
    // Midpoint of every random range, and no pace jitter.
    random: () => 0.5,
    requestTurn: (payload, signal) =>
      new Promise((resolve, reject) => {
        calls.push({ payload, resolve, reject, signal })
      }),
  })
  engine.startRound("claude", "r1")
  return { engine, calls }
}

const reply = (message: string | null, extra: Partial<TurnResponse> = {}): TurnResponse => ({
  message,
  pace: "immediate",
  lockIn: null,
  lockInReason: null,
  followUp: false,
  ...extra,
})

/** Let resolved promises run, then advance fake time. */
async function advance(ms: number) {
  await vi.advanceTimersByTimeAsync(ms)
}

describe("game engine", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it("asks the AI once after a burst of human messages", async () => {
    const { engine, calls } = setup()
    engine.sendMessage("one")
    await advance(1000)
    engine.sendMessage("two")
    await advance(1000)
    expect(calls).toHaveLength(0)
    await advance(2000)
    expect(calls).toHaveLength(1)
    expect(calls[0].payload.trigger).toBe("human_message")
    expect(calls[0].payload.messages.filter((m) => m.sender === "YOU")).toHaveLength(2)
  })

  it("shows typing only for the last stretch, then delivers", async () => {
    const { engine, calls } = setup()
    engine.sendMessage("hi")
    await advance(2000)
    calls[0].resolve(reply("hello there"))
    // immediate at midpoint = 2500ms total; "hello there" types for 1000ms.
    await advance(1000)
    expect(engine.getState().aiTyping).toBe(false)
    await advance(600)
    expect(engine.getState().aiTyping).toBe(true)
    await advance(1000)
    expect(engine.getState().aiTyping).toBe(false)
    expect(engine.getState().messages.at(-1)).toMatchObject({ sender: "AI", content: "hello there" })
  })

  it("drops the AI's reply if you send while it's still reading", async () => {
    const { engine, calls } = setup()
    engine.sendMessage("hi")
    await advance(2000)
    calls[0].resolve(reply("stale reply", { pace: "soon" }))
    await advance(1000)
    engine.sendMessage("actually, wait")
    expect(calls[0].signal.aborted).toBe(true)
    await advance(20000)
    expect(engine.getState().messages.some((m) => m.content === "stale reply")).toBe(false)
    expect(calls).toHaveLength(2)
    expect(calls[1].payload.messages.at(-1)?.content).toBe("actually, wait")
  })

  it("delivers a crossed message that was already being typed", async () => {
    const { engine, calls } = setup()
    engine.sendMessage("hi")
    await advance(2000)
    calls[0].resolve(reply("typing this"))
    await advance(1600) // now typing
    expect(engine.getState().aiTyping).toBe(true)
    engine.sendMessage("crossed")
    await advance(1000)
    const contents = engine.getState().messages.map((m) => m.content)
    expect(contents).toContain("typing this")
    expect(contents.indexOf("crossed")).toBeLessThan(contents.indexOf("typing this"))
    await advance(3000)
    expect(calls).toHaveLength(2)
  })

  it("lets the AI open the chat after a quiet spell", async () => {
    const { calls } = setup()
    await advance(27500) // midpoint of 15–40s
    expect(calls).toHaveLength(1)
    expect(calls[0].payload.trigger).toBe("human_quiet")
  })

  it("stops quiet checks after 3 silent ones in a row", async () => {
    const { calls } = setup()
    for (let i = 0; i < 3; i++) {
      await advance(27500)
      calls[i].resolve(reply(null))
    }
    await advance(120000)
    expect(calls).toHaveLength(3)
  })

  it("follows up when asked, up to 3 messages in a row", async () => {
    const { engine, calls } = setup()
    engine.sendMessage("hi")
    await advance(2000)
    for (let i = 0; i < 3; i++) {
      calls[i].resolve(reply(`msg ${i}`, { followUp: true }))
      await advance(3000)
    }
    expect(calls.map((c) => c.payload.trigger)).toEqual(["human_message", "follow_up", "follow_up"])
    expect(engine.getState().messages.filter((m) => m.sender === "AI")).toHaveLength(3)
    await advance(1000)
    expect(calls).toHaveLength(3) // no fourth in a row
  })

  it("skips a follow-up while you're typing", async () => {
    const { engine, calls } = setup()
    engine.sendMessage("hi")
    await advance(2000)
    calls[0].resolve(reply("first", { followUp: true }))
    await advance(2000)
    engine.notifyTyping()
    await advance(1000)
    expect(calls).toHaveLength(1)
  })

  it("applies the AI's lock-in when its message appears, not before", async () => {
    const { engine, calls } = setup()
    engine.sendMessage("hi")
    await advance(2000)
    calls[0].resolve(reply("sure", { lockIn: "KEEP" }))
    await advance(100)
    expect(engine.getState().aiLockIn).toBeNull()
    await advance(3000)
    expect(engine.getState().aiLockIn).toBe("KEEP")
  })

  it("forces the AI to lock in when you're done talking, and closes the round", async () => {
    const { engine, calls } = setup()
    engine.lockIn("SHARE")
    engine.doneTalking()
    await advance(0)
    const last = calls.at(-1)!
    expect(last.payload.trigger).toBe("human_finished")
    expect(last.payload.mustLockIn).toBe(true)
    last.resolve(reply(null, { lockIn: "KEEP", pace: "later" }))
    await advance(15000) // "later" is capped to "soon" while you wait
    expect(engine.getState().phase).toBe("locked")
    engine.reveal()
    expect(engine.getState().lastResult).toMatchObject({ yourDecision: "SHARE", aiDecision: "KEEP" })
  })

  it("shows an error, not a random move, when a required lock-in fails", async () => {
    const { engine, calls } = setup()
    engine.lockIn("SHARE")
    engine.doneTalking()
    await advance(0)
    calls.at(-1)!.reject(new Error("The ANTHROPIC_API_KEY was rejected."))
    await advance(0)
    expect(engine.getState().aiLockIn).toBeNull()
    expect(engine.getState().error).toContain("rejected")

    engine.retryLockIn()
    await advance(0)
    expect(calls.at(-1)!.payload.mustLockIn).toBe(true)
  })

  it("treats a failed chat turn as silence", async () => {
    const { engine, calls } = setup()
    engine.sendMessage("hi")
    await advance(2000)
    calls[0].reject(new Error("Couldn't reach Claude."))
    await advance(0)
    expect(engine.getState().error).toBeNull()
    expect(engine.getState().messages.filter((m) => m.sender === "AI")).toHaveLength(0)
    await advance(27500)
    expect(calls).toHaveLength(2)
  })
})
