import Link from "next/link"
import { notFound } from "next/navigation"
import OpenHashTarget from "@/components/open-hash-target"
import { MODELS } from "@/lib/models"
import { LOCAL_PAGES } from "@/lib/site"
import { choiceColor, formatDateTime, shortId } from "@/lib/format"
import { CONSOLIDATE_EVERY, memorySnapshot, playersWithMemory, readNoteLog, readProfiles } from "@/lib/server/memory"
import type { ProfileRecord } from "@/types/game"

export const dynamic = "force-dynamic"

/**
 * The AI's memory of one player (?player=<id>, or the most recently active):
 * the consolidated profile (with every earlier version), then every note, newest first.
 */
export default async function MemoryPage({ searchParams }: { searchParams: Promise<{ player?: string }> }) {
  if (!LOCAL_PAGES) notFound()
  const players = await playersWithMemory()
  const playerId = (await searchParams).player ?? players[0]
  const [notes, profiles, snapshot] = playerId
    ? await Promise.all([readNoteLog(playerId), readProfiles(playerId), memorySnapshot(playerId)])
    : [[], [], { profileVersion: null, noteIds: [] }]
  const current = profiles.at(-1)
  // What the AI would read if this player started a round now.
  const inContext = new Set(snapshot.noteIds)

  return (
    <main className="min-h-screen bg-[#121212] text-[#33FF33] relative">
      <div className="absolute inset-0 bg-grid-pattern opacity-10 pointer-events-none"></div>
      <div className="absolute inset-0 bg-scanline pointer-events-none"></div>
      <OpenHashTarget />

      <div className="container mx-auto max-w-4xl px-4 py-12 z-10 relative font-mono">
        <h1 className="text-3xl font-bold mb-2">MEMORY</h1>
        <p className="text-sm text-[#ccc] mb-8">
          After each round, the AI that played writes a note on how the player played. Every {CONSOLIDATE_EVERY} notes,
          they&apos;re folded into the profile. Before each round, the AI reads that player&apos;s current profile plus the
          notes since. From the <code>notes</code> and <code>profiles</code> tables in your local Postgres.
        </p>

        {players.length > 1 && (
          <p className="text-xs text-[#ccc] mb-8">
            PLAYERS:{" "}
            {players.map((id) => (
              <Link
                key={id}
                href={`/memory?player=${id}`}
                className={`mr-3 hover:underline ${id === playerId ? "text-[#33FF33] font-bold" : "text-[#00FFFF]"}`}
              >
                {shortId(id)}
              </Link>
            ))}
          </p>
        )}

        <h2 className="text-xl font-bold mb-3">PROFILE</h2>
        {current ? (
          <>
            <ProfileCard profile={current} current />
            {profiles.length > 1 && (
              <details className="mb-10 mt-3">
                <summary className="cursor-pointer text-sm text-[#00FFFF] hover:underline">
                  EARLIER VERSIONS ({profiles.length - 1})
                </summary>
                <div className="space-y-3 mt-3">
                  {profiles
                    .slice(0, -1)
                    .reverse()
                    .map((profile) => (
                      <ProfileCard key={profile.version} profile={profile} />
                    ))}
                </div>
              </details>
            )}
            {profiles.length === 1 && <div className="mb-10" />}
          </>
        ) : (
          <div className="bg-[#1e1e1e] border border-[#33FF33]/30 rounded-lg p-5 mb-10 text-sm text-[#ccc]">
            No profile yet. The first one is written after {CONSOLIDATE_EVERY} notes ({notes.filter((n) => n.status === "ok").length}{" "}
            so far).
          </div>
        )}

        <h2 className="text-xl font-bold mb-3">NOTES</h2>
        {notes.length === 0 ? (
          <div className="bg-[#1e1e1e] border border-[#33FF33]/30 rounded-lg p-6 text-center text-[#ccc]">
            No notes yet. The AI writes one after each round.
          </div>
        ) : (
          <div className="space-y-4">
            {[...notes].reverse().map((note) => (
              <article
                key={note.noteId}
                id={`note-${note.noteId}`}
                className="bg-[#1e1e1e] border border-[#33FF33]/30 rounded-lg p-5 scroll-mt-20"
              >
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs mb-3">
                  <span className="text-[#33FF33] font-bold">#{note.noteId}</span>
                  <span className="text-[#00FFFF]">{formatDateTime(note.addedAt)}</span>
                  <span className="text-[#ccc]">
                    YOU <span className={choiceColor(note.humanDecision)}>{note.humanDecision}</span> · AI{" "}
                    <span className={choiceColor(note.aiDecision)}>{note.aiDecision}</span>
                  </span>
                  <span className="text-[#ccc]">BY {MODELS[note.provider].displayName}</span>
                  <Link href={`/data#round-${note.roundId}`} className="text-[#00FFFF] hover:underline">
                    ROUND {shortId(note.roundId)} →
                  </Link>
                  {inContext.has(note.noteId) && (
                    <span className="ml-auto border border-[#FFAA55]/60 text-[#FFAA55] rounded px-2 py-0.5">
                      IN THE AI&apos;S CONTEXT
                    </span>
                  )}
                </div>
                {note.status === "ok" ? (
                  <p className="text-sm text-[#ccc] whitespace-pre-wrap leading-relaxed">{note.note}</p>
                ) : (
                  <p className="text-sm text-[#FF5555]">Couldn&apos;t be written: {note.error}</p>
                )}
              </article>
            ))}
          </div>
        )}

        <p className="text-xs text-[#666] mt-4">Times are in your local time zone.</p>
      </div>
    </main>
  )
}

function ProfileCard({ profile, current = false }: { profile: ProfileRecord; current?: boolean }) {
  return (
    <article
      id={`profile-${profile.version}`}
      className={`bg-[#1e1e1e] border rounded-lg p-5 scroll-mt-20 ${current ? "border-[#FFAA55]/60" : "border-[#33FF33]/30"}`}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs mb-3">
        <span className="text-[#33FF33] font-bold">v{profile.version}</span>
        <span className="text-[#00FFFF]">{formatDateTime(profile.createdAt)}</span>
        <span className="text-[#ccc]">BY {MODELS[profile.provider].displayName}</span>
        <span className="text-[#ccc]">
          COVERS NOTES #1–#{profile.coversNotesThrough} (ADDED{" "}
          {profile.newNoteIds.map((id, i) => (
            <span key={id}>
              {i > 0 && ", "}
              <Link href={`#note-${id}`} className="text-[#00FFFF] hover:underline">
                #{id}
              </Link>
            </span>
          ))}
          )
        </span>
        {current && (
          <span className="ml-auto border border-[#FFAA55]/60 text-[#FFAA55] rounded px-2 py-0.5">IN THE AI&apos;S CONTEXT</span>
        )}
      </div>
      <p className="text-sm text-[#ccc] whitespace-pre-wrap leading-relaxed">{profile.profile}</p>
    </article>
  )
}
