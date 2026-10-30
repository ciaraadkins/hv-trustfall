import "server-only"

import Anthropic from "@anthropic-ai/sdk"
import OpenAI from "openai"
import type { ReasoningEffort } from "openai/resources/shared"
import { MODELS, resolveApiModel, type Provider } from "@/lib/models"
import type { ChatTurn } from "@/lib/game/messages"
import type { AIModel } from "@/types/game"

/** An error whose message is safe to show the player. */
export class GameError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable = false,
  ) {
    super(message)
  }
}

type CompletionRequest = {
  system: string
  turns: ChatTurn[]
  maxTokens: number
  /** Constrain the reply to a JSON schema. */
  format?: StructuredFormat
}

export type StructuredFormat = { name: string; schema: Record<string, unknown> }

const API_KEY_ENV: Record<Provider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
}

let anthropicClient: Anthropic | null = null
let openaiClient: OpenAI | null = null

function requireKey(provider: Provider): void {
  const envVar = API_KEY_ENV[provider]
  if (!process.env[envVar]) {
    throw new GameError(`${envVar} is not set on the server. Add it to .env.local and restart.`, 500)
  }
}

/**
 * Claude request options per model family. Thinking is kept off where the model
 * allows it, so short chat turns stay fast and max_tokens is all output.
 */
function claudeOptions(apiModel: string): { thinking?: Anthropic.ThinkingConfigParam; effort?: "low"; thinkingOn: boolean } {
  if (apiModel.startsWith("claude-haiku")) return { thinkingOn: false }
  if (apiModel.startsWith("claude-sonnet-5-5")) return { thinking: { type: "between_tools" }, effort: "low", thinkingOn: false }
  // Opus 5.5 and newer can't disable thinking; run it at low effort.
  return { effort: "low", thinkingOn: true }
}

async function completeWithClaude(apiModel: string, req: CompletionRequest): Promise<string> {
  requireKey("anthropic")
  anthropicClient ??= new Anthropic()

  const options = claudeOptions(apiModel)
  const outputConfig: Anthropic.OutputConfig = {}
  if (options.effort) outputConfig.effort = options.effort
  if (req.format) outputConfig.format = { type: "json_schema", schema: req.format.schema }

  const response = await anthropicClient.messages.create({
    model: apiModel,
    // Thinking tokens count toward max_tokens, so leave room when it can't be turned off.
    max_tokens: options.thinkingOn ? req.maxTokens + 4000 : req.maxTokens,
    system: req.system,
    messages: req.turns,
    ...(options.thinking ? { thinking: options.thinking } : {}),
    ...(Object.keys(outputConfig).length ? { output_config: outputConfig } : {}),
  })

  if (response.stop_reason === "refusal") {
    throw new GameError("Claude declined to respond. Try rephrasing your message.", 502)
  }
  if (req.format && response.stop_reason === "max_tokens") {
    throw new GameError("Claude's response was cut off.", 502, true)
  }

  return response.content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("")
    .trim()
}

async function completeWithOpenAI(apiModel: string, req: CompletionRequest): Promise<string> {
  requireKey("openai")
  openaiClient ??= new OpenAI()

  const effort = (process.env.OPENAI_REASONING_EFFORT?.trim() || "low") as ReasoningEffort

  const response = await openaiClient.responses.create({
    model: apiModel,
    instructions: req.system,
    input: req.turns,
    max_output_tokens: req.maxTokens,
    ...(process.env.OPENAI_REASONING_EFFORT === "off" ? {} : { reasoning: { effort } }),
    ...(req.format
      ? { text: { format: { type: "json_schema", name: req.format.name, schema: req.format.schema, strict: true } } }
      : {}),
  })

  if (response.status === "incomplete") {
    throw new GameError(
      `ChatGPT's response was incomplete (${response.incomplete_details?.reason ?? "unknown reason"}).`,
      502,
      true,
    )
  }

  return response.output_text.trim()
}

function toGameError(error: unknown, model: AIModel): GameError {
  if (error instanceof GameError) return error
  const { provider } = MODELS[model]
  const name = provider === "anthropic" ? "Claude" : "ChatGPT"
  const status =
    error instanceof Anthropic.APIError || error instanceof OpenAI.APIError ? (error.status ?? undefined) : undefined

  if (status === 401 || status === 403) {
    return new GameError(`The ${API_KEY_ENV[provider]} was rejected. Check the key and restart the server.`, 502)
  }
  if (status === 404) {
    return new GameError(`${name} model "${resolveApiModel(model)}" was not found. Check ${MODELS[model].envVar}.`, 502)
  }
  if (status === 429) {
    return new GameError(`${name} is rate limited. Wait a moment and try again.`, 503, true)
  }
  console.error(`[${provider}] request failed`, error)
  return new GameError(`Couldn't reach ${name}. Try again.`, 502, true)
}

async function complete(model: AIModel, req: CompletionRequest): Promise<string> {
  const { provider } = MODELS[model]
  const apiModel = resolveApiModel(model)
  try {
    return provider === "anthropic" ? await completeWithClaude(apiModel, req) : await completeWithOpenAI(apiModel, req)
  } catch (error) {
    throw toGameError(error, model)
  }
}

/** Get structured output, retrying once on a retryable or malformed response. */
export async function generateStructured<T>(
  model: AIModel,
  req: Omit<CompletionRequest, "format">,
  format: StructuredFormat,
  parse: (text: string) => T,
): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return parse(await complete(model, { ...req, format }))
    } catch (error) {
      if (error instanceof GameError && !error.retryable) throw error
      lastError = error
    }
  }
  if (lastError instanceof GameError) throw lastError
  console.error(`[${model}] invalid ${format.name} output`, lastError)
  throw new GameError(`${MODELS[model].displayName} didn't return a valid response. Try again.`, 502)
}
