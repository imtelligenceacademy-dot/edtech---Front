"use client";

import { useEffect, useRef, useState } from "react";

// Purely decorative, lightly interactive 3D robot for the login brand panel.
// CSS-only rendering (gradients + 3D transforms + keyframes) plus one mouse
// listener that writes CSS variables — no libraries, no re-renders, no effect
// on the rest of the app. He follows the cursor, waves on hover, and hops on
// click. aria-hidden so screen readers skip him entirely.
export function RobotHero() {
  const sceneRef = useRef<HTMLDivElement>(null);
  const [jumping, setJumping] = useState(false);

  // Cursor tracking: tilt the whole robot and shift his gaze toward the mouse.
  // Written straight to CSS variables (no state) so it costs nothing.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const scene = sceneRef.current;
    if (!scene) return;

    function onMove(e: MouseEvent) {
      const rect = scene!.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      // Normalized -1..1, damped so far-away movement still reads as subtle.
      const nx = Math.max(-1, Math.min(1, (e.clientX - cx) / (window.innerWidth / 2)));
      const ny = Math.max(-1, Math.min(1, (e.clientY - cy) / (window.innerHeight / 2)));
      scene!.style.setProperty("--tilt-y", `${(nx * 16).toFixed(2)}deg`);
      scene!.style.setProperty("--tilt-x", `${(-ny * 10).toFixed(2)}deg`);
      scene!.style.setProperty("--gaze-x", `${(nx * 7).toFixed(2)}px`);
      scene!.style.setProperty("--gaze-y", `${(ny * 4).toFixed(2)}px`);
    }

    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  function hop() {
    if (jumping) return;
    setJumping(true);
    window.setTimeout(() => setJumping(false), 700);
  }

  return (
    <div className="bot-scene" aria-hidden="true" ref={sceneRef} onClick={hop}>
      <div className="bot-tilt">
        <div className={`bot${jumping ? " bot-jumping" : ""}`}>
          {/* Antenna */}
          <div className="bot-antenna">
            <span className="bot-antenna-tip" />
          </div>

          {/* Head */}
          <div className="bot-head">
            <span className="bot-ear bot-ear-l" />
            <span className="bot-ear bot-ear-r" />
            <div className="bot-visor">
              <div className="bot-gaze">
                <span className="bot-eye" />
                <span className="bot-eye" />
              </div>
              <span className="bot-mouth" />
            </div>
          </div>

          <div className="bot-neck" />

          {/* Body */}
          <div className="bot-body">
            <span className="bot-core" />
            <span className="bot-slit" />
          </div>

          {/* Arms */}
          <span className="bot-arm bot-arm-l" />
          <span className="bot-arm bot-arm-r" />
        </div>
      </div>

      {/* Ground shadow */}
      <span className="bot-shadow" />

      <style>{`
        .bot-scene {
          position: relative;
          width: 240px;
          height: 320px;
          margin: 0 auto;
          perspective: 900px;
          cursor: pointer;
          --tilt-x: 4deg;
          --tilt-y: 0deg;
          --gaze-x: 0px;
          --gaze-y: 0px;
        }
        .bot-tilt {
          position: absolute;
          inset: 0 0 48px 0;
          transform-style: preserve-3d;
          transform: rotateX(var(--tilt-x)) rotateY(var(--tilt-y));
          transition: transform 0.18s ease-out;
        }
        .bot {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          transform-style: preserve-3d;
          animation: bot-float 5.5s ease-in-out infinite;
        }
        .bot.bot-jumping {
          animation: bot-jump 0.7s cubic-bezier(0.28, 0.84, 0.42, 1);
        }

        /* ---- Head ---- */
        .bot-head {
          position: relative;
          width: 128px;
          height: 96px;
          border-radius: 28px;
          background: linear-gradient(145deg, #f1f5f9 0%, #cbd5e1 55%, #94a3b8 100%);
          box-shadow:
            inset -6px -8px 14px rgba(15, 23, 42, 0.25),
            inset 6px 8px 14px rgba(255, 255, 255, 0.85),
            0 18px 40px rgba(8, 145, 178, 0.28);
        }
        .bot-visor {
          position: absolute;
          inset: 18px 16px;
          border-radius: 18px;
          background: linear-gradient(160deg, #0f172a, #1e293b);
          box-shadow: inset 0 2px 10px rgba(0, 0, 0, 0.7), 0 1px 0 rgba(255,255,255,0.35);
          overflow: hidden;
        }
        .bot-gaze {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 22px;
          transform: translate(var(--gaze-x), var(--gaze-y));
          transition: transform 0.15s ease-out;
        }
        .bot-eye {
          width: 15px;
          height: 15px;
          border-radius: 50%;
          background: radial-gradient(circle at 35% 30%, #a5f3fc, #22d3ee 60%, #0891b2);
          box-shadow: 0 0 12px #22d3ee, 0 0 28px rgba(34, 211, 238, 0.55);
          animation: bot-blink 4.2s infinite;
        }
        /* Happy squint while hovered */
        .bot-scene:hover .bot-eye {
          height: 11px;
          border-radius: 999px 999px 45% 45%;
        }
        .bot-mouth {
          position: absolute;
          bottom: 9px;
          left: 50%;
          width: 26px;
          height: 3.5px;
          border-radius: 999px;
          background: #22d3ee;
          opacity: 0.7;
          box-shadow: 0 0 8px rgba(34, 211, 238, 0.8);
          transform: translateX(-50%);
          transition: width 0.2s ease, height 0.2s ease;
        }
        .bot-scene:hover .bot-mouth {
          width: 16px;
          height: 8px;
          border-radius: 0 0 999px 999px;
          background: transparent;
          border: 2.5px solid #22d3ee;
          border-top: none;
          box-shadow: 0 0 8px rgba(34, 211, 238, 0.5);
        }
        .bot-ear {
          position: absolute;
          top: 34px;
          width: 12px;
          height: 26px;
          border-radius: 6px;
          background: linear-gradient(180deg, #94a3b8, #64748b);
          box-shadow: 0 4px 8px rgba(15, 23, 42, 0.35);
        }
        .bot-ear-l { left: -12px; }
        .bot-ear-r { right: -12px; }

        /* ---- Antenna ---- */
        .bot-antenna {
          width: 4px;
          height: 26px;
          border-radius: 999px;
          background: linear-gradient(180deg, #cbd5e1, #64748b);
          position: relative;
          z-index: 1;
        }
        .bot-antenna-tip {
          position: absolute;
          top: -10px;
          left: 50%;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          transform: translateX(-50%);
          background: radial-gradient(circle at 35% 30%, #a5f3fc, #06b6d4);
          box-shadow: 0 0 10px #22d3ee, 0 0 24px rgba(34, 211, 238, 0.6);
          animation: bot-pulse 2.4s ease-in-out infinite;
        }

        .bot-neck {
          width: 34px;
          height: 12px;
          margin-top: 2px;
          border-radius: 6px;
          background: linear-gradient(180deg, #94a3b8, #475569);
        }

        /* ---- Body ---- */
        .bot-body {
          position: relative;
          width: 148px;
          height: 104px;
          margin-top: 2px;
          border-radius: 30px;
          background: linear-gradient(150deg, #e2e8f0 0%, #94a3b8 60%, #64748b 100%);
          box-shadow:
            inset -8px -10px 16px rgba(15, 23, 42, 0.3),
            inset 8px 10px 16px rgba(255, 255, 255, 0.8),
            0 24px 48px rgba(8, 145, 178, 0.25);
        }
        .bot-core {
          position: absolute;
          top: 26px;
          left: 50%;
          width: 34px;
          height: 34px;
          border-radius: 50%;
          transform: translateX(-50%);
          background: radial-gradient(circle at 35% 30%, #cffafe, #22d3ee 55%, #0e7490);
          box-shadow:
            0 0 14px rgba(34, 211, 238, 0.9),
            0 0 36px rgba(34, 211, 238, 0.45),
            inset 0 -3px 6px rgba(8, 51, 68, 0.5);
          animation: bot-pulse 3s ease-in-out infinite;
        }
        .bot-scene:hover .bot-core {
          animation-duration: 1.2s;
        }
        .bot-slit {
          position: absolute;
          bottom: 16px;
          left: 50%;
          width: 56px;
          height: 5px;
          border-radius: 999px;
          transform: translateX(-50%);
          background: rgba(15, 23, 42, 0.35);
          box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.5);
        }

        /* ---- Arms ---- */
        .bot-arm {
          position: absolute;
          top: 132px;
          width: 16px;
          height: 62px;
          border-radius: 999px;
          background: linear-gradient(180deg, #cbd5e1, #64748b);
          box-shadow: 0 8px 16px rgba(15, 23, 42, 0.35);
        }
        .bot-arm-l {
          left: 22px;
          transform-origin: top center;
          animation: bot-arm-sway 5.5s ease-in-out infinite;
        }
        .bot-arm-r {
          right: 22px;
          transform-origin: top center;
          animation: bot-arm-sway 5.5s ease-in-out infinite reverse;
        }
        /* Wave hello while hovered */
        .bot-scene:hover .bot-arm-r {
          animation: bot-wave 1.1s ease-in-out infinite;
        }

        /* ---- Ground shadow ---- */
        .bot-shadow {
          position: absolute;
          bottom: 18px;
          left: 50%;
          width: 130px;
          height: 22px;
          border-radius: 50%;
          transform: translateX(-50%);
          background: radial-gradient(ellipse at center, rgba(2, 6, 23, 0.55), transparent 70%);
          animation: bot-shadow 5.5s ease-in-out infinite;
        }

        /* ---- Keyframes ---- */
        @keyframes bot-float {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-16px); }
        }
        @keyframes bot-jump {
          0%   { transform: translateY(0) scale(1, 1); }
          18%  { transform: translateY(4px) scale(1.06, 0.9); }
          45%  { transform: translateY(-42px) scale(0.97, 1.05); }
          70%  { transform: translateY(0) scale(1.04, 0.94); }
          85%  { transform: translateY(-6px) scale(1, 1); }
          100% { transform: translateY(0) scale(1, 1); }
        }
        @keyframes bot-blink {
          0%, 46%, 52%, 100% { transform: scaleY(1); }
          49%                { transform: scaleY(0.08); }
        }
        @keyframes bot-pulse {
          0%, 100% { transform: translateX(-50%) scale(1); opacity: 1; }
          50%      { transform: translateX(-50%) scale(1.12); opacity: 0.85; }
        }
        @keyframes bot-wave {
          0%, 100% { transform: rotate(0deg); }
          30%      { transform: rotate(-42deg); }
          60%      { transform: rotate(-14deg); }
          80%      { transform: rotate(-38deg); }
        }
        @keyframes bot-arm-sway {
          0%, 100% { transform: rotate(3deg); }
          50%      { transform: rotate(-3deg); }
        }
        @keyframes bot-shadow {
          0%, 100% { transform: translateX(-50%) scale(1); opacity: 0.9; }
          50%      { transform: translateX(-50%) scale(0.78); opacity: 0.55; }
        }

        @media (prefers-reduced-motion: reduce) {
          .bot, .bot-eye, .bot-antenna-tip, .bot-core,
          .bot-arm-l, .bot-arm-r, .bot-shadow, .bot-tilt, .bot-gaze {
            animation: none;
            transition: none;
          }
        }
      `}</style>
    </div>
  );
}
