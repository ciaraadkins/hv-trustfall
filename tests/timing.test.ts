import { describe, expect, it } from "vitest"
import { MAX_RESPONSE_MS, PACE_RANGES_MS, capPace, jitterPace, planDelivery, randomBetween } from "@/lib/game/timing"
import { aiMayLockIn, aiStreak, lastMessageAt, messagesLeft } from "@/lib/game/rules"

const fixed = (...values: number[]) => {
  let i = 0
  return () => values[Math.min(i++, values.length - 1)]
}

describe("timing", () => {
  it("picks delays inside each pace's range", () => {
    for (const [min, max] of Object.values(PACE_RANGES_MS)) {
      expect(randomBetween([min, max], () => 0)).toBe(min)
      expect(randomBetween([min, max], () => 1)).toBe(max)
    }
  })

  it("usually keeps the pace, sometimes nudges it one step", () => {
    expect(jitterPace("soon", fixed(0.5))).toBe("soon")
    expect(jitterPace("soon", fixed(0.01, 0.1))).toBe("immediate")
    expect(jitterPace("soon", fixed(0.01, 0.9))).toBe("later")
    expect(jitterPace("later", fixed(0.01, 0.9))).toBe("later")
  })

  it("caps a pace", () => {
    expect(capPace("later", "soon")).toBe("soon")
    expect(capPace("immediate", "soon")).toBe("immediate")
  })

  it("splits the delay into reading and typing, typing scaled to length", () => {
    const short = planDelivery({ pace: "soon", messageLength: 10, elapsedMs: 0 }, () => 0.5)
    expect(short.readingMs + short.typingMs).toBe(10000)
    expect(short.typingMs).toBe(1000)

    const long = planDelivery({ pace: "soon", messageLength: 500, elapsedMs: 0 }, () => 0.5)
    expect(long.typingMs).toBe(6000)
  })

  it("never lands later than a minute after the trigger", () => {
    const plan = planDelivery({ pace: "later", messageLength: 50, elapsedMs: 30000 }, () => 1)
    expect(plan.readingMs + plan.typingMs).toBe(MAX_RESPONSE_MS - 30000)

    const late = planDelivery({ pace: "later", messageLength: 50, elapsedMs: 70000 }, () => 1)
    expect(late).toEqual({ readingMs: 0, typingMs: 0 })
  })

  it("has no typing phase for a lock-in without a message", () => {
    expect(planDelivery({ pace: "immediate", messageLength: 0, elapsedMs: 0 }, () => 0).typingMs).toBe(0)
  })
})

describe("rules", () => {
  const messages = [
    { sender: "SYSTEM" as const, timestamp: 0 },
    { sender: "YOU" as const, timestamp: 1 },
    { sender: "AI" as const, timestamp: 2 },
    { sender: "AI" as const, timestamp: 3 },
  ]

  it("counts messages left per side", () => {
    expect(messagesLeft(messages, "YOU")).toBe(4)
    expect(messagesLeft(messages, "AI")).toBe(3)
  })

  it("counts the AI's current streak", () => {
    expect(aiStreak(messages)).toBe(2)
    expect(aiStreak([...messages, { sender: "YOU" as const, timestamp: 4 }])).toBe(0)
  })

  it("opens the AI's lock-in after 3 human messages or 2 minutes, whichever comes first", () => {
    const start = { sender: "SYSTEM" as const, timestamp: 0 }
    const human = (t: number) => ({ sender: "YOU" as const, timestamp: t })
    const aiMsg = (t: number) => ({ sender: "AI" as const, timestamp: t })

    expect(aiMayLockIn([start], 119_999)).toBe(false)
    expect(aiMayLockIn([start], 120_000)).toBe(true)
    expect(aiMayLockIn([start, human(1), human(2)], 10_000)).toBe(false)
    expect(aiMayLockIn([start, human(1), human(2), human(3)], 10_000)).toBe(true)
    // The AI's own messages don't count toward the threshold.
    expect(aiMayLockIn([start, human(1), aiMsg(2), aiMsg(3), aiMsg(4)], 10_000)).toBe(false)
  })

  it("finds each side's last message time", () => {
    expect(lastMessageAt(messages, "AI")).toBe(3)
    expect(lastMessageAt(messages.slice(0, 1), "YOU")).toBeNull()
  })
})
