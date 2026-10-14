import styles from "./page.module.css";

export default function PrivacyPolicyPage() {
  return (
    <main className="public-shell">
      <div className={styles.page}>
        <div className={styles.wrap}>
          <a href="/" className={styles.backLink}>
            Back to sign in
          </a>

          <div className={styles.header}>
            <h1 className={styles.title}>Privacy policy</h1>
            <p className={styles.meta}>Last updated: August 2, 2026</p>
          </div>

          <div className={styles.divider} />

          <div className={styles.content}>
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>What this covers</h2>
              <p className={styles.body}>
                This platform provides AI-powered customer support chat for businesses, reachable through a
                website chat widget, Facebook Messenger, Instagram, and WhatsApp. This policy explains what
                information is collected when someone messages a business using this platform, and how it&apos;s
                used.
              </p>
            </section>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Information we collect</h2>
              <ul className={styles.list}>
                <li>The content of messages sent to and received from the AI assistant.</li>
                <li>
                  A platform-specific identifier for the sender (e.g. a Messenger, Instagram, or WhatsApp
                  account ID) needed to deliver replies back to the right person.
                </li>
                <li>Timestamps and basic conversation metadata (e.g. which channel a message came from).</li>
                <li>
                  Any file, image, voice note, or document a customer or agent chooses to send within a
                  conversation.
                </li>
              </ul>
            </section>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>How this information is used</h2>
              <ul className={styles.list}>
                <li>To generate and deliver AI-assisted responses to a customer&apos;s questions.</li>
                <li>To hand off a conversation to a human support agent when needed.</li>
                <li>
                  To review and improve response quality — messages may be used internally to identify and
                  correct mistakes in how the assistant answers.
                </li>
              </ul>
            </section>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Sharing with third parties</h2>
              <p className={styles.body}>
                Message content is processed by third-party AI model providers (such as Groq, Google, Mistral,
                OpenRouter, or Cerebras) solely to generate a response, and by the relevant messaging platform
                (Meta for Messenger/Instagram/WhatsApp) to deliver that response back to the customer. We do
                not sell message content or contact information to third parties.
              </p>
            </section>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Data retention</h2>
              <p className={styles.body}>
                Conversation history is retained to maintain context across a conversation and to allow a
                business to review past support interactions. A business using this platform can request
                deletion of a customer&apos;s conversation history at any time.
              </p>
            </section>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Your choices</h2>
              <p className={styles.body}>
                You can stop a conversation at any time by simply not replying. To request that your message
                history be deleted, contact the business you were messaging directly, or reach out using the
                contact details below.
              </p>
            </section>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Contact</h2>
              <p className={styles.body}>
                Questions about this policy or a request to delete your data can be sent to{" "}
                <a href="mailto:optisuite10@gmail.com">optisuite10@gmail.com</a>
                .
              </p>
            </section>
          </div>

          <div className={styles.foot}>
            <a href="/" className={styles.backLink}>
              Back to sign in
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
