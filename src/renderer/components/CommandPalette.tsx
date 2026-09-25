import {
  Command,
  FileText,
  Folder,
  FolderOpen,
  LayoutGrid,
  List,
  MapPin,
  PanelLeft,
  PanelRight,
  Plus,
  Search,
  Settings,
  SplitSquareHorizontal,
  SplitSquareVertical,
  TerminalSquare,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

export type CommandPaletteScope = "all" | "actions" | "locations";
export type CommandPaletteSection = "suggested" | "actions" | "workspaces" | "spaces" | "terminals";
export type CommandPaletteIcon =
  | "command"
  | "file"
  | "folder"
  | "workspace"
  | "space"
  | "terminal"
  | "settings"
  | "new"
  | "split-right"
  | "split-down"
  | "sidebar"
  | "browser";

export interface CommandPaletteItem {
  id: string;
  kind: "action" | "workspace" | "space" | "terminal";
  section: CommandPaletteSection;
  title: string;
  description?: string;
  keywords?: string[];
  icon: CommandPaletteIcon;
  shortcut?: string;
  disabled?: boolean;
  onSelect: () => void | Promise<void>;
}

interface CommandPaletteProps {
  open: boolean;
  items: CommandPaletteItem[];
  onOpenChange: (open: boolean) => void;
}

const scopeOptions: Array<{ id: CommandPaletteScope; label: string; Icon: LucideIcon }> = [
  { id: "all", label: "All", Icon: List },
  { id: "actions", label: "Actions", Icon: Zap },
  { id: "locations", label: "Locations", Icon: MapPin },
];

const sectionOrder: CommandPaletteSection[] = [
  "suggested",
  "actions",
  "workspaces",
  "spaces",
  "terminals",
];

const sectionLabels: Record<CommandPaletteSection, string> = {
  suggested: "Suggested",
  actions: "Actions",
  workspaces: "Workspaces",
  spaces: "Spaces",
  terminals: "Terminals",
};

const paletteIcons: Record<CommandPaletteIcon, LucideIcon> = {
  command: Command,
  file: FileText,
  folder: Folder,
  workspace: FolderOpen,
  space: LayoutGrid,
  terminal: TerminalSquare,
  settings: Settings,
  new: Plus,
  "split-right": SplitSquareHorizontal,
  "split-down": SplitSquareVertical,
  sidebar: PanelLeft,
  browser: PanelRight,
};

const sectionLimit = 4;

type PaletteRow =
  | { kind: "item"; item: CommandPaletteItem }
  | { kind: "more"; section: CommandPaletteSection; hiddenCount: number };

function rowKey(row: PaletteRow): string {
  return row.kind === "item" ? row.item.id : `more:${row.section}`;
}

function resolveScope(rawQuery: string): {
  query: string;
  scope: CommandPaletteScope;
  explicit: boolean;
} {
  const trimmed = rawQuery.trimStart();
  const prefix = trimmed[0];
  if (prefix === ">") {
    return { query: trimmed.slice(1).trimStart(), scope: "actions", explicit: true };
  }
  if (prefix === "#") {
    return { query: trimmed.slice(1).trimStart(), scope: "locations", explicit: true };
  }
  return { query: rawQuery.trim(), scope: "all", explicit: false };
}

function matchesQuery(item: CommandPaletteItem, query: string): boolean {
  const words = query.toLocaleLowerCase().split(/\s+/u).filter(Boolean);
  if (words.length === 0) return true;
  const text = [item.title, item.description ?? "", ...(item.keywords ?? [])]
    .join(" ")
    .toLocaleLowerCase();
  return words.every((word) => text.includes(word));
}

function scopeIncludes(scope: CommandPaletteScope, item: CommandPaletteItem): boolean {
  if (scope === "all") return true;
  if (scope === "actions") return item.kind === "action";
  return item.kind === "workspace" || item.kind === "space" || item.kind === "terminal";
}

export function CommandPalette({ open, items, onOpenChange }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [manualScope, setManualScope] = useState<CommandPaletteScope>("all");
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<CommandPaletteSection>>(
    () => new Set(),
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const listId = `command-palette-list-${useId()}`;
  const resolvedQuery = useMemo(() => resolveScope(query), [query]);
  const activeScope = resolvedQuery.explicit ? resolvedQuery.scope : manualScope;
  const searchQuery = resolvedQuery.query;
  const hasSearchQuery = searchQuery.length > 0;

  useEffect(() => {
    if (!open) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      cancelAnimationFrame(frame);
      previousFocus?.focus();
    };
  }, [open]);

  const filteredItems = useMemo(
    () =>
      items.filter((item) => scopeIncludes(activeScope, item) && matchesQuery(item, searchQuery)),
    [activeScope, items, searchQuery],
  );

  const itemsBySection = useMemo(
    () =>
      sectionOrder.map((section) => ({
        section,
        items: filteredItems.filter((item) => item.section === section),
      })),
    [filteredItems],
  );

  const rows = useMemo<PaletteRow[]>(
    () =>
      itemsBySection.flatMap(({ section, items: sectionItems }) => {
        const visibleItems = expandedSections.has(section)
          ? sectionItems
          : sectionItems.slice(0, hasSearchQuery ? 80 : sectionLimit);
        const itemRows: PaletteRow[] = visibleItems.map((item) => ({ kind: "item", item }));
        if (!hasSearchQuery && sectionItems.length > visibleItems.length) {
          itemRows.push({
            kind: "more",
            section,
            hiddenCount: sectionItems.length - visibleItems.length,
          });
        }
        return itemRows;
      }),
    [expandedSections, hasSearchQuery, itemsBySection],
  );

  const navigableRows = rows.filter((row) => row.kind !== "item" || !row.item.disabled);
  const activeRow = navigableRows.find((row) => rowKey(row) === activeItemId) ?? navigableRows[0];
  const activeRowKey = activeRow ? rowKey(activeRow) : null;
  const activeOptionId = activeRow ? `${listId}-option-${rows.indexOf(activeRow)}` : undefined;

  useEffect(() => {
    if (!navigableRows.some((row) => rowKey(row) === activeItemId)) {
      setActiveItemId(navigableRows[0] ? rowKey(navigableRows[0]) : null);
    }
  }, [activeItemId, navigableRows]);

  useEffect(() => {
    if (!activeOptionId) return;
    document.getElementById(activeOptionId)?.scrollIntoView?.({ block: "nearest" });
  }, [activeOptionId]);

  const closeDialog = () => {
    setQuery("");
    setManualScope("all");
    setActiveItemId(null);
    setExpandedSections(new Set());
    onOpenChange(false);
  };

  const selectItem = (item: CommandPaletteItem | undefined) => {
    if (!item || item.disabled) return;
    closeDialog();
    void Promise.resolve(item.onSelect()).catch((error: unknown) => {
      console.error("Command palette action failed.", error);
    });
  };

  const setScope = (scope: CommandPaletteScope) => {
    setManualScope(scope);
    if (resolvedQuery.explicit) setQuery(searchQuery);
    inputRef.current?.focus();
  };

  const expandSection = (section: CommandPaletteSection) => {
    setExpandedSections((current) => new Set(current).add(section));
    const sectionItems = itemsBySection.find((entry) => entry.section === section)?.items ?? [];
    const firstHidden = sectionItems.slice(sectionLimit).find((item) => !item.disabled);
    if (firstHidden) setActiveItemId(firstHidden.id);
  };

  const cycleScope = (offset: number) => {
    const currentIndex = scopeOptions.findIndex((option) => option.id === activeScope);
    const next = scopeOptions[(currentIndex + offset + scopeOptions.length) % scopeOptions.length];
    if (next) setScope(next.id);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeDialog();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (navigableRows.length === 0) return;
      event.preventDefault();
      const offset = event.key === "ArrowDown" ? 1 : -1;
      const selectedIndex = navigableRows.findIndex((row) => rowKey(row) === activeRowKey);
      const nextIndex =
        selectedIndex < 0
          ? 0
          : (selectedIndex + offset + navigableRows.length) % navigableRows.length;
      const nextRow = navigableRows[nextIndex];
      setActiveItemId(nextRow ? rowKey(nextRow) : null);
      inputRef.current?.focus();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (activeRow?.kind === "more") {
        expandSection(activeRow.section);
        return;
      }
      selectItem(activeRow?.item);
      return;
    }
    if (event.key === "Tab" && document.activeElement === inputRef.current) {
      event.preventDefault();
      cycleScope(event.shiftKey ? -1 : 1);
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = [
      ...(dialogRef.current?.querySelectorAll<HTMLElement>(
        "input:not([disabled]), button:not([disabled])",
      ) ?? []),
    ].filter((element) => element.tabIndex >= 0);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/55 px-3 pt-3 sm:px-5 sm:pt-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeDialog();
      }}
    >
      <div
        ref={dialogRef}
        aria-label="Command palette"
        aria-modal="true"
        className="flex max-h-[calc(100dvh-1.5rem)] w-[min(40rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border border-popover-border bg-popover text-foreground shadow-2xl sm:max-h-[calc(100dvh-2rem)]"
        onKeyDown={handleKeyDown}
        role="dialog"
      >
        <div className="shrink-0 border-b border-border p-2">
          <div className="flex h-10 items-center gap-2 rounded-lg border border-input-border bg-input px-3 focus-within:border-input-border-focused">
            <Search aria-hidden="true" className="size-4 shrink-0 text-foreground-subtle" />
            <input
              ref={inputRef}
              aria-activedescendant={activeOptionId}
              aria-autocomplete="list"
              aria-controls={listId}
              aria-expanded="true"
              aria-label="Search actions, workspaces, Spaces, or terminals"
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent text-ui-base outline-none placeholder:text-foreground-subtlest"
              placeholder="Search actions, workspaces, Spaces, or terminals"
              role="combobox"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setExpandedSections(new Set());
              }}
            />
            {query ? (
              <button
                aria-label="Clear search"
                className="grid size-6 shrink-0 place-items-center rounded text-foreground-subtle hover:bg-hover hover:text-foreground"
                onClick={() => {
                  setQuery("");
                  inputRef.current?.focus();
                }}
                type="button"
              >
                <X aria-hidden="true" className="size-3.5" />
              </button>
            ) : null}
          </div>
          <div aria-label="Search scope" className="mt-2 flex gap-1 overflow-x-auto" role="tablist">
            {scopeOptions.map(({ id, label, Icon }) => (
              <button
                key={id}
                aria-controls={listId}
                aria-selected={activeScope === id}
                className={`inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-ui-sm font-medium transition-colors ${
                  activeScope === id
                    ? "border-border bg-selected text-foreground"
                    : "border-transparent text-foreground-subtle hover:bg-hover hover:text-foreground"
                }`}
                onClick={() => setScope(id)}
                role="tab"
                type="button"
              >
                <Icon aria-hidden="true" className="size-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>

        <div
          id={listId}
          aria-label="Command palette results"
          className="min-h-24 flex-1 overflow-y-auto p-2"
          role="listbox"
        >
          {itemsBySection.map(({ section, items: sectionItems }) => {
            if (sectionItems.length === 0) return null;
            const sectionRows = rows.filter((row) =>
              row.kind === "item" ? row.item.section === section : row.section === section,
            );
            const firstRow = sectionRows[0];
            const firstRowIndex = firstRow ? rows.indexOf(firstRow) : 0;
            return (
              <div
                aria-label={sectionLabels[section]}
                className="mb-2 last:mb-0"
                key={section}
                role="group"
              >
                <h2 className="px-2.5 pb-1 pt-2 text-ui-sm font-medium text-foreground-subtle">
                  {sectionLabels[section]}
                </h2>
                {sectionRows.map((row, rowIndex) => {
                  const optionIndex = firstRowIndex + rowIndex;
                  const selected = activeRowKey === rowKey(row);
                  if (row.kind === "more") {
                    return (
                      <button
                        key={`more:${row.section}`}
                        id={`${listId}-option-${optionIndex}`}
                        aria-selected={selected}
                        className={`w-full rounded-lg px-2.5 py-2 text-left text-ui-sm transition-colors ${
                          selected
                            ? "bg-hover text-foreground"
                            : "text-foreground-subtle hover:bg-hover hover:text-foreground"
                        }`}
                        data-palette-active={selected || undefined}
                        onClick={() => expandSection(row.section)}
                        onMouseMove={() => setActiveItemId(rowKey(row))}
                        role="option"
                        tabIndex={-1}
                        type="button"
                      >
                        Show {row.hiddenCount} more
                      </button>
                    );
                  }
                  const item = row.item;
                  const Icon = paletteIcons[item.icon];
                  return (
                    <button
                      key={item.id}
                      id={`${listId}-option-${optionIndex}`}
                      aria-disabled={item.disabled || undefined}
                      aria-selected={selected}
                      className={`flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left transition-colors ${
                        selected ? "bg-hover text-foreground" : "text-foreground hover:bg-hover/70"
                      } ${item.disabled ? "cursor-not-allowed opacity-50" : ""}`}
                      data-palette-active={selected || undefined}
                      onClick={() => selectItem(item)}
                      onMouseMove={() => {
                        if (!item.disabled) setActiveItemId(item.id);
                      }}
                      role="option"
                      tabIndex={-1}
                      type="button"
                    >
                      <Icon aria-hidden="true" className="size-4 shrink-0 text-foreground-subtle" />
                      <span className="min-w-0 flex-1 truncate text-ui-base">{item.title}</span>
                      {item.description ? (
                        <span className="max-w-[45%] truncate text-ui-sm text-foreground-subtle">
                          {item.description}
                        </span>
                      ) : null}
                      {item.shortcut ? (
                        <kbd className="inline-flex h-5 shrink-0 items-center rounded bg-background px-1.5 text-ui-sm text-foreground-subtle">
                          {item.shortcut}
                        </kbd>
                      ) : null}
                    </button>
                  );
                })}
                {hasSearchQuery && sectionItems.length > sectionRows.length ? (
                  <p className="px-2.5 py-2 text-ui-sm text-foreground-subtle">
                    Showing the first 80 matches. Add more search terms to narrow the results.
                  </p>
                ) : null}
              </div>
            );
          })}
          {filteredItems.length === 0 ? (
            <div className="grid min-h-28 place-items-center px-4 text-center text-ui-base text-foreground-subtle">
              No matching results.
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-3 border-t border-border px-3 py-2 text-ui-sm text-foreground-subtle">
          <span>
            <kbd className="rounded bg-background px-1">↑</kbd>{" "}
            <kbd className="rounded bg-background px-1">↓</kbd> navigate
          </span>
          <span>
            <kbd className="rounded bg-background px-1">Tab</kbd> scope
          </span>
          <span>
            <kbd className="rounded bg-background px-1">Enter</kbd> open
          </span>
          <span>
            <kbd className="rounded bg-background px-1">Esc</kbd> close
          </span>
          {activeScope === "all" && !hasSearchQuery ? (
            <span className="ml-auto hidden sm:inline">Type to search every location</span>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
