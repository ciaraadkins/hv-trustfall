import type React from "react"

/** A reading page (privacy, terms): one narrow column of plain text. */
export default function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[#121212] text-[#ccc]">
      <article className="mx-auto max-w-[680px] px-4 py-10 font-mono text-sm leading-relaxed space-y-4 [&_h2]:text-[#33FF33] [&_h2]:font-bold [&_h2]:text-base [&_h2]:pt-4 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_a]:text-[#00FFFF] [&_a:hover]:underline">
        <h1 className="text-2xl font-bold text-[#33FF33]">{title}</h1>
        <p className="text-xs text-[#777]">Last updated {updated}</p>
        {children}
      </article>
    </main>
  )
}
