import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "./Button.js";

/** Keep overflow controls outside the scrolling tabs so they never consume tab height. */
export function SpaceTabStrip({
  children,
  activeTabId,
  workspaceId,
  onNewSpace,
}: {
  children: ReactNode;
  activeTabId: string | undefined;
  workspaceId: string | undefined;
  onNewSpace(): void;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ overflow: false, start: true, end: true });
  const measure = useCallback(() => {
    const element = viewport.current;
    if (!element) return;
    const max = element.scrollWidth - element.clientWidth;
    const next = {
      overflow: max > 1,
      start: element.scrollLeft <= 1,
      end: element.scrollLeft >= max - 1,
    };
    setEdges((previous) =>
      previous.overflow === next.overflow &&
      previous.start === next.start &&
      previous.end === next.end
        ? previous
        : next,
    );
  }, []);
  const revealActive = useCallback(() => {
    const element = viewport.current;
    const selected = content.current?.querySelector<HTMLElement>('[data-active="true"]');
    if (element && selected) {
      const bounds = element.getBoundingClientRect();
      const tab = selected.getBoundingClientRect();
      if (tab.left < bounds.left) element.scrollLeft += tab.left - bounds.left;
      else if (tab.right > bounds.right) element.scrollLeft += tab.right - bounds.right;
    }
    measure();
  }, [measure]);
  useLayoutEffect(() => {
    const observer = new ResizeObserver(revealActive);
    if (viewport.current) observer.observe(viewport.current);
    if (content.current) observer.observe(content.current);
    revealActive();
    return () => observer.disconnect();
  }, [revealActive]);
  useLayoutEffect(() => {
    revealActive();
  }, [activeTabId, workspaceId, edges.overflow, revealActive]);
  const scroll = (direction: number) => {
    const element = viewport.current;
    if (!element) return;
    element.scrollLeft += direction * Math.max(120, element.clientWidth * 0.75);
    measure();
  };
  return (
    <div className="window-no-drag flex h-full min-w-0 flex-1 items-center gap-0.5">
      {edges.overflow && (
        <Button
          aria-label="Scroll Spaces left"
          title="Scroll Spaces left"
          variant="ghost"
          size="icon"
          className="size-7"
          disabled={edges.start}
          onClick={() => scroll(-1)}
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
        </Button>
      )}
      <div
        ref={viewport}
        className="workspace-tab-strip h-full min-w-0 flex-1 overflow-x-auto overflow-y-hidden px-2 pt-1"
        onScroll={measure}
      >
        <div ref={content} className="flex h-full w-max min-w-full items-end gap-0.5">
          {children}
        </div>
      </div>
      {edges.overflow && (
        <Button
          aria-label="Scroll Spaces right"
          title="Scroll Spaces right"
          variant="ghost"
          size="icon"
          className="size-7"
          disabled={edges.end}
          onClick={() => scroll(1)}
        >
          <ChevronRight aria-hidden="true" className="size-4" />
        </Button>
      )}
      <Button
        aria-label="New space"
        title="New space"
        className="mr-1 size-7"
        size="icon"
        variant="ghost"
        onClick={onNewSpace}
      >
        <Plus aria-hidden="true" className="size-4" />
      </Button>
    </div>
  );
}
