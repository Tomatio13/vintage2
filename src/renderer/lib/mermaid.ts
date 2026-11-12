let renderer: Promise<typeof import("mermaid")> | undefined;
let pending: Promise<unknown> = Promise.resolve();
let sequence = 0;

// Mermaid configuration is global: keep initialization and rendering in one queue.
export function renderMermaid(source: string, dark: boolean): Promise<string> {
  const result = pending.then(async () => {
    const { default: mermaid } = await (renderer ??= import("mermaid"));
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      suppressErrorRendering: true,
      theme: dark ? "dark" : "default",
    });
    const container = document.createElement("div");
    container.style.position = "absolute";
    container.style.left = "-100000px";
    document.body.append(container);
    try {
      const { svg } = await mermaid.render(`vintage-mermaid-${++sequence}`, source, container);
      return svg;
    } finally {
      container.remove();
    }
  });
  // A bad diagram must not prevent subsequent diagrams from rendering.
  pending = result.catch(() => {});
  return result;
}
