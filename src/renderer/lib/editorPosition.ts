export function lineStarts(content: string): number[] {
  const starts = [0];
  for (let index = 0; index < content.length; index++) {
    if (content[index] === "\n") starts.push(index + 1);
  }
  return starts;
}

export function cursorPosition(content: string, offset: number) {
  const end = Math.max(0, Math.min(offset, content.length));
  const starts = lineStarts(content);
  let low = 0;
  let high = starts.length;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (starts[middle]! <= end) low = middle;
    else high = middle;
  }
  return { line: low + 1, column: end - starts[low]! + 1 };
}

/** Locate wrapped source text in the mirror, falling back to plain textarea geometry. */
export function scrollEditorToOffset(editor: HTMLTextAreaElement, content: string, offset: number) {
  const { line, column } = cursorPosition(content, offset);
  const mirrorLine = editor.parentElement?.querySelector(`[data-editor-line="${line}"]`);
  if (mirrorLine) {
    const walker = document.createTreeWalker(mirrorLine, NodeFilter.SHOW_TEXT);
    let remaining = column - 1;
    let node;
    while ((node = walker.nextNode())) {
      if (remaining <= (node.textContent?.length ?? 0)) {
        const range = document.createRange();
        range.setStart(node, remaining);
        range.collapse(true);
        const rect = range.getBoundingClientRect();
        const editorRect = editor.getBoundingClientRect();
        editor.scrollTop = Math.max(
          0,
          editor.scrollTop + rect.top - editorRect.top - editor.clientHeight / 2,
        );
        return;
      }
      remaining -= node.textContent?.length ?? 0;
    }
  }
  const lineHeight = parseFloat(getComputedStyle(editor).lineHeight) || 20;
  editor.scrollTop = Math.max(0, (line - 1) * lineHeight - editor.clientHeight / 2);
}
