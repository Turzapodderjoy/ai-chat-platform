export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-black text-white">
      <div className="text-center">
        <h1 className="text-5xl font-bold">
          AI Chat Platform
        </h1>

        <p className="mt-6 text-xl text-gray-400">
          Building the Future of AI Automation
        </p>

        <p className="mt-8">
          <a href="/dashboard" className="underline">Admin dashboard</a>
          {" · "}
          <a href="/upload" className="underline">Upload knowledge</a>
          {" · "}
          <a href="/chat" className="underline">Open chat demo</a>
        </p>
      </div>
    </main>
  );
}