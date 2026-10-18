import { useEffect, useRef } from "react";
import { useUiStore } from "../store/uiStore.js";

const LIFETIME = 1100;
const GLYPHS = "01<>/{}[]:+*アイウエオカキクケコ";
type Ripple = { x: number; y: number; start: number; color: string; light: boolean };

/** A decorative surface only: never owns focus, pointer events, or terminal state. */
export function CharacterRipple() {
  const enabled = useUiStore((state) => state.characterRippleEnabled);
  const intensity = useUiStore((state) => state.characterRippleIntensity);
  const customColor = useUiStore((state) => state.characterRippleColor);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!enabled) return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let ripples: Ripple[] = [];
    let frame = 0;
    let width = 0;
    let height = 0;
    const strength = Math.min(100, Math.max(10, intensity)) / 100;
    const clear = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      ripples = [];
      context.clearRect(0, 0, width, height);
    };
    const resize = () => {
      clear();
      width = window.innerWidth;
      height = window.innerHeight;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    const draw = (now: number) => {
      frame = 0;
      context.clearRect(0, 0, width, height);
      ripples = ripples.filter((ripple) => now - ripple.start < LIFETIME);
      context.textAlign = "center";
      context.textBaseline = "middle";
      for (const ripple of ripples) {
        const progress = Math.max(0, (now - ripple.start) / LIFETIME);
        const radius = (1 - (1 - progress) ** 2) * (160 + strength * 240);
        const band = 40 + strength * 30;
        const extent = radius + band;
        context.fillStyle = ripple.color;
        context.font = '600 11px ui-monospace, "Cica", monospace';
        // Hold the color briefly, then fade smoothly to transparent.
        const fadeProgress = Math.max(0, (progress - 0.2) / 0.8);
        const fade = 1 - fadeProgress * fadeProgress * (3 - 2 * fadeProgress);
        // A stable character grid reveals a traveling wave rather than flying confetti.
        for (
          let row = Math.ceil(Math.max(0, ripple.y - extent) / 14);
          row * 14 < Math.min(height, ripple.y + extent);
          row++
        ) {
          for (
            let col = Math.ceil(Math.max(0, ripple.x - extent) / 14);
            col * 14 < Math.min(width, ripple.x + extent);
            col++
          ) {
            const x = col * 14;
            const y = row * 14;
            const distance = Math.hypot(x - ripple.x, y - ripple.y);
            const wave = Math.max(0, 1 - Math.abs(distance - radius) / band);
            if (!wave) continue;
            const seed = (col * 31 + row * 17) >>> 0;
            context.globalAlpha =
              wave ** 1.15 * fade * (ripple.light ? 0.65 + strength * 0.35 : 0.4 + strength * 0.5);
            context.fillText(
              GLYPHS[seed % GLYPHS.length]!,
              x,
              y + Math.sin(distance * 0.045 - progress * 9) * wave * 5,
            );
          }
        }
      }
      context.globalAlpha = 1;
      if (ripples.length) frame = requestAnimationFrame(draw);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || !event.isPrimary || motion.matches || document.hidden) return;
      const target = event.target;
      if (target instanceof Element && target.closest("webview, iframe, .window-drag")) return;
      const root = document.documentElement;
      const light = !root.matches(".dark, .graphite");
      const color =
        customColor ??
        (getComputedStyle(root)
          .getPropertyValue(light ? "--color-brand" : "--color-foreground-subtle")
          .trim() ||
          (light ? "#89682e" : "#888888"));
      ripples = [
        ...ripples.slice(-2),
        { x: event.clientX, y: event.clientY, start: performance.now(), color, light },
      ];
      if (!frame) frame = requestAnimationFrame(draw);
    };
    resize();
    window.addEventListener("pointerdown", onPointerDown, { capture: true, passive: true });
    window.addEventListener("resize", resize);
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", clear);
    motion.addEventListener("change", clear);
    return () => {
      clear();
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("resize", resize);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", clear);
      motion.removeEventListener("change", clear);
    };
  }, [enabled, intensity, customColor]);

  return enabled ? (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[100] h-full w-full"
    />
  ) : null;
}
