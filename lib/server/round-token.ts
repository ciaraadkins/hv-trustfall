import "server-only"

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"
import { isAIModel } from "@/lib/models"
import type { MemorySnapshot } from "@/types/game"
import { GameError, type Opponent } from "./providers"

/**
 * The round token tells the server which model is playing a round, and what
 * it remembers about the player, without the browser being able to read it:
 * AES-256-GCM, keyed by ROUND_TOKEN_SECRET. The server keeps no state for a
 * round in progress, so the token is the only record of both.
 */

/** What the server needs to play a round. */
export type RoundSetup = { opponent: Opponent; memory: MemorySnapshot }

type RoundClaims = Opponent & { memory: MemorySnapshot; roundId: string; issuedAt: number }

/** Long enough for any round, short enough that an old token can't be reused for long. */
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000
const IV_BYTES = 12
const TAG_BYTES = 16

function key(): Buffer {
  const secret = process.env.ROUND_TOKEN_SECRET?.trim()
  if (!secret) {
    console.error("ROUND_TOKEN_SECRET is not set on the server")
    throw new GameError("The game server isn't set up yet. Try again later.", 500)
  }
  return createHash("sha256").update(secret).digest()
}

export function issueRoundToken({ opponent, memory }: RoundSetup, roundId: string, now = Date.now()): string {
  const claims: RoundClaims = { ...opponent, memory, roundId, issuedAt: now }
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv("aes-256-gcm", key(), iv)
  const body = Buffer.concat([cipher.update(JSON.stringify(claims), "utf8"), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url")
}

/** The setup for `roundId`. Throws a GameError for a token that's invalid, expired, or from another round. */
export function readRoundToken(token: string, roundId: string, now = Date.now()): RoundSetup {
  const invalid = new GameError("This round has expired. Start a new one.", 400)

  let claims: RoundClaims
  try {
    const raw = Buffer.from(token, "base64url")
    const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, IV_BYTES))
    decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES))
    const json = Buffer.concat([decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString("utf8")
    claims = JSON.parse(json)
  } catch (error) {
    if (error instanceof GameError) throw error
    throw invalid
  }

  if (!isAIModel(claims.model) || typeof claims.apiModel !== "string" || !claims.memory) throw invalid
  if (claims.roundId !== roundId || now - claims.issuedAt > TOKEN_TTL_MS) throw invalid
  return { opponent: { model: claims.model, apiModel: claims.apiModel }, memory: claims.memory }
}
