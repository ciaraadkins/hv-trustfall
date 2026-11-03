import { beforeEach, describe, expect, it, vi } from "vitest"
import Anthropic from "@anthropic-ai/sdk"
import { DECISION_JSON_SCHEMA, parseDecision } from "@/lib/game/schemas"
import { GameError, generateStructured, type Opponent } from "@/lib/server/providers"

const generateDecision = (opponent: Opponent, req: Parameters<typeof generateStructured>[1]) =>
  generateStructured(opponent, req, { name: "decision", schema: DECISION_JSON_SCHEMA }, parseDecision)

const { create, chatCreate, openaiOptions } = vi.hoisted(() => ({
  create: vi.fn(),
  chatCreate: vi.fn(),
  openaiOptions: [] as unknown[],
}))

vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error {
    constructor(readonly status: number) {
      super(`status ${status}`)
    }
  }
  class Anthropic {
    static APIError = APIError
    messages = { create }
  }
  return { default: Anthropic }
})

vi.mock("openai", () => {
  class APIError extends Error {}
  class OpenAI {
    static APIError = APIError
    chat = { completions: { create: chatCreate } }
    constructor(options: unknown) {
      openaiOptions.push(options)
    }
  }
  return { default: OpenAI }
})

const claude: Opponent = { model: "claude", apiModel: "claude-sonnet-5-5" }
const request = { system: "sys", turns: [{ role: "user" as const, content: "hi" }], maxTokens: 300 }
const usage = { input_tokens: 1, output_tokens: 1 }
const text = (value: string, stop_reason = "end_turn") => ({ stop_reason, usage, content: [{ type: "text", text: value }] })
const chat = (content: string, finish_reason = "stop") => ({ choices: [{ finish_reason, message: { content } }] })

describe("Claude provider", () => {
  beforeEach(() => {
    create.mockReset()
    process.env.ANTHROPIC_API_KEY = "test-key"
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.spyOn(console, "info").mockImplementation(() => {})
  })

  it("sends a structured-output decision request with thinking off", async () => {
    create.mockResolvedValueOnce(text('{"reasoning":"r","decision":"KEEP"}'))
    await expect(generateDecision(claude, request)).resolves.toEqual({ reasoning: "r", decision: "KEEP" })

    const params = create.mock.calls[0][0]
    expect(params.model).toBe("claude-sonnet-5-5")
    expect(params.thinking).toEqual({ type: "between_tools" })
    expect(params.output_config.format.type).toBe("json_schema")
    expect(params.max_tokens).toBe(300)
  })

  it("uses the round's pinned model version", async () => {
    create.mockResolvedValueOnce(text('{"reasoning":"r","decision":"KEEP"}'))
    await generateDecision({ model: "claude", apiModel: "claude-haiku-4-5" }, request)
    const params = create.mock.calls[0][0]
    expect(params.model).toBe("claude-haiku-4-5")
    // Haiku takes neither the thinking setting nor effort.
    expect(params.thinking).toBeUndefined()
    expect(params.output_config.effort).toBeUndefined()
  })

  it("retries a malformed decision once, then succeeds", async () => {
    create.mockResolvedValueOnce(text("SHARE")).mockResolvedValueOnce(text('{"reasoning":"r","decision":"SHARE"}'))
    await expect(generateDecision(claude, request)).resolves.toMatchObject({ decision: "SHARE" })
    expect(create).toHaveBeenCalledTimes(2)
  })

  it("throws after two bad decisions instead of picking a random move", async () => {
    create.mockResolvedValue(text("I won't SHARE"))
    await expect(generateDecision(claude, request)).rejects.toBeInstanceOf(GameError)
    expect(create).toHaveBeenCalledTimes(2)
  })

  it("doesn't retry a rejected API key, and doesn't name the model to the player", async () => {
    create.mockRejectedValue(new (Anthropic as unknown as { APIError: new (s: number) => Error }).APIError(401))
    const error = (await generateDecision(claude, request).catch((e) => e)) as Error
    expect(error.message).toBe("Your opponent couldn't be reached. Try again later.")
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("ANTHROPIC_API_KEY was rejected"))
    expect(create).toHaveBeenCalledTimes(1)
  })

  it("fails without calling the API when the key isn't set", async () => {
    delete process.env.ANTHROPIC_API_KEY
    await expect(generateDecision(claude, request)).rejects.toThrow("Your opponent")
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("ANTHROPIC_API_KEY is not set"))
    expect(create).not.toHaveBeenCalled()
  })

  it("treats a refusal as an error, without naming the model", async () => {
    create.mockResolvedValueOnce({ stop_reason: "refusal", usage, content: [] })
    const error = (await generateDecision(claude, request).catch((e) => e)) as Error
    expect(error.message).toContain("Your opponent declined")
    expect(error.message).not.toMatch(/claude/i)
  })
})

describe("OpenAI-compatible providers", () => {
  beforeEach(() => {
    chatCreate.mockReset()
    process.env.GEMINI_API_KEY = "gemini-key"
    process.env.DEEPSEEK_API_KEY = "deepseek-key"
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.spyOn(console, "info").mockImplementation(() => {})
  })

  it("sends a strict JSON schema to providers that support it, at their own base URL", async () => {
    chatCreate.mockResolvedValueOnce(chat('{"reasoning":"r","decision":"SHARE"}'))
    await expect(generateDecision({ model: "gemini", apiModel: "gemini-3.8-flash" }, request)).resolves.toMatchObject({
      decision: "SHARE",
    })

    expect(openaiOptions).toContainEqual({
      apiKey: "gemini-key",
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    })
    const params = chatCreate.mock.calls[0][0]
    expect(params.model).toBe("gemini-3.8-flash")
    expect(params.messages[0]).toEqual({ role: "system", content: "sys" })
    expect(params.reasoning_effort).toBe("none")
    expect(params.response_format).toMatchObject({ type: "json_schema", json_schema: { name: "decision", strict: true } })
  })

  it("asks for a plain JSON object, with the schema in the prompt, where strict schemas aren't supported", async () => {
    chatCreate.mockResolvedValueOnce(chat('{"reasoning":"r","decision":"KEEP"}'))
    await generateDecision({ model: "deepseek", apiModel: "deepseek-flash" }, request)

    const params = chatCreate.mock.calls[0][0]
    expect(params.response_format).toEqual({ type: "json_object" })
    expect(params.reasoning_effort).toBe("none")
    expect(params.messages[0].content).toContain("JSON schema")
    expect(params.messages[0].content).toContain('"decision"')
    // The last turn reminds the model never to send a blank reply.
    expect(params.messages.at(-1)).toMatchObject({ role: "user" })
    expect(params.messages.at(-1).content).toMatch(/^hi\n\nReply with only the JSON object/)
  })

  it("retries a blank reply", async () => {
    chatCreate.mockResolvedValueOnce(chat("      ")).mockResolvedValueOnce(chat('{"reasoning":"r","decision":"SHARE"}'))
    await expect(generateDecision({ model: "deepseek", apiModel: "deepseek-flash" }, request)).resolves.toMatchObject({
      decision: "SHARE",
    })
    expect(chatCreate).toHaveBeenCalledTimes(2)
  })

  it("retries a reply that was cut off", async () => {
    chatCreate
      .mockResolvedValueOnce(chat('{"reasoning":"r', "length"))
      .mockResolvedValueOnce(chat('{"reasoning":"r","decision":"KEEP"}'))
    await expect(generateDecision({ model: "deepseek", apiModel: "deepseek-flash" }, request)).resolves.toMatchObject({
      decision: "KEEP",
    })
    expect(chatCreate).toHaveBeenCalledTimes(2)
  })
})
