export type FilePreviewKind =
  | "markdown"
  | "image"
  | "html"
  | "pdf"
  | "json"
  | "csv"
  | "code"
  | "audio"
  | "video"
  | "unsupported";

const markdownExtensions = new Set([".md", ".markdown", ".mdx"]);
const imageExtensions = new Set([
  ".avif",
  ".bmp",
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".png",
  ".svg",
  ".webp",
]);
const audioExtensions = new Set([".aac", ".flac", ".m4a", ".mp3", ".oga", ".ogg", ".opus", ".wav"]);
const videoExtensions = new Set([".m4v", ".mkv", ".mov", ".mp4", ".ogv", ".webm"]);
const codeExtensions = new Set([
  ".bash",
  ".bat",
  ".c",
  ".cc",
  ".cjs",
  ".cmd",
  ".conf",
  ".cpp",
  ".cs",
  ".css",
  ".fish",
  ".go",
  ".graphql",
  ".gql",
  ".h",
  ".hpp",
  ".ini",
  ".java",
  ".js",
  ".jsonc",
  ".jsx",
  ".kt",
  ".kts",
  ".less",
  ".log",
  ".mjs",
  ".php",
  ".properties",
  ".py",
  ".rb",
  ".rs",
  ".scss",
  ".sh",
  ".sql",
  ".svelte",
  ".text",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".vue",
  ".xml",
  ".yaml",
  ".yml",
  ".zsh",
]);

const knownTextNames = new Set([
  ".editorconfig",
  ".env",
  ".gitignore",
  ".npmrc",
  ".prettierrc",
  "changelog",
  "containerfile",
  "dockerfile",
  "license",
  "makefile",
  "notice",
  "readme",
]);

export function getFilePreviewKind(path: string): FilePreviewKind {
  const name = path.split(/[\\/]/u).at(-1)?.toLowerCase() ?? path.toLowerCase();
  const extension = name.includes(".") ? `.${name.split(".").at(-1)}` : "";

  if (markdownExtensions.has(extension)) return "markdown";
  if (imageExtensions.has(extension)) return "image";
  if (extension === ".html" || extension === ".htm") return "html";
  if (extension === ".pdf") return "pdf";
  if (extension === ".json") return "json";
  if (extension === ".csv" || extension === ".tsv") return "csv";
  if (audioExtensions.has(extension)) return "audio";
  if (videoExtensions.has(extension)) return "video";
  if (codeExtensions.has(extension) || knownTextNames.has(name)) return "code";
  return "unsupported";
}

export function getFilePreviewLabel(kind: FilePreviewKind): string {
  switch (kind) {
    case "markdown":
      return "Markdown";
    case "image":
      return "Image";
    case "html":
      return "HTML";
    case "pdf":
      return "PDF";
    case "json":
      return "JSON";
    case "csv":
      return "Table";
    case "audio":
      return "Audio";
    case "video":
      return "Video";
    case "code":
      return "Text";
    case "unsupported":
      return "File";
  }
}
