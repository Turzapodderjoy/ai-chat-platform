import { ChatWidget } from "../../components/ChatWidget";
import styles from "./page.module.css";

export const metadata = {
  title: "Chat console · AIVA",
  description: "Attach a photo and ask the assistant about it.",
};

export default function ChatPage() {
  return (
    <main className="public-shell">
      <div className={styles.wrap}>
        <header className={styles.head}>
          <div>
            <h1 className={styles.title}>Chat console</h1>
            <p className={styles.sub}>
              Send an image to the assistant and keep the whole thread in one place.
            </p>
          </div>
        </header>
        <ChatWidget />
      </div>
    </main>
  );
}