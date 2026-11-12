import { useEffect, useState } from "react";
import { renderMermaid } from "../lib/mermaid.js";

type DiagramState =
  | { source: string; dark: boolean; svg: string }
  | { source: string; dark: boolean; error: true };

export function MermaidDiagram({ source }: { source: string }) {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const [state, setState] = useState<DiagramState | null>(null);
  useEffect(() => {
    const update = () => setDark(document.documentElement.classList.contains("dark"));
    window.addEventListener("vintage-theme-changed", update);
    update();
    return () => window.removeEventListener("vintage-theme-changed", update);
  }, []);
  useEffect(() => {
    let cancelled = false;
    void renderMermaid(source, dark).then(
      (svg) => {
        if (!cancelled) setState({ source, dark, svg });
      },
      () => {
        if (!cancelled) setState({ source, dark, error: true });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [source, dark]);
  const current = state?.source === source && state.dark === dark ? state : null;
  return (
    <div className="my-4 overflow-x-auto rounded-lg bg-background p-3">
      {!current ? (
        <p role="status" className="text-ui-sm text-foreground-subtle">
          Rendering diagram…
        </p>
      ) : "error" in current ? (
        <>
          <p role="alert" className="text-ui-sm text-destructive">
            Mermaid diagram could not be rendered. Check the source syntax.
          </p>
          <pre className="mt-2 overflow-x-auto font-mono text-ui-sm">
            <code>{source}</code>
          </pre>
        </>
      ) : (
        <div
          role="img"
          aria-label="Mermaid diagram"
          className="[&_svg]:h-auto [&_svg]:max-w-full"
          dangerouslySetInnerHTML={{ __html: current.svg }}
        />
      )}
    </div>
  );
}
