"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

import styles from "./page.module.css";

type Phase = "entering" | "idle" | "throwing" | "reaching" | "pulling" | "revealed";

type Finger = { bx: number; by: number; len: number; w: number; tw: number; rot: number };

/** Tapered, curved finger/thumb silhouette pointing toward -y from its
 * base, fanned out via a rotate transform on its wrapper <g>. Curved
 * bezier taper (not a straight-sided capsule) is what keeps this from
 * reading as a rounded-rectangle cartoon finger. */
function fingerPath(len: number, w: number, tw: number): string {
  const h = w / 2;
  const t = tw / 2;
  return `M ${-h} 0 C ${-h} ${-len * 0.5} ${-t} ${-len * 0.92} ${-t + tw * 0.15} ${-len}
    C ${-tw * 0.15} ${-len - tw * 0.28} ${tw * 0.15} ${-len - tw * 0.28} ${t - tw * 0.15} ${-len}
    C ${t} ${-len * 0.92} ${h} ${-len * 0.5} ${h} 0 Z`;
}

const FINGERS: Finger[] = [
  { bx: 150, by: 179, len: 150, w: 34, tw: 20, rot: -9 },
  { bx: 190, by: 175, len: 175, w: 36, tw: 20, rot: 0 },
  { bx: 228, by: 179, len: 158, w: 33, tw: 19, rot: 9 },
  { bx: 260, by: 190, len: 112, w: 26, tw: 16, rot: 20 },
];
const THUMB: Finger = { bx: 104, by: 248, len: 92, w: 46, tw: 30, rot: -58 };

/** Real hand silhouette — tapered curved fingers of varied length fanned
 * around a rounded-trapezoid palm, warm rim-light gradient (bright at the
 * fingertips fading to shadow at the forearm), knuckle shading, and a
 * feDisplacementMap "texture" filter so the bezier edges read as organic
 * skin rather than perfect vector shapes. Modeled forearm-down /
 * fingers-up, then rotated 180deg by the caller so it reaches down from
 * a top-right entry, matching the reference photo's silhouette language. */
function HumanHand({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 340 430" width="100%" height="100%" className={className}>
      <defs>
        <linearGradient id="skinLight" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f2c9a0" />
          <stop offset="35%" stopColor="#caa07a" />
          <stop offset="75%" stopColor="#7c5a42" />
          <stop offset="100%" stopColor="#2c1a10" />
        </linearGradient>
        <radialGradient id="knuckleShade" cx="50%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#3a2416" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#3a2416" stopOpacity="0" />
        </radialGradient>
        <filter id="handTexture" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.018" numOctaves="2" seed="7" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="7" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <filter id="handGlow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="14" />
        </filter>
      </defs>

      {/* soft ambient rim glow behind the hand */}
      <g filter="url(#handGlow)" opacity="0.35">
        <path
          d="M 90 300 C 85 268 90 232 104 208 C 116 188 138 176 160 174 L 246 176 C 264 180 274 196 277 216 C 282 244 276 278 262 304 C 250 324 224 332 194 332 C 158 332 104 326 90 300 Z"
          fill="#e8b98a"
        />
      </g>

      <g filter="url(#handTexture)">
        {/* forearm — top edge deliberately overlaps well into the palm
         * (drawn beneath it) so there's no butt-joint seam at the wrist */}
        <path
          d="M 150 260 C 130 285 116 350 116 412 L 116 424 L 234 424 L 234 408 C 233 350 220 285 200 258 C 185 250 165 251 150 260 Z"
          fill="url(#skinLight)"
        />
        {/* palm */}
        <path
          d="M 90 300 C 85 268 90 232 104 208 C 116 188 138 176 160 174 L 246 176 C 264 180 274 196 277 216 C 282 244 276 278 262 304 C 250 324 224 332 194 332 C 158 332 104 326 90 300 Z"
          fill="url(#skinLight)"
        />
        {/* thumb */}
        <g transform={`translate(${THUMB.bx} ${THUMB.by}) rotate(${THUMB.rot})`}>
          <path d={fingerPath(THUMB.len, THUMB.w, THUMB.tw)} fill="url(#skinLight)" />
        </g>
        {/* fingers */}
        {FINGERS.map((f, i) => (
          <g key={i} transform={`translate(${f.bx} ${f.by}) rotate(${f.rot})`}>
            <path d={fingerPath(f.len, f.w, f.tw)} fill="url(#skinLight)" />
          </g>
        ))}
        {/* knuckle creases */}
        {FINGERS.map((f, i) => (
          <ellipse key={i} cx={f.bx} cy={f.by + 6} rx={f.w * 0.6} ry="9" fill="url(#knuckleShade)" />
        ))}
        <ellipse cx="170" cy="300" rx="70" ry="20" fill="url(#knuckleShade)" opacity="0.5" />
      </g>
    </svg>
  );
}

/** Robot hand — chamfered gunmetal plates (not rounded-rect capsules),
 * two tapered phalanx segments per finger with a glowing joint gap, brushed
 * metal gradient, cyan-violet seam glow. Kept geometric/segmented rather
 * than organic, since a mechanical hand reading as "plated" is correct,
 * not cartoonish. */
function plate(w1: number, w2: number, len: number): string {
  const chamfer = Math.min(w1, w2) * 0.18;
  return `M ${-w1 / 2} 0 L ${w1 / 2} 0 L ${w2 / 2} ${-len + chamfer} L ${w2 / 2 - chamfer} ${-len} L ${-w2 / 2 + chamfer} ${-len} L ${-w2 / 2} ${-len + chamfer} Z`;
}

const ROBOT_FINGERS: Finger[] = [
  { bx: 148, by: 176, len: 68, w: 30, tw: 22, rot: -10 },
  { bx: 188, by: 172, len: 80, w: 32, tw: 23, rot: 0 },
  { bx: 226, by: 176, len: 72, w: 29, tw: 21, rot: 10 },
  { bx: 258, by: 188, len: 52, w: 24, tw: 17, rot: 22 },
];

function RobotHand({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 340 430" width="100%" height="100%" className={className}>
      <defs>
        <linearGradient id="gunmetal" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#e4eaf2" />
          <stop offset="30%" stopColor="#9aa6b8" />
          <stop offset="70%" stopColor="#4b5566" />
          <stop offset="100%" stopColor="#1c212b" />
        </linearGradient>
        <linearGradient id="seamGlow" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#7c6cff" />
          <stop offset="100%" stopColor="#33d6c6" />
        </linearGradient>
        <filter id="robotTexture" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.02 0.03" numOctaves="2" seed="3" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="3" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <filter id="seamBlur" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>

      <g filter="url(#robotTexture)">
        {/* forearm */}
        <path
          d="M 142 330 L 138 424 L 232 424 L 228 330 C 210 322 160 322 142 330 Z"
          fill="url(#gunmetal)"
          stroke="#0b0d12"
          strokeWidth="1.5"
        />
        {/* palm plate */}
        <path
          d="M 96 300 L 92 214 C 94 194 112 178 158 176 L 248 176 C 270 180 280 198 278 218 L 274 300 C 262 322 220 334 186 334 C 148 334 108 322 96 300 Z"
          fill="url(#gunmetal)"
          stroke="#0b0d12"
          strokeWidth="1.5"
        />
        {/* rivets */}
        {[[130, 250], [186, 260], [244, 250], [186, 210]].map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r="3.2" fill="#0b0d12" stroke="#5c6678" strokeWidth="1" />
        ))}

        {/* thumb: two plates + joint */}
        <g transform="translate(104 248) rotate(-58)">
          <path d={plate(46, 34, 40)} fill="url(#gunmetal)" stroke="#0b0d12" strokeWidth="1.2" />
          <circle cx="0" cy="-44" r="6" fill="#131720" stroke="url(#seamGlow)" strokeWidth="1.4" />
          <g transform="translate(0 -50)">
            <path d={plate(28, 20, 40)} fill="url(#gunmetal)" stroke="#0b0d12" strokeWidth="1.2" />
          </g>
        </g>

        {/* fingers: two plates + glowing knuckle joint each */}
        {ROBOT_FINGERS.map((f, i) => {
          const seg1 = f.len * 0.56;
          const seg2 = f.len * 0.44;
          const midW = f.w - (f.w - f.tw) * 0.55;
          return (
            <g key={i} transform={`translate(${f.bx} ${f.by}) rotate(${f.rot})`}>
              <path d={plate(f.w, midW, seg1)} fill="url(#gunmetal)" stroke="#0b0d12" strokeWidth="1.2" />
              <circle cx="0" cy={-seg1 - 4} r={midW * 0.42} fill="#131720" stroke="url(#seamGlow)" strokeWidth="1.3" />
              <g transform={`translate(0 ${-seg1 - 8})`}>
                <path d={plate(midW, f.tw, seg2)} fill="url(#gunmetal)" stroke="#0b0d12" strokeWidth="1.2" />
              </g>
            </g>
          );
        })}
      </g>

      {/* seam glow strokes, blurred and layered above for a lit-edge look */}
      <g filter="url(#seamBlur)" opacity="0.8">
        <path d="M 96 300 L 92 214 C 94 194 112 178 158 176" fill="none" stroke="url(#seamGlow)" strokeWidth="1.6" />
        <circle cx="186" cy="210" r="4" fill="url(#seamGlow)" />
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
        {/* Human hand + glass tile group — enters diagonally from the top-right */}
        <motion.div
          className={styles.handLayer}
          style={{ zIndex: 3 }}
          initial={{ x: 420, y: -420, rotate: 210, opacity: 0 }}
          animate={
            handEntering
              ? { x: 420, y: -420, rotate: 210, opacity: 0 }
              : isPulling
                ? { x: -60, y: 340, rotate: 145, opacity: phase === "revealed" ? 0 : 1 }
                : isReaching
                  ? { x: -40, y: 160, rotate: 165, opacity: 1 }
                  : { x: 65, y: -130, rotate: 198, opacity: 1 }
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
          <div style={{ width: 210, height: 266 }}>
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
                ? { x: "-160%", y: "-150%", opacity: 0, rotate: -50 }
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
          <div style={{ width: 190, height: 240 }}>
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
