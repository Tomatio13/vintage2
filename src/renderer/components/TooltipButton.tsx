import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";

type TooltipButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "title"> & {
  tooltip: string;
  shortcut?: string | null | undefined;
  shortcutDescription?: string | undefined;
  placement?: "bottom" | "left";
};

/** Portal tooltips stay visible outside the clipped window header and tool rail. */
export function TooltipButton({
  tooltip,
  shortcut,
  shortcutDescription,
  placement = "bottom",
  children,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
  onClick,
  ...props
}: TooltipButtonProps) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const cancelTimer = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  const close = () => {
    cancelTimer();
    setOpen(false);
    setPosition(null);
  };
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );
  useLayoutEffect(() => {
    if (!open || !button.current || !bubble.current) return;
    const anchor = button.current.getBoundingClientRect();
    const tip = bubble.current.getBoundingClientRect();
    let left = placement === "left" ? anchor.left - tip.width - 8 : anchor.left;
    let top =
      placement === "left" ? anchor.top + (anchor.height - tip.height) / 2 : anchor.bottom + 8;
    if (placement === "bottom" && top + tip.height > window.innerHeight - 8)
      top = anchor.top - tip.height - 8;
    left = Math.max(8, Math.min(left, window.innerWidth - tip.width - 8));
    top = Math.max(8, Math.min(top, window.innerHeight - tip.height - 8));
    setPosition({ left, top });
  }, [open, placement, tooltip, shortcut]);
  useEffect(() => {
    if (!open) return;
    const dismiss = () => setOpen(false);
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, true);
    document.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", dismiss, true);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  return (
    <>
      <button
        {...props}
        ref={button}
        type={props.type ?? "button"}
        aria-describedby={
          open
            ? [props["aria-describedby"], id].filter(Boolean).join(" ")
            : props["aria-describedby"]
        }
        onMouseEnter={(event) => {
          onMouseEnter?.(event);
          cancelTimer();
          if (!props.disabled) timer.current = setTimeout(() => setOpen(true), 400);
        }}
        onMouseLeave={(event) => {
          close();
          onMouseLeave?.(event);
        }}
        onFocus={(event) => {
          cancelTimer();
          if (!props.disabled) setOpen(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          close();
          onBlur?.(event);
        }}
        onClick={(event) => {
          close();
          onClick?.(event);
        }}
      >
        {children}
      </button>
      {open &&
        createPortal(
          <div
            id={id}
            ref={bubble}
            role="tooltip"
            className="pointer-events-none fixed z-[100] flex max-w-[calc(100vw-16px)] items-center gap-2 rounded-lg border border-border bg-popover px-3 py-1.5 text-ui-base font-medium text-foreground shadow-md"
            style={{ ...position, visibility: position ? "visible" : "hidden" }}
          >
            <span className="min-w-0 truncate">{tooltip}</span>
            {shortcut && (
              <kbd
                aria-label={shortcutDescription ? `${shortcutDescription}: ${shortcut}` : undefined}
                className="shrink-0 rounded bg-foreground/10 px-1.5 py-0.5 font-mono text-ui-sm font-normal leading-none text-foreground-subtle"
              >
                {shortcut}
              </kbd>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
