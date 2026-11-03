import "server-only"

import Anthropic from "@anthropic-ai/sdk"
import OpenAI from "openai"
import type { ReasoningEffort } from "openai/resources/shared"
import { MODELS, type ModelConfig } from "@/lib/models"
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

/** The model playing a round, pinned to the exact version it started with. */
export type Opponent = { model: AIModel; apiModel: string }

type CompletionRequest = {
  system: string
  turns: ChatTurn[]
  maxTokens: number
  /** Constrain the reply to a JSON schema. */
  format?: StructuredFormat
}

export type StructuredFormat = { name: string; schema: Record<string, unknown> }

/**
 * A provider-side failure. The player only ever sees a generic message, so
 * nothing names the model; the details go to the server log.
 */
class ProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message)
  }
}

let anthropicClient: Anthropic | null = null
let openaiClient: OpenAI | null = null
const compatibleClients = new Map<AIModel, OpenAI>()

function requireKey(config: ModelConfig): string {
  const key = process.env[config.apiKeyEnv]?.trim()
  if (!key) throw new ProviderError(`${config.apiKeyEnv} is not set on the server`, false)
  return key
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

async function completeWithClaude(config: ModelConfig, apiModel: string, req: CompletionRequest): Promise<string> {
  requireKey(config)
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
  logUsage(apiModel, response.usage.input_tokens, response.usage.output_tokens)

  if (response.stop_reason === "refusal") throw new ProviderError("refused", false)
  if (req.format && response.stop_reason === "max_tokens") throw new ProviderError("cut off at max_tokens", true)

  return response.content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("")
    .trim()
}

async function completeWithOpenAI(config: ModelConfig, apiModel: string, req: CompletionRequest): Promise<string> {
  requireKey(config)
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
  logUsage(apiModel, response.usage?.input_tokens, response.usage?.output_tokens)

  if (response.status === "incomplete") {
    throw new ProviderError(`incomplete (${response.incomplete_details?.reason ?? "unknown reason"})`, true)
  }

  return response.output_text.trim()
}

/** Gemini, Grok, DeepSeek, and anything else with an OpenAI-style Chat Completions API. */
async function completeWithCompatible(config: ModelConfig, apiModel: string, req: CompletionRequest): Promise<string> {
  const apiKey = requireKey(config)
  let client = compatibleClients.get(config.id)
  if (!client) {
    client = new OpenAI({ apiKey, baseURL: config.baseURL })
    compatibleClients.set(config.id, client)
  }

  // Without strict schemas, describe the schema in the prompt; parsing and the retry catch the rest.
  const looseJson = req.format && config.jsonMode === "json-object"
  const system = looseJson
    ? `${req.system}\n\nRespond with only a JSON object that matches this JSON schema:\n${JSON.stringify(req.format!.schema)}`
    : req.system

  // In JSON-object mode, a model that means to stay silent can send a blank reply instead of
  // {"message": ""}, so the last turn ends with a reminder.
  const turns = looseJson ? withJsonReminder(req.turns) : req.turns

  const response = await client.chat.completions.create({
    model: apiModel,
    messages: [{ role: "system", content: system }, ...turns],
    max_tokens: req.maxTokens,
    ...(config.reasoningEffort ? { reasoning_effort: config.reasoningEffort } : {}),
    ...(req.format
      ? {
          response_format: looseJson
            ? { type: "json_object" as const }
            : {
                type: "json_schema" as const,
                json_schema: { name: req.format.name, schema: req.format.schema, strict: true },
              },
        }
      : {}),
  })
  logUsage(apiModel, response.usage?.prompt_tokens, response.usage?.completion_tokens)

  const choice = response.choices[0]
  if (choice?.finish_reason === "length") throw new ProviderError("cut off at max_tokens", true)
  if (choice?.finish_reason === "content_filter") throw new ProviderError("refused", false)
  const text = (choice?.message.content ?? "").trim()
  if (!text) throw new ProviderError(`empty reply: ${JSON.stringify(choice).slice(0, 600)}`, true)
  return text
}

const JSON_REMINDER =
  'Reply with only the JSON object. Never send an empty reply: to stay silent, set "message" to "" in the JSON.'

function withJsonReminder(turns: ChatTurn[]): ChatTurn[] {
  const last = turns.at(-1)
  if (!last || last.role !== "user") return [...turns, { role: "user", content: JSON_REMINDER }]
  return [...turns.slice(0, -1), { ...last, content: `${last.content}\n\n${JSON_REMINDER}` }]
}

/** Token usage per call, so cost per round can be tracked from the start. */
function logUsage(apiModel: string, input?: number, output?: number) {
  console.info(`[usage] ${apiModel} in=${input ?? "?"} out=${output ?? "?"}`)
}

function toGameError(error: unknown, { model, apiModel }: Opponent): GameError {
  if (error instanceof GameError) return error
  const config = MODELS[model]
  const status =
    error instanceof Anthropic.APIError || error instanceof OpenAI.APIError ? (error.status ?? undefined) : undefined

  // Log what actually went wrong; the player's message never names the model.
  if (status === 401 || status === 403) {
    console.error(`[${model}] ${config.apiKeyEnv} was rejected`)
    return new GameError("Your opponent couldn't be reached. Try again later.", 502)
  }
  if (status === 404) {
    console.error(`[${model}] model "${apiModel}" was not found. Check ${config.envVar}.`)
    return new GameError("Your opponent couldn't be reached. Try again later.", 502)
  }
  if (status === 429) {
    console.error(`[${model}] rate limited`)
    return new GameError("Your opponent is busy. Wait a moment and try again.", 503, true)
  }
  if (error instanceof ProviderError) {
    console.error(`[${model}] ${apiModel}: ${error.message}`)
    return error.message === "refused"
      ? new GameError("Your opponent declined to respond. Try rephrasing your message.", 502)
      : new GameError("Your opponent didn't respond. Try again.", 502, error.retryable)
  }
  console.error(`[${model}] request failed`, error)
  return new GameError("Your opponent didn't respond. Try again.", 502, true)
}

async function complete(opponent: Opponent, req: CompletionRequest): Promise<string> {
  const config = MODELS[opponent.model]
  try {
    switch (config.provider) {
      case "anthropic":
        return await completeWithClaude(config, opponent.apiModel, req)
      case "openai":
        return await completeWithOpenAI(config, opponent.apiModel, req)
      case "openai-compatible":
        return await completeWithCompatible(config, opponent.apiModel, req)
    }
  } catch (error) {
    throw toGameError(error, opponent)
  }
}

/** Get structured output, retrying once on a retryable or malformed response. */
export async function generateStructured<T>(
  opponent: Opponent,
  req: Omit<CompletionRequest, "format">,
  format: StructuredFormat,
  parse: (text: string) => T,
): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return parse(await complete(opponent, { ...req, format }))
    } catch (error) {
      if (error instanceof GameError && !error.retryable) throw error
      lastError = error
    }
  }
  if (lastError instanceof GameError) throw lastError
  console.error(`[${opponent.model}] invalid ${format.name} output`, lastError)
  throw new GameError("Your opponent didn't return a valid response. Try again.", 502)
}
