import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";

export function useDocumentWheelZoom(setZoom: Dispatch<SetStateAction<number>>, enabled = true) {
  const root = useRef<HTMLElement>(null);
  // Native non-passive listener is needed to cancel Chromium's default Ctrl-wheel behavior.
  useEffect(() => {
    const element = root.current;
    if (!element || !enabled) return;
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey || event.altKey || event.metaKey || !event.deltaY) return;
      event.preventDefault();
      event.stopPropagation();
      setZoom(
        (current) =>
          Math.round(Math.min(3, Math.max(0.5, current + (event.deltaY < 0 ? 0.1 : -0.1))) * 10) /
          10,
      );
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  });
  return root;
}
