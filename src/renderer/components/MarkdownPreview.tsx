import {
  memo,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ComponentProps,
  type MouseEvent as ReactMouseEvent,
} from "react";
import ReactMarkdown from "react-markdown";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import { classifyMarkdownLink, resolveMarkdownRelativePath } from "../lib/markdownLinks.js";
import { useUiStore } from "../store/uiStore.js";

function WorkspaceMarkdownImage({
  src,
  alt,
  title,
  workspaceId,
  markdownPath,
}: {
  src: string | undefined;
  alt: string | undefined;
  title: string | undefined;
  workspaceId: string;
  markdownPath: string;
}) {
  const [image, setImage] = useState<
    { status: "loading" } | { status: "ready"; dataUrl: string } | { status: "error" }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const imagePath = src ? resolveMarkdownRelativePath(markdownPath, src) : null;
    const readImage = window.desktop?.readWorkspaceImage;
    setImage({ status: "loading" });

    if (!imagePath || !readImage) {
      setImage({ status: "error" });
      return () => {
        cancelled = true;
      };
    }

    void readImage(workspaceId, imagePath)
      .then((dataUrl) => {
        if (!cancelled) setImage({ status: "ready", dataUrl });
      })
      .catch(() => {
        if (!cancelled) setImage({ status: "error" });
      });

    return () => {
      cancelled = true;
    };
  }, [markdownPath, src, workspaceId]);

  if (image.status === "ready") {
    return (
      <img
        alt={alt ?? ""}
        className="my-4 h-auto max-w-full rounded-md"
        decoding="async"
        src={image.dataUrl}
        title={title}
      />
    );
  }

  const label = alt || "Markdown image";
  return (
    <span className="my-3 block text-ui-sm text-foreground-subtle">
      {image.status === "loading" ? `Loading ${label}…` : `Image unavailable: ${label}`}
    </span>
  );
}

function scrollMarkdownAnchorIntoView(container: Element | null, anchor: string): void {
  const escaped = (() => {
    try {
      return CSS.escape(anchor);
    } catch {
      return "";
    }
  })();
  if (!escaped) return;
  try {
    container?.querySelector(`#${escaped}`)?.scrollIntoView({ block: "start" });
  } catch {
    // Invalid selectors or missing scroll containers are safe to ignore.
  }
}

function handleMarkdownLinkClick(
  event: ReactMouseEvent<HTMLAnchorElement>,
  href: string,
  markdownPath: string,
  onOpenFile: (path: string) => void,
): void {
  event.preventDefault();
  const target = classifyMarkdownLink(href, markdownPath);
  switch (target.kind) {
    case "file":
      onOpenFile(target.path);
      return;
    case "external":
      useUiStore.getState().openInBrowserTab(target.url, {
        newTab: event.ctrlKey || event.metaKey,
      });
      return;
    case "external-system":
      void window.desktop?.openExternal(target.url).catch(() => {});
      return;
    case "anchor":
      scrollMarkdownAnchorIntoView(event.currentTarget.closest("article"), target.anchor);
      return;
    default:
  }
}

interface MarkdownContextValue {
  path: string;
  workspaceId: string;
  onOpenFile(path: string): void;
}

const MarkdownContext = createContext<MarkdownContextValue | null>(null);

function MarkdownAnchor({ children, href }: ComponentProps<"a">) {
  const context = useContext(MarkdownContext);
  return (
    <a
      className="text-brand underline underline-offset-2"
      href={href}
      onClick={(event) => {
        event.preventDefault();
        if (href && context) handleMarkdownLinkClick(event, href, context.path, context.onOpenFile);
      }}
    >
      {children}
    </a>
  );
}

function MarkdownImage(props: ComponentProps<"img">) {
  const context = useContext(MarkdownContext);
  return (
    <WorkspaceMarkdownImage
      alt={props.alt}
      markdownPath={context?.path ?? ""}
      src={props.src}
      title={props.title}
      workspaceId={context?.workspaceId ?? ""}
    />
  );
}

// Defined at module level: react-markdown maps these onto rendered elements, so
// unstable function identities here would replace the whole Markdown DOM on
// every render and swallow real mouse clicks (the click event is lost when the
// mousedown target is swapped between mousedown and mouseup).
const markdownComponents = {
  a: MarkdownAnchor,
  img: MarkdownImage,
  blockquote: ({ children }: ComponentProps<"blockquote">) => (
    <blockquote className="my-4 border-l-2 border-brand pl-4 text-foreground-subtle">
      {children}
    </blockquote>
  ),
  code: ({ children, className }: ComponentProps<"code">) => (
    <code
      className={
        className
          ? "font-mono text-ui-sm"
          : "rounded bg-background px-1 py-0.5 font-mono text-ui-sm"
      }
    >
      {children}
    </code>
  ),
  h1: ({ children, id }: ComponentProps<"h1">) => (
    <h1 id={id} className="mb-4 mt-8 text-ui-xl font-semibold first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children, id }: ComponentProps<"h2">) => (
    <h2 id={id} className="mb-3 mt-7 text-ui-lg font-semibold first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children, id }: ComponentProps<"h3">) => (
    <h3 id={id} className="mb-3 mt-6 text-ui-base font-semibold first:mt-0">
      {children}
    </h3>
  ),
  h4: ({ children, id }: ComponentProps<"h4">) => (
    <h4 id={id} className="mb-2 mt-5 font-semibold first:mt-0">
      {children}
    </h4>
  ),
  h5: ({ children, id }: ComponentProps<"h5">) => (
    <h5 id={id} className="mb-2 mt-4 font-semibold first:mt-0">
      {children}
    </h5>
  ),
  h6: ({ children, id }: ComponentProps<"h6">) => (
    <h6 id={id} className="mb-2 mt-4 font-semibold first:mt-0">
      {children}
    </h6>
  ),
  hr: () => <hr className="my-6 border-border" />,
  input: (props: ComponentProps<"input">) => (
    <input {...props} className="mr-2 accent-brand" readOnly />
  ),
  li: ({ children }: ComponentProps<"li">) => <li className="my-1">{children}</li>,
  ol: ({ children }: ComponentProps<"ol">) => (
    <ol className="my-3 list-decimal space-y-1 pl-6">{children}</ol>
  ),
  p: ({ children }: ComponentProps<"p">) => <p className="my-3">{children}</p>,
  pre: ({ children }: ComponentProps<"pre">) => (
    <pre className="my-4 overflow-x-auto rounded-lg bg-background p-3">{children}</pre>
  ),
  strong: ({ children }: ComponentProps<"strong">) => (
    <strong className="font-semibold">{children}</strong>
  ),
  table: ({ children }: ComponentProps<"table">) => (
    <div className="my-4 overflow-x-auto">
      <table className="w-full border-collapse text-left text-ui-sm">{children}</table>
    </div>
  ),
  td: ({ children }: ComponentProps<"td">) => (
    <td className="border border-border px-3 py-2 align-top">{children}</td>
  ),
  th: ({ children }: ComponentProps<"th">) => (
    <th className="border border-border bg-background px-3 py-2 text-left font-semibold">
      {children}
    </th>
  ),
  ul: ({ children }: ComponentProps<"ul">) => (
    <ul className="my-3 list-disc space-y-1 pl-6">{children}</ul>
  ),
};

const markdownRemarkPlugins = [remarkGfm];
const markdownRehypePlugins = [rehypeSlug];

export const MarkdownPreview = memo(function MarkdownPreview({
  content,
  workspaceId,
  path,
  onOpenFile,
}: {
  content: string;
  workspaceId: string;
  path: string;
  onOpenFile: (path: string) => void;
}) {
  const contextValue = useMemo(
    () => ({ path, workspaceId, onOpenFile }),
    [path, workspaceId, onOpenFile],
  );
  return (
    <article className="mx-auto max-w-3xl text-ui-base leading-relaxed">
      <MarkdownContext.Provider value={contextValue}>
        <ReactMarkdown
          skipHtml
          remarkPlugins={markdownRemarkPlugins}
          rehypePlugins={markdownRehypePlugins}
          components={markdownComponents}
        >
          {content}
        </ReactMarkdown>
      </MarkdownContext.Provider>
    </article>
  );
});
