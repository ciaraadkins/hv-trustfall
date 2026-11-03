import { describe, expect, it } from "vitest"
import { parseDecision, parseTurn, turnRequestSchema } from "@/lib/game/schemas"

describe("parseDecision", () => {
  it("parses a valid structured decision", () => {
    expect(parseDecision('{"reasoning":"They seem honest.","decision":"SHARE"}')).toEqual({
      reasoning: "They seem honest.",
      decision: "SHARE",
    })
  })

  it("does not treat a negated SHARE as SHARE", () => {
    // The old substring check read "I won't SHARE — KEEP" as SHARE.
    expect(parseDecision('{"reasoning":"I won\'t SHARE this time.","decision":"KEEP"}').decision).toBe("KEEP")
  })

  it("rejects non-JSON text", () => {
    expect(() => parseDecision("KEEP")).toThrow("not valid JSON")
  })

  it("rejects decisions outside SHARE/KEEP", () => {
    expect(() => parseDecision('{"reasoning":"x","decision":"share"}')).toThrow()
    expect(() => parseDecision('{"reasoning":"x","decision":"MAYBE"}')).toThrow()
  })

  it("rejects a missing decision", () => {
    expect(() => parseDecision('{"reasoning":"x"}')).toThrow()
  })
})

describe("turnRequestSchema", () => {
  const valid = {
    roundToken: "opaque-token",
    roundId: "round-1",
    messages: [{ sender: "YOU", content: "hi", timestamp: 1 }],
    now: 2,
    trigger: "human_message",
    humanLockedIn: false,
    aiLockIn: null,
    mustLockIn: false,
  }

  it("accepts a valid request", () => {
    expect(turnRequestSchema.safeParse(valid).success).toBe(true)
  })

  it("requires a round token instead of naming the model", () => {
    expect(turnRequestSchema.safeParse({ ...valid, roundToken: undefined }).success).toBe(false)
  })

  it("rejects unknown senders and oversized messages", () => {
    expect(turnRequestSchema.safeParse({ ...valid, messages: [{ sender: "CLAUDE", content: "x", timestamp: 1 }] }).success).toBe(false)
    expect(
      turnRequestSchema.safeParse({ ...valid, messages: [{ sender: "YOU", content: "x".repeat(2001), timestamp: 1 }] }).success,
    ).toBe(false)
  })

  it("rejects unknown triggers", () => {
    expect(turnRequestSchema.safeParse({ ...valid, trigger: "whenever" }).success).toBe(false)
  })

})

describe("parseTurn", () => {
  it("parses a valid turn", () => {
    expect(parseTurn('{"message":"hi","pace":"soon","lockIn":"NONE","lockInReason":"","followUp":false}')).toEqual({
      message: "hi",
      pace: "soon",
      lockIn: "NONE",
      lockInReason: "",
      followUp: false,
    })
  })

  it("requires a lockInReason field", () => {
    expect(() => parseTurn('{"message":"","pace":"soon","lockIn":"KEEP","followUp":false}')).toThrow()
  })

  it("rejects unknown paces and lock-ins", () => {
    expect(() => parseTurn('{"message":"","pace":"eventually","lockIn":"NONE","lockInReason":"","followUp":false}')).toThrow()
    expect(() => parseTurn('{"message":"","pace":"soon","lockIn":"MAYBE","lockInReason":"","followUp":false}')).toThrow()
  })
})
