import type { Metadata } from "next"
import LegalPage from "@/components/legal-page"
import { CONTACT_EMAIL } from "@/lib/site"

export const metadata: Metadata = { title: "Privacy · Trustfall" }

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy" updated="November 2, 2026">
      <p>
        Trustfall is a game where you chat with an AI and each of you secretly chooses to SHARE or KEEP. It&apos;s also a
        small research project about how people and AI build, and break, trust. This page explains what the game keeps,
        why, and who else sees it.
      </p>

      <h2>What we keep</h2>
      <ul>
        <li>Every message you and the AI send during a round, with timestamps.</li>
        <li>What each of you chose (SHARE or KEEP), the points, and how long the round took.</li>
        <li>Which AI model you played against.</li>
        <li>
          Short notes the AI writes after each round about how you played (for example, &quot;said they&apos;d share,
          then kept&quot;). The AI reads these before later rounds, so it can adapt to how you play.
        </li>
      </ul>
      <p>
        There are no accounts, no ads, no ad trackers, and no cookies. We don&apos;t ask for your name or email. If we add
        sign-in later, this page will say what changes before it does.
      </p>

      <h2>Please don&apos;t share personal information in the chat</h2>
      <p>
        Everything you type is saved and sent to an AI company (see below). Don&apos;t type your name, contact details, or
        anything about yourself or anyone else that you wouldn&apos;t want stored.
      </p>

      <h2>Who else sees it</h2>
      <p>
        Each round is played by an AI model from one of these companies, picked at random: Anthropic (Claude), OpenAI
        (ChatGPT), Google (Gemini), xAI (Grok), or DeepSeek. The chat for that round, the score, and the AI&apos;s notes
        on past rounds are sent to that company so its model can play. Their own privacy policies cover what they do
        with it. DeepSeek processes data in China.
      </p>
      <p>The game runs on Amazon Web Services in the United States. We don&apos;t sell your data or share it with anyone else.</p>

      <h2>How we use it</h2>
      <ul>
        <li>To run the game, keep the overall Humans vs. AI score, and give the AI its memory of how people play.</li>
        <li>
          For research into how people and AI cooperate and compete. We may publish findings, statistics, and short
          excerpts from chats. Anything published won&apos;t identify you.
        </li>
      </ul>

      <h2>How long we keep it, and deleting it</h2>
      <p>
        We keep rounds for as long as the research is running. To have your rounds deleted, email{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> with roughly when you played and something you wrote, so
        we can find them. Anything already sent to an AI company is also covered by their policy.
      </p>

      <h2>Children</h2>
      <p>Trustfall isn&apos;t meant for anyone under 13, and we don&apos;t knowingly keep their data.</p>

      <h2>Questions</h2>
      <p>
        Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. If this policy changes, the date at the top will too.
      </p>
    </LegalPage>
  )
}
