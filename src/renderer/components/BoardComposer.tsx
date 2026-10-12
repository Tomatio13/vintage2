import { useEffect, useRef } from "react";

export function BoardComposer({
  title,
  disabled,
  saving,
  onChange,
  onSave,
  onClose,
}: {
  title: string;
  disabled: boolean;
  saving: boolean;
  onChange: (title: string) => void;
  onSave: () => Promise<void>;
  onClose: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!saving) input.current?.focus();
  }, [saving]);
  return (
    <form
      aria-label="New card in column"
      className="rounded-lg border border-brand bg-panel p-2"
      onSubmit={(event) => {
        event.preventDefault();
        void onSave();
      }}
    >
      <input
        ref={input}
        aria-label="New card title"
        maxLength={200}
        disabled={saving}
        value={title}
        onChange={(event) => onChange(event.target.value)}
        placeholder="What needs doing?"
        className="w-full rounded-md bg-background px-2 py-2 text-ui-sm outline-none focus:ring-1 focus:ring-brand"
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || event.keyCode === 229) return;
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          }
          if (event.key === "Enter") {
            event.preventDefault();
            if (!event.shiftKey) void onSave();
          }
        }}
      />
      <div className="mt-2 flex items-center gap-2 text-ui-xs">
        <span className="flex-1 text-foreground-subtle">Enter to add · Esc to close</span>
        <button
          type="button"
          disabled={saving}
          onClick={onClose}
          className="rounded px-1 hover:bg-hover"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={disabled || !title.trim()}
          className="rounded bg-primary px-2 py-1 text-primary-foreground disabled:opacity-40"
        >
          Add
        </button>
      </div>
    </form>
  );
}
