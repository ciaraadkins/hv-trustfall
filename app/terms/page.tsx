import type { Metadata } from "next"
import Link from "next/link"
import LegalPage from "@/components/legal-page"
import { CONTACT_EMAIL } from "@/lib/site"

export const metadata: Metadata = { title: "Terms · Trustfall" }

export default function TermsPage() {
  return (
    <LegalPage title="Terms" updated="November 2, 2026">
      <p>By playing Trustfall, you agree to these terms. If you don&apos;t, please don&apos;t play.</p>

      <h2>It&apos;s a game</h2>
      <ul>
        <li>
          Points have no value outside the game, and nothing real is won or lost. The stakes in the game&apos;s story are
          fiction.
        </li>
        <li>
          Your opponent is an AI, and bluffing is part of the game. It may say things that aren&apos;t true. Don&apos;t rely
          on anything it says, about the game or anything else.
        </li>
        <li>The AI&apos;s messages are generated automatically. They don&apos;t reflect our views.</li>
      </ul>

      <h2>Playing fair</h2>
      <p>Please don&apos;t:</p>
      <ul>
        <li>Post anything illegal, hateful, threatening, or sexual, or anyone&apos;s personal information.</li>
        <li>Try to break, overload, or get around the game, or use it to get the AI to produce harmful content.</li>
        <li>Play with bots or scripts.</li>
      </ul>
      <p>We may remove rounds or block access to anyone who does.</p>

      <h2>What you write</h2>
      <p>
        You keep ownership of your messages. You let us store and analyze them, send them to the AI that plays you, and
        publish short excerpts and statistics from them in research, as described in the <Link href="/privacy">privacy policy</Link>. Anything published won&apos;t identify you.
      </p>

      <h2>No guarantees</h2>
      <p>
        Trustfall is a small project, provided as is. It may change, break, lose data, or shut down at any time. To the
        extent the law allows, we aren&apos;t liable for any loss from using it.
      </p>

      <h2>Changes</h2>
      <p>We may update these terms. The date at the top shows the latest version, and playing after a change means you accept it.</p>

      <h2>Questions</h2>
      <p>
        Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </LegalPage>
  )
}
