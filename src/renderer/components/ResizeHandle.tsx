import type { KeyboardEvent, PointerEvent } from "react";

export function ResizeHandle({
  axis,
  value,
  min,
  max,
  invert = false,
  onChange,
  label,
}: {
  axis: "x" | "y";
  value: number;
  min: number;
  max: number;
  invert?: boolean;
  onChange(value: number): void;
  label: string;
}) {
  function begin(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    const origin = axis === "x" ? event.clientX : event.clientY;
    const start = value;
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    document.documentElement.classList.add(`is-resizing-${axis}`);

    const move = (next: globalThis.PointerEvent) => {
      const point = axis === "x" ? next.clientX : next.clientY;
      const delta = (point - origin) * (invert ? -1 : 1);
      onChange(clamp(start + delta, min, max));
    };
    const end = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", end);
      target.removeEventListener("pointercancel", end);
      document.documentElement.classList.remove(`is-resizing-${axis}`);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", end);
    target.addEventListener("pointercancel", end);
  }

  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    const backward = axis === "x" ? event.key === "ArrowLeft" : event.key === "ArrowUp";
    const forward = axis === "x" ? event.key === "ArrowRight" : event.key === "ArrowDown";
    if (!backward && !forward) return;
    event.preventDefault();
    const direction = (forward ? 1 : -1) * (invert ? -1 : 1);
    onChange(clamp(value + direction * 16, min, max));
  }

  return (
    <div
      aria-label={label}
      aria-orientation={axis === "x" ? "vertical" : "horizontal"}
      aria-valuemax={max}
      aria-valuemin={min}
      aria-valuenow={Math.round(value)}
      className={axis === "x" ? "resize-handle-x" : "resize-handle-y"}
      role="separator"
      tabIndex={0}
      onKeyDown={keyboard}
      onPointerDown={begin}
    >
      <span aria-hidden="true" className="resize-handle-grip" />
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
