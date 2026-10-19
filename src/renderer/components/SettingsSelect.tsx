import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "../lib/cn.js";

export function SettingsSelect({
  value,
  onChange,
  label,
  options,
  className,
  triggerClassName,
}: {
  className?: string;
  triggerClassName?: string;
  value: string;
  onChange(value: string): void;
  label: string;
  options: Array<{ id: string; label: string }>;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    root.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  return (
    <div
      className={cn("relative", className)}
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        ref={trigger}
        className={cn(
          "flex h-9 w-52 items-center justify-between gap-2 rounded-lg border border-border bg-panel px-3 text-ui-sm text-foreground outline-none hover:bg-hover focus-visible:border-brand",
          triggerClassName,
        )}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className="truncate">
          {options.find((item) => item.id === value)?.label ?? value}
        </span>
        <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-foreground-subtle" />
      </button>
      {open && (
        <div
          aria-label={`${label} options`}
          id={menuId}
          role="menu"
          className="absolute right-0 top-full z-10 mt-1 min-w-full w-max max-w-80 rounded-xl border border-popover-border bg-popover p-1 text-foreground shadow-xl"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
              trigger.current?.focus();
              return;
            }
            if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const items = Array.from(
              event.currentTarget.querySelectorAll<HTMLButtonElement>("button"),
            );
            const current = items.indexOf(document.activeElement as HTMLButtonElement);
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? items.length - 1
                  : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
            items[next]?.focus();
          }}
        >
          {options.map((item) => (
            <button
              type="button"
              aria-checked={value === item.id}
              role="menuitemradio"
              tabIndex={value === item.id ? 0 : -1}
              key={item.id}
              className={`flex w-full items-center justify-between gap-4 rounded-lg px-3 py-2.5 text-left text-ui-base outline-none hover:bg-hover focus-visible:bg-hover ${value === item.id ? "bg-selected" : ""}`}
              onClick={() => {
                onChange(item.id);
                setOpen(false);
                trigger.current?.focus();
              }}
            >
              {item.label}
              {value === item.id && (
                <Check aria-hidden="true" className="size-4 shrink-0 text-foreground-subtle" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
