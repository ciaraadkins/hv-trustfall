/**
 * The player's anonymous ID: a random UUID kept in this browser's localStorage,
 * the same way Haystack does it. Every round, note and profile is stored under
 * it. Once there are accounts, it gets tied to the signed-in user.
 */
const PLAYER_KEY = "trustfall:playerId"

export function playerId(): string {
  try {
    const saved = localStorage.getItem(PLAYER_KEY)
    if (saved) return saved
    const id = crypto.randomUUID()
    localStorage.setItem(PLAYER_KEY, id)
    return id
  } catch {
    // Storage blocked (private mode, settings): play anyway, as a new player each visit.
    return (memoryId ??= crypto.randomUUID())
  }
}

let memoryId: string | undefined
