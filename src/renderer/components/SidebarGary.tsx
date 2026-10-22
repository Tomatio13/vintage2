import { Apple } from "lucide-react";
import { useEffect, useRef } from "react";
import { createGaryScene } from "../lib/sidebarGary.js";

export function SidebarGary() {
  const track = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = track.current;
    if (!root) return;
    const traveler = root.querySelector<HTMLElement>(".sidebar-gary-traveler")!;
    const facing = root.querySelector<HTMLElement>(".sidebar-gary-facing")!;
    const stairs = root.querySelector<HTMLElement>(".sidebar-gary-stairs")!;
    const apple = root.querySelector<SVGElement>(".sidebar-gary-apple")!;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let animations: Animation[] = [];
    let generation = 0;
    const restart = () => {
      const current = ++generation;
      animations.forEach((animation) => animation.cancel());
      animations = [];
      if (motion.matches) return;
      const next = () => {
        if (generation !== current) return;
        animations.forEach((animation) => animation.cancel());
        const scene = createGaryScene();
        stairs.style.left = scene.stairLeft;
        stairs.style.width = scene.stairWidth;
        apple.style.left = scene.appleLeft;
        const options: KeyframeAnimationOptions = { duration: scene.duration, fill: "forwards" };
        animations = [
          traveler.animate(scene.travel, options),
          facing.animate(scene.facing, options),
          facing.animate(scene.chewing, options),
          apple.animate(scene.food, options),
        ];
        // Every canceled animation rejects its finished promise, including siblings.
        animations.forEach((animation) => void animation.finished.catch(() => {}));
        void animations[0]!.finished.then(next).catch(() => {});
      };
      next();
    };
    restart();
    motion.addEventListener("change", restart);
    return () => {
      generation++;
      animations.forEach((animation) => animation.cancel());
      motion.removeEventListener("change", restart);
    };
  }, []);

  return (
    <div aria-hidden="true" className="sidebar-gary-track" ref={track}>
      <span className="sidebar-gary-stairs" />
      <Apple className="sidebar-gary-apple" />
      <span className="sidebar-gary-traveler">
        <span className="sidebar-gary-facing">
          <span className="sidebar-gary-body" />
        </span>
      </span>
    </div>
  );
}
