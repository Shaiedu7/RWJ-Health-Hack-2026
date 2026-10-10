import { useLayoutEffect, useRef, type RefObject } from "react";
import type { Appearance, AvatarState } from "../types";

/**
 * Avatar contract: a rigged Three.js / React Three Fiber model can replace this component by accepting the
 * same props. `state` drives expression and body pose; `speaking` + `mouthLevelRef` drive only the mouth.
 */
export interface PatientAvatarProps {
  appearance: Appearance;
  state: AvatarState;
  speaking?: boolean;
  mouthLevelRef?: RefObject<number>;
  variant?: "stage" | "portrait";
  className?: string;
}

interface Pose {
  browL: number;
  browR: number;
  browY: number;
  lid: number;
  lift: number;
  tilt: number;
  headY: number;
  guard: number;
  lean: number;
  curve: number;
  open: number;
  wide: number;
}

const base: Pose = { browL: 0, browR: 0, browY: 0, lid: 0.1, lift: 0, tilt: 0, headY: 0, guard: 0, lean: 0, curve: 3, open: 0, wide: 1 };
const POSES: Record<AvatarState, Pose> = {
  idle: base,
  speaking: { ...base, curve: 1 },
  listening: { ...base, browY: -3, tilt: 3, headY: -2, lid: 0, curve: 2 },
  anxious: { ...base, browL: -14, browR: 14, browY: -4, lift: -9, tilt: -2, lid: 0, curve: -3 },
  wincing: { ...base, browL: -10, browR: 10, browY: 5, lid: 0.8, lift: -6, tilt: -3, headY: 5, guard: 0.7, lean: 6, curve: -6, open: 0.2, wide: 1.25 },
  guarding: { ...base, browL: -6, browR: 6, lid: 0.22, headY: 4, tilt: -2, guard: 1, lean: 9, curve: -2 },
  relaxed: { ...base, lid: 0.2, lift: 4, curve: 8, browY: 1 },
};

const MOUTH_Y = 247;
export function mouthPath(curve: number, open: number, wide: number) {
  const w = 17 * wide;
  const x1 = 300 - w;
  const x2 = 300 + w;
  const c = MOUTH_Y + curve * 2;
  return `M${x1},${MOUTH_Y} Q300,${c} ${x2},${MOUTH_Y} Q300,${c + open * 34 + 1.5} ${x1},${MOUTH_Y} Z`;
}

const tr = "transform 650ms cubic-bezier(.4,.1,.2,1)";

export default function PatientAvatar({ appearance: a, state, speaking, mouthLevelRef, variant = "stage", className }: PatientAvatarProps) {
  const pose = POSES[state];
  const talking = speaking || state === "speaking";
  const mouth = useRef<SVGPathElement>(null);
  const portrait = variant === "portrait";

  useLayoutEffect(() => {
    const m = mouth.current;
    if (!m) return;
    if (!talking) {
      m.setAttribute("d", mouthPath(pose.curve, pose.open, pose.wide));
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const loop = () => {
      const fake = (() => {
        const s = (performance.now() - t0) / 1000;
        return Math.min(1, 0.2 + 0.8 * Math.abs(Math.sin(s * 10.5)) * (0.55 + 0.45 * Math.sin(s * 3.1 + 1)));
      })();
      const level = mouthLevelRef ? mouthLevelRef.current : fake;
      const lv = state === "speaking" ? fake : level;
      m.setAttribute("d", mouthPath(Math.max(pose.curve * 0.4, 0), Math.min(1, pose.open + lv * 0.85), pose.wide * (1 + lv * 0.08)));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [talking, pose, mouthLevelRef, state]);

  const eye = (x: number, delay: string) => (
    <g key={x}>
      <ellipse cx={x} cy={198} rx={11} ry={7.5} fill="#fff" stroke={a.skinShade} strokeWidth={0.8} />
      <g className={state === "anxious" ? "anim-dart" : undefined}>
        <g style={{ transform: `translateX(${state === "listening" ? 0 : state === "guarding" || state === "wincing" ? -1.5 : 0}px)`, transition: tr }}>
          <circle cx={x} cy={198.5} r={5.4} fill="#4a3228" />
          <circle cx={x} cy={198.5} r={2.4} fill="#1d1412" />
          <circle cx={x + 1.8} cy={196.6} r={1.2} fill="#fff" opacity={0.85} />
        </g>
      </g>
      <g style={{ transformOrigin: `${x}px 187px`, transform: `scaleY(${pose.lid})`, transition: tr }}>
        <ellipse cx={x} cy={198} rx={13} ry={11} fill={a.skin} />
      </g>
      <g className="anim-blink" style={{ transformOrigin: `${x}px 187px`, animationDelay: delay }}>
        <ellipse cx={x} cy={198} rx={13} ry={11} fill={a.skin} />
      </g>
    </g>
  );

  const brow = (x: number, rot: number) => (
    <path
      d={`M${x - 14},180 Q${x},172 ${x + 14},179`}
      fill="none"
      stroke={a.brow}
      strokeWidth={5}
      strokeLinecap="round"
      style={{ transformOrigin: `${x}px 178px`, transform: `translateY(${pose.browY}px) rotate(${rot}deg)`, transition: tr }}
    />
  );

  return (
    <svg
      viewBox={portrait ? "168 70 264 270" : "0 0 600 500"}
      preserveAspectRatio={portrait ? "xMidYMid slice" : "xMidYMax meet"}
      className={className}
      role="img"
      aria-label={`Simulated patient, ${state === "speaking" ? "speaking" : state}`}
    >
      {!portrait && <rect x={150} y={140} width={300} height={400} rx={46} fill="#b7c8c5" />}
      <g style={{ transform: `translateY(${pose.lift * 0.5}px)`, transition: tr }}>
        <g className="anim-breathe" style={{ transformOrigin: "300px 500px" }}>
          <g style={{ transformOrigin: "300px 500px", transform: `translateY(${pose.lean * 0.6}px)`, transition: tr }}>
            <path d="M165 500 C165 385 190 322 250 308 L350 308 C410 322 435 385 435 500 Z" fill={a.top} style={{ transform: `translateY(${pose.lift}px)`, transition: tr }} />
            <path d="M268 306 L300 346 L332 306 Z" fill={a.skinShade} />
            <rect x={278} y={250} width={44} height={64} rx={16} fill={a.skinShade} />
            <path d="M250 308 Q300 356 350 308" fill="none" stroke={a.topShade} strokeWidth={5} strokeLinecap="round" />
            {/* upper arms */}
            <line x1={192} y1={338} x2={200} y2={440} stroke={a.top} strokeWidth={46} strokeLinecap="round" />
            <line x1={408} y1={338} x2={400} y2={440} stroke={a.top} strokeWidth={46} strokeLinecap="round" />
            <line x1={192} y1={338} x2={200} y2={440} stroke={a.topShade} strokeWidth={4} strokeLinecap="round" opacity={0.0} />
            {/* forearms and hands */}
            <g style={{ transformOrigin: "200px 440px", transform: `rotate(${-pose.guard * 34}deg)`, transition: tr }}>
              <g className={state === "anxious" ? "anim-fidget" : undefined}>
                <line x1={200} y1={440} x2={258} y2={470} stroke={a.top} strokeWidth={38} strokeLinecap="round" />
                <ellipse cx={268} cy={474} rx={19} ry={13} fill={a.skin} />
              </g>
            </g>
            <g style={{ transformOrigin: "400px 440px", transform: `rotate(${pose.guard * 30}deg)`, transition: tr }}>
              <g className={state === "anxious" ? "anim-fidget" : undefined}>
                <line x1={400} y1={440} x2={342} y2={470} stroke={a.top} strokeWidth={38} strokeLinecap="round" />
                <ellipse cx={332} cy={474} rx={19} ry={13} fill={a.skin} />
              </g>
            </g>
          </g>
        </g>
      </g>

      {/* head */}
      <g style={{ transformOrigin: "300px 300px", transform: `translateY(${pose.headY + pose.lift * 0.4 + pose.lean * 0.5}px) rotate(${pose.tilt}deg)`, transition: tr }}>
        <g className="anim-sway" style={{ transformOrigin: "300px 300px" }}>
          {a.hairStyle === "bun" && (
            <>
              <ellipse cx={300} cy={190} rx={69} ry={80} fill={a.hair} />
              <circle cx={300} cy={118} r={30} fill={a.hair} />
            </>
          )}
          <ellipse cx={240} cy={208} rx={9} ry={14} fill={a.skinShade} />
          <ellipse cx={360} cy={208} rx={9} ry={14} fill={a.skinShade} />
          <ellipse cx={300} cy={200} rx={60} ry={72} fill={a.skin} />
          {a.stubble && <path d="M242 214 Q250 272 300 278 Q350 272 358 214 Q342 252 300 254 Q258 252 242 214Z" fill={a.hair} opacity={0.28} />}
          <path
            d={
              a.hairStyle === "bun"
                ? "M236 192 C230 128 268 110 300 110 C332 110 370 128 364 192 C352 160 330 148 300 148 C270 148 248 160 236 192Z"
                : "M237 186 C228 118 270 104 300 104 C338 104 374 120 363 186 C353 158 340 144 300 144 C262 144 247 158 237 186Z"
            }
            fill={a.hair}
          />
          <circle cx={262} cy={236} r={11} fill="#e58b7e" opacity={0.22} />
          <circle cx={338} cy={236} r={11} fill="#e58b7e" opacity={0.22} />
          {eye(274, "0s")}
          {eye(326, "0.04s")}
          {brow(274, pose.browL)}
          {brow(326, pose.browR)}
          {a.glasses && (
            <g fill="rgba(255,255,255,0.1)" stroke="#3b3b4a" strokeWidth={2.4}>
              <circle cx={274} cy={198} r={18} />
              <circle cx={326} cy={198} r={18} />
              <path d="M291 195 Q300 190 309 195" fill="none" />
            </g>
          )}
          <path d="M300 206 Q293 230 296 237 Q300 241 306 237" fill="none" stroke={a.skinShade} strokeWidth={2.6} strokeLinecap="round" />
          <path ref={mouth} d={mouthPath(pose.curve, pose.open, pose.wide)} fill="#4a1f24" stroke="#9a4a4a" strokeWidth={2.4} strokeLinejoin="round" />
        </g>
      </g>
    </svg>
  );
}

export function RoomBackdrop() {
  return (
    <svg viewBox="0 0 1200 520" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" aria-hidden="true">
      <defs>
        <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#edf2ef" />
          <stop offset="1" stopColor="#dfe8e4" />
        </linearGradient>
        <linearGradient id="win" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fdfbf4" />
          <stop offset="1" stopColor="#dbe9ea" />
        </linearGradient>
      </defs>
      <rect width="1200" height="520" fill="url(#wall)" />
      <rect y="400" width="1200" height="120" fill="#d8d0c1" />
      <rect y="394" width="1200" height="8" fill="#c8bfae" />
      <g transform="translate(120 56)">
        <rect width="190" height="230" rx="6" fill="#f6f3ea" stroke="#cdc6b6" strokeWidth="6" />
        <rect x="10" y="10" width="170" height="210" fill="url(#win)" />
        {[40, 70, 100, 130, 160, 190].map((y) => (
          <rect key={y} x="10" y={y} width="170" height="10" fill="#fff" opacity="0.55" />
        ))}
      </g>
      <g transform="translate(900 70)">
        <rect width="150" height="110" rx="4" fill="#fff" stroke="#c9c2b2" strokeWidth="5" />
        <circle cx="52" cy="56" r="26" fill="#9cc3bf" opacity="0.7" />
        <circle cx="86" cy="48" r="18" fill="#f0c9a8" opacity="0.8" />
        <rect x="30" y="86" width="90" height="6" rx="3" fill="#cfd8dc" />
      </g>
      <g transform="translate(960 250)">
        <rect width="120" height="22" rx="3" fill="#cdc6b6" />
        <rect x="14" y="-34" width="14" height="34" rx="3" fill="#7fa8a3" />
        <rect x="36" y="-26" width="12" height="26" rx="3" fill="#e7d3b0" />
        <path d="M92 0 q-8 -26 4 -40 q12 14 4 40z" fill="#6f9a7c" />
      </g>
      <rect x="860" y="352" width="340" height="64" rx="18" fill="#6d9c97" />
      <rect x="860" y="346" width="340" height="14" rx="7" fill="#e7ecea" opacity="0.8" />
      <rect x="90" y="378" width="10" height="44" fill="#a9a396" />
    </svg>
  );
}
