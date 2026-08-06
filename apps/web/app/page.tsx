"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

import styles from "./page.module.css";

type Phase = "entering" | "idle" | "throwing" | "reaching" | "pulling" | "revealed";

/** Stylized human hand — palm + five rounded-rect fingers, built from
 * primitives rather than traced path data (nothing here needs that
 * precision, and primitives stay easy to retune). */
function HumanHand({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 220" width="100%" height="100%" className={className}>
      <defs>
        <linearGradient id="skin" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#e8b895" />
          <stop offset="100%" stopColor="#c98f68" />
        </linearGradient>
      </defs>
      <g>
        <rect x="55" y="90" width="90" height="110" rx="38" fill="url(#skin)" />
        <rect x="40" y="20" width="26" height="90" rx="13" fill="url(#skin)" transform="rotate(-8 53 65)" />
        <rect x="72" y="6" width="26" height="104" rx="13" fill="url(#skin)" transform="rotate(-2 85 58)" />
        <rect x="104" y="8" width="26" height="102" rx="13" fill="url(#skin)" transform="rotate(4 117 59)" />
        <rect x="134" y="24" width="24" height="88" rx="12" fill="url(#skin)" transform="rotate(10 146 68)" />
        <rect x="18" y="108" width="60" height="24" rx="12" fill="url(#skin)" transform="rotate(-38 48 120)" />
      </g>
    </svg>
  );
}

/** Robot hand — angular metallic palm + segmented fingers with joint
 * knuckles, cyan-violet glow accent to read as "machine" against the
 * warm human hand. */
function RobotHand({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 220" width="100%" height="100%" className={className}>
      <defs>
        <linearGradient id="metal" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#cdd6e2" />
          <stop offset="100%" stopColor="#7c8aa0" />
        </linearGradient>
        <linearGradient id="glow" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7c6cff" />
          <stop offset="100%" stopColor="#33d6c6" />
        </linearGradient>
      </defs>
      <g>
        <rect x="52" y="88" width="96" height="112" rx="16" fill="url(#metal)" stroke="url(#glow)" strokeWidth="2" />
        {[
          { x: 42, y: 22 },
          { x: 74, y: 8 },
          { x: 106, y: 8 },
          { x: 136, y: 22 },
        ].map(({ x, y }, i) => (
          <g key={i}>
            <rect x={x} y={y} width="22" height="84" rx="6" fill="url(#metal)" stroke="url(#glow)" strokeWidth="1.5" />
            <circle cx={x + 11} cy={y + 84} r="6" fill="#0b0d12" stroke="url(#glow)" strokeWidth="1.5" />
            <circle cx={x + 11} cy={y + 42} r="3" fill="url(#glow)" opacity="0.7" />
          </g>
        ))}
        <rect x="14" y="112" width="58" height="22" rx="8" fill="url(#metal)" stroke="url(#glow)" strokeWidth="1.5" transform="rotate(-34 43 123)" />
        <circle cx="100" cy="150" r="5" fill="url(#glow)" />
      </g>
    </svg>
  );
}

export default function HomePage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("entering");
  const [reducedMotion, setReducedMotion] = useState(false);
  const navigated = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const t = setTimeout(() => setPhase((p) => (p === "entering" ? "idle" : p)), 900);
    return () => clearTimeout(t);
  }, []);

  function goToDashboard() {
    if (navigated.current) return;
    navigated.current = true;
    router.push("/dashboard");
  }

  function handleEnter() {
    if (phase !== "idle") return;
    if (reducedMotion) {
      goToDashboard();
      return;
    }
    setPhase("throwing");
    setTimeout(() => setPhase("reaching"), 450);
    setTimeout(() => setPhase("pulling"), 1150);
    setTimeout(() => setPhase("revealed"), 1750);
    setTimeout(goToDashboard, 2400);
  }

  const handEntering = phase === "entering";
  const isThrowing = phase === "throwing" || phase === "reaching" || phase === "pulling" || phase === "revealed";
  const isReaching = phase === "reaching" || phase === "pulling" || phase === "revealed";
  const isPulling = phase === "pulling" || phase === "revealed";

  return (
    <main className={styles.stage}>
      <div className={styles.heroText}>
        <p className={styles.eyebrow}>AI Chat Platform</p>
        <motion.h1
          className={styles.headline}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: phase === "revealed" ? 0 : 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          {phase === "revealed" ? "Access granted" : "Hand it the keys."}
        </motion.h1>
      </div>

      <div className={styles.scene}>
        {/* Human hand + glass tile group — enters diagonally from top-left */}
        <motion.div
          className={styles.handLayer}
          style={{ zIndex: 3 }}
          initial={{ x: -420, y: -420, rotate: -30, opacity: 0 }}
          animate={
            handEntering
              ? { x: -420, y: -420, rotate: -30, opacity: 0 }
              : isPulling
                ? { x: -60, y: 340, rotate: -55, opacity: phase === "revealed" ? 0 : 1 }
                : isReaching
                  ? { x: -40, y: 160, rotate: -35, opacity: 1 }
                  : { x: -110, y: -170, rotate: -14, opacity: 1 }
          }
          transition={
            handEntering
              ? { duration: 0 }
              : isPulling
                ? { duration: 0.65, ease: "easeIn" }
                : isReaching
                  ? { duration: 0.5, ease: "easeOut" }
                  : { type: "spring", stiffness: 90, damping: 14 }
          }
        >
          <div style={{ width: 190, height: 210 }}>
            <HumanHand />
          </div>
        </motion.div>

        {/* Glass login tile */}
        <motion.div
          className={styles.tileWrap}
          style={{ zIndex: 2 }}
          initial={{ x: "-50%", y: "10%", opacity: 0, rotate: -6 }}
          animate={
            handEntering
              ? { x: "-50%", y: "10%", opacity: 0, rotate: -6 }
              : isThrowing
                ? { x: "60%", y: "-140%", opacity: 0, rotate: 50 }
                : { x: "-50%", y: "-50%", opacity: 1, rotate: -3 }
          }
          transition={
            handEntering
              ? { duration: 0 }
              : isThrowing
                ? { duration: 0.55, ease: "easeIn" }
                : { type: "spring", stiffness: 120, damping: 16, delay: 0.35 }
          }
        >
          <div className={styles.tile} onClick={handleEnter} role="button" tabIndex={0}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleEnter()}
          >
            <p className={styles.tileTitle}>Welcome back</p>
            <p className={styles.tileSub}>Tap in — no password needed.</p>
            <button className={styles.tileButton} type="button">
              Continue
            </button>
            <p className={styles.tileStatus}>
              <span className={styles.statusDot} />
              System online
            </p>
          </div>
        </motion.div>

        {/* Robot hand — rises from bottom-left once the tile is thrown */}
        <motion.div
          className={styles.handLayer}
          style={{ zIndex: 1 }}
          initial={{ x: -260, y: 460, rotate: 20, opacity: 0 }}
          animate={
            isReaching
              ? isPulling
                ? { x: -60, y: 360, rotate: -20, opacity: phase === "revealed" ? 0 : 1 }
                : { x: -100, y: 210, rotate: 6, opacity: 1 }
              : { x: -260, y: 460, rotate: 20, opacity: 0 }
          }
          transition={
            isPulling
              ? { duration: 0.65, ease: "easeIn" }
              : { type: "spring", stiffness: 140, damping: 15 }
          }
        >
          <div style={{ width: 180, height: 200 }}>
            <RobotHand />
          </div>
        </motion.div>
      </div>

      <p className={styles.footNote}>
        {phase === "revealed" ? "Taking you in…" : "Purely a first-run flourish — no credentials required."}
      </p>
    </main>
  );
}
