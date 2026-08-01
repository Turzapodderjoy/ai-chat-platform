export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-black text-white px-6 py-16">
      <div className="max-w-2xl mx-auto">
        <a href="/" className="text-sm text-gray-400 underline">
          ← Back
        </a>

        <h1 className="text-4xl font-bold mt-6">Privacy Policy</h1>
        <p className="mt-2 text-gray-400 text-sm">Last updated: August 2, 2026</p>

        <div className="mt-10 space-y-8 text-gray-300 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-white">What this covers</h2>
            <p className="mt-2">
              This platform provides AI-powered customer support chat for businesses, reachable through a
              website chat widget, Facebook Messenger, Instagram, and WhatsApp. This policy explains what
              information is collected when someone messages a business using this platform, and how it's
              used.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">Information we collect</h2>
            <ul className="mt-2 list-disc list-inside space-y-1">
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

          <section>
            <h2 className="text-xl font-semibold text-white">How this information is used</h2>
            <ul className="mt-2 list-disc list-inside space-y-1">
              <li>To generate and deliver AI-assisted responses to a customer's questions.</li>
              <li>To hand off a conversation to a human support agent when needed.</li>
              <li>
                To review and improve response quality — messages may be used internally to identify and
                correct mistakes in how the assistant answers.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">Sharing with third parties</h2>
            <p className="mt-2">
              Message content is processed by third-party AI model providers (such as Groq, Google, Mistral,
              OpenRouter, or Cerebras) solely to generate a response, and by the relevant messaging platform
              (Meta for Messenger/Instagram/WhatsApp) to deliver that response back to the customer. We do
              not sell message content or contact information to third parties.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">Data retention</h2>
            <p className="mt-2">
              Conversation history is retained to maintain context across a conversation and to allow a
              business to review past support interactions. A business using this platform can request
              deletion of a customer's conversation history at any time.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">Your choices</h2>
            <p className="mt-2">
              You can stop a conversation at any time by simply not replying. To request that your message
              history be deleted, contact the business you were messaging directly, or reach out using the
              contact details below.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">Contact</h2>
            <p className="mt-2">
              Questions about this policy or a request to delete your data can be sent to{" "}
              <a href="mailto:optisuite10@gmail.com" className="underline">
                optisuite10@gmail.com
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
