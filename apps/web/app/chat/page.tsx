import { ChatWidget } from "../../components/ChatWidget";

export default function ChatPage() {
  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: 40 }}>
      <h1>AI Chat Platform — Demo</h1>
      <ChatWidget />
    </main>
  );
}
