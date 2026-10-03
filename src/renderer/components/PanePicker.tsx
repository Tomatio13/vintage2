import { Check, ChevronDown, type LucideIcon } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";

export interface PanePickerOption {
  value: string;
  label: string;
  description: string;
  Icon: LucideIcon;
}

interface PickerMenuPosition {
  top: number;
  left: number;
}

export function PanePicker({
  title,
  subtitle,
  eyebrow,
  value,
  options,
  active,
  triggerClassName,
  onChange,
}: {
  title: string;
  subtitle: string;
  eyebrow: string;
  value: string;
  options: readonly PanePickerOption[];
  active: boolean;
  triggerClassName?: string;
  onChange(value: string): void;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<PickerMenuPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = `pane-picker-menu-${useId()}`;
  const selectedOption = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!active) setOpen(false);
  }, [active]);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;

    const triggerRect = trigger.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const gutter = 8;
    const maxLeft = Math.max(gutter, window.innerWidth - menuRect.width - gutter);
    const left = Math.min(maxLeft, Math.max(gutter, triggerRect.right - menuRect.width));
    const spaceBelow = window.innerHeight - triggerRect.bottom - gutter;
    const spaceAbove = triggerRect.top - gutter;
    const placeBelow = spaceBelow >= menuRect.height || spaceBelow >= spaceAbove;
    const top = placeBelow
      ? Math.min(triggerRect.bottom + 6, window.innerHeight - menuRect.height - gutter)
      : Math.max(gutter, triggerRect.top - menuRect.height - 6);

    setPosition((current) =>
      current?.top === top && current.left === left ? current : { top, left },
    );
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }

    updatePosition();
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updatePosition);
    if (observer && triggerRef.current) observer.observe(triggerRef.current);
    if (observer && menuRef.current) observer.observe(menuRef.current);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    menuRef.current
      ?.querySelector<HTMLButtonElement>('[role="menuitemradio"][aria-checked="true"]')
      ?.focus();

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;

    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", handleOutsidePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const closeAfterSelection = (nextValue: string) => {
    onChange(nextValue);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = [
      ...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? []),
    ];
    if (items.length === 0) return;

    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    let nextIndex: number | null = null;
    if (event.key === "ArrowDown") nextIndex = (currentIndex + 1 + items.length) % items.length;
    if (event.key === "ArrowUp") nextIndex = (currentIndex - 1 + items.length) % items.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = items.length - 1;
    if (nextIndex !== null) {
      event.preventDefault();
      items[nextIndex]?.focus();
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        aria-controls={menuId}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={title}
        className={`flex h-7 min-w-0 shrink-0 items-center justify-between gap-1.5 rounded-md bg-transparent px-2 text-ui-xs font-medium text-foreground-subtle transition-colors hover:bg-hover hover:text-foreground aria-expanded:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand ${triggerClassName ?? "w-36"}`}
        title={selectedOption?.description}
        type="button"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          event.preventDefault();
          setOpen(true);
        }}
      >
        <span className="min-w-0 flex-1 truncate text-left">
          {selectedOption?.label ?? "Select"}
        </span>
        <ChevronDown aria-hidden="true" className="size-3.5 shrink-0 text-foreground-subtle" />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            aria-label={`${title} options`}
            className="fixed z-[70] flex max-h-[calc(100vh-1rem)] w-60 max-w-[calc(100vw-1rem)] flex-col overflow-y-auto rounded-lg border border-border bg-header p-1.5 text-foreground shadow-none"
            role="menu"
            style={{
              left: position?.left ?? 0,
              top: position?.top ?? 0,
              visibility: position ? "visible" : "hidden",
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={handleMenuKeyDown}
          >
            <div className="flex items-center justify-between gap-2 px-2 py-1.5">
              <div className="min-w-0">
                <p className="text-ui-sm font-semibold text-foreground">{title}</p>
                <p className="truncate text-ui-xs text-foreground-subtlest">{subtitle}</p>
              </div>
              <span className="shrink-0 font-mono text-[9px] font-semibold tracking-[0.12em] text-foreground-subtlest">
                {eyebrow}
              </span>
            </div>
            <div aria-hidden="true" className="mx-2 my-1 h-px bg-border" />
            <div className="flex flex-col gap-0.5">
              {options.map(({ value: optionValue, label, description, Icon }) => {
                const selected = optionValue === value;
                return (
                  <button
                    key={optionValue}
                    aria-checked={selected}
                    aria-label={label}
                    className={`flex min-h-11 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-hover focus-visible:bg-hover focus-visible:outline-none ${selected ? "bg-selected/70" : ""}`}
                    role="menuitemradio"
                    tabIndex={-1}
                    type="button"
                    onClick={() => closeAfterSelection(optionValue)}
                  >
                    <span
                      className={`grid size-7 shrink-0 place-items-center ${selected ? "text-foreground" : "text-foreground-subtlest"}`}
                    >
                      <Icon aria-hidden="true" className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-ui-sm font-medium text-foreground">
                        {label}
                      </span>
                      <span className="block text-ui-xs leading-4 text-foreground-subtlest">
                        {description}
                      </span>
                    </span>
                    {selected ? <Check aria-hidden="true" className="size-4 shrink-0" /> : null}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
