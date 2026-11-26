import type { TerminalMonitorMode } from "./desktop.js";

export type AcpPermissionPolicy = "ask" | "auto_edit" | "auto_all";

export interface AcpModelOption {
  id: string;
  name: string;
  description?: string;
}

export interface AcpReasoningOption {
  id: string;
  name: string;
}

export interface AcpAgentProfile {
  id: string;
  name: string;
  badge: string;
  builtin: boolean;
  executable: string;
  defaultCandidates: string[];
  args: string[];
  permissionPolicy: AcpPermissionPolicy;
  defaultModel: string;
  defaultReasoning: string;
  models: AcpModelOption[];
  reasoningLevels: AcpReasoningOption[];
}

export interface AcpSettings {
  defaultProfileId: string;
  profiles: AcpAgentProfile[];
}

export interface AcpProbeResult {
  ok: boolean;
  resolvedPath: string | null;
  protocolVersion?: number;
  agentInfo?: { name: string; version: string };
  message: string;
}

export interface AcpForkSource {
  sessionId: string;
  messageId: string;
}

export interface AcpCreateOptions {
  forkFrom?: AcpForkSource;
  workspaceId: string;
  paneId: string;
  profileId?: string;
  modelId?: string;
  reasoningId?: string;
  permissionPolicy?: AcpPermissionPolicy;
  tabTitle?: string;
  paneTitle?: string;
  resumeSessionId?: string;
  resumeSessionKey?: string;
}

export interface AcpPromptImage {
  id: string;
  name: string;
  mimeType: string;
  dataBase64: string;
}

export interface AcpModeOption {
  id: string;
  name: string;
  description?: string;
}

export interface AcpUsageInfo {
  used: number;
  size: number;
  costAmount?: number;
  costCurrency?: string;
}

export interface AcpToolCallLocation {
  path: string;
  line?: number;
}

export type AcpToolCallContent =
  | { type: "text"; text: string }
  | { type: "diff"; path: string; oldText?: string | null; newText: string }
  | {
      type: "terminal";
      terminalId: string;
      command?: string;
      output?: string;
      exitCode?: number | null;
    };

export interface AcpToolCallItem {
  toolCallId: string;
  title: string;
  kind:
    | "read"
    | "edit"
    | "delete"
    | "move"
    | "search"
    | "execute"
    | "think"
    | "fetch"
    | "switch_mode"
    | "other";
  status: "pending" | "in_progress" | "completed" | "failed";
  locations: AcpToolCallLocation[];
  content: AcpToolCallContent[];
}

export interface AcpPermissionOption {
  optionId: string;
  name: string;
  kind: "allow_once" | "allow_always" | "reject_once" | "reject_always";
}

export interface AcpPermissionRequest {
  requestId: string;
  sessionId: string;
  toolCall: AcpToolCallItem;
  options: AcpPermissionOption[];
}

export interface AcpPlanEntry {
  content: string;
  priority: "high" | "medium" | "low";
  status: "pending" | "in_progress" | "completed";
}

export interface AcpSlashCommand {
  name: string;
  description: string;
  inputHint?: string;
}

export interface AcpSkillItem {
  name: string;
  description: string;
  scope: "project" | "personal" | "app";
  source: string;
}

export interface AcpConversationMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  thought: string;
  toolCalls: AcpToolCallItem[];
  images?: AcpPromptImage[];
  createdAt: number;
  streaming: boolean;
  profileId?: string;
  profileName?: string;
  profileBadge?: string;
  modelId?: string;
  modelName?: string;
}

export interface AcpSessionSnapshot {
  id: string;
  acpSessionId: string | null;
  paneId: string;
  workspaceId: string;
  cwd: string;
  profileId: string;
  profileName: string;
  profileBadge: string;
  agentCommand: string;
  modelId: string;
  reasoningId: string;
  modeId?: string;
  permissionPolicy: AcpPermissionPolicy;
  availableModels: AcpModelOption[];
  availableReasoning: AcpReasoningOption[];
  availableModes?: AcpModeOption[];
  status: "starting" | "ready" | "running" | "waiting_permission" | "stopped" | "error";
  errorMessage?: string;
  monitorMode: TerminalMonitorMode;
  messages: AcpConversationMessage[];
  plan: AcpPlanEntry[];
  availableCommands?: AcpSlashCommand[];
  availableSkills?: AcpSkillItem[];
  workspaceFiles?: string[];
  turnStartedAt?: number | null;
  lastTurnDurationMs?: number | null;
  lastTurnCompleted?: boolean;
  usage?: AcpUsageInfo | null;
  pendingPermission: AcpPermissionRequest | null;
  reattached?: boolean;
}

export type AcpEvent =
  | { type: "session.snapshot"; sessionId: string; snapshot: AcpSessionSnapshot }
  | {
      type: "message.delta";
      sessionId: string;
      messageId: string;
      field: "text" | "thought";
      delta: string;
    }
  | { type: "tool.upsert"; sessionId: string; messageId: string; toolCall: AcpToolCallItem }
  | { type: "plan.update"; sessionId: string; entries: AcpPlanEntry[] }
  | { type: "permission.requested"; sessionId: string; request: AcpPermissionRequest }
  | { type: "permission.resolved"; sessionId: string; requestId: string }
  | { type: "session.error"; sessionId: string; message: string }
  | { type: "session.exit"; sessionId: string; exitCode: number | null };

export const DEFAULT_ACP_REASONING_LEVELS: readonly AcpReasoningOption[] = [
  { id: "low", name: "Low" },
  { id: "medium", name: "Medium" },
  { id: "high", name: "High" },
  { id: "xhigh", name: "Extra High" },
  { id: "max", name: "Max" },
  { id: "ultra", name: "Ultra" },
];

export const DEFAULT_ACP_PROFILES: readonly AcpAgentProfile[] = [
  {
    id: "codex",
    name: "Codex",
    badge: "CD",
    builtin: true,
    executable: "",
    defaultCandidates: ["codex-acp"],
    args: [],
    permissionPolicy: "ask",
    defaultModel: "gpt-6.2-sol",
    defaultReasoning: "medium",
    models: [
      {
        id: "gpt-6.2-sol",
        name: "GPT-6.2-Sol",
        description: "Efficient frontier reasoning & coding model",
      },
      {
        id: "gpt-6.2-astra",
        name: "GPT-6.2-Astra",
        description: "Deepest architecture & multi-step reasoning",
      },
      {
        id: "gpt-6.1-terra",
        name: "GPT-6.1 Terra",
        description: "High-throughput agentic coding",
      },
      {
        id: "gpt-6.1-sol",
        name: "GPT-6.1-Sol",
        description: "Balanced reasoning & repository workflows",
      },
      { id: "gpt-6-astra", name: "GPT-6-Astra", description: "Frontier deep reasoning" },
      { id: "gpt-6-luna", name: "GPT-6-Luna", description: "Fast interactive coding & chat" },
      { id: "gpt-6-sol", name: "GPT-6-Sol", description: "General agentic engineering" },
      {
        id: "gpt-daybreak-blue-latest",
        name: "Daybreak Blue",
        description: "Experimental frontier Blue reasoning",
      },
      {
        id: "gpt-daybreak-red-latest",
        name: "Daybreak Red",
        description: "Experimental frontier Red reasoning",
      },
      { id: "gpt-5.6", name: "GPT-5.6", description: "Flagship GPT-5.6 model" },
      { id: "gpt-5.6-sol", name: "GPT-5.6-Sol", description: "GPT-5.6 Sol coding variant" },
      { id: "gpt-5.6-terra", name: "GPT-5.6-Terra", description: "GPT-5.6 Terra variant" },
      { id: "gpt-5.6-luna", name: "GPT-5.6-Luna", description: "GPT-5.6 Luna variant" },
      { id: "gpt-5.5-pro", name: "GPT-5.5 Pro", description: "Extended compute GPT-5.5" },
      { id: "gpt-5.5", name: "GPT-5.5", description: "General purpose GPT-5.5" },
      { id: "gpt-5.4-pro", name: "GPT-5.4 Pro", description: "High-precision GPT-5.4" },
      { id: "gpt-5.4", name: "GPT-5.4", description: "Standard coding model" },
      { id: "gpt-5.4-mini", name: "GPT-5.4 Mini", description: "Fast & cost-efficient" },
      { id: "gpt-5.4-nano", name: "GPT-5.4 Nano", description: "Ultra-low latency tasks" },
      {
        id: "gpt-5.3-codex",
        name: "GPT-5.3 Codex",
        description: "Deep repository reasoning",
      },
      {
        id: "gpt-5.3-codex-spark",
        name: "GPT-5.3 Codex Spark",
        description: "Rapid code generation & edits",
      },
      { id: "gpt-5.2", name: "GPT-5.2", description: "GPT-5.2 general coding" },
      { id: "gpt-5.1-codex-max", name: "GPT-5.1 Codex Max", description: "Max-compute Codex" },
      { id: "gpt-5.1-codex-mini", name: "GPT-5.1 Codex Mini", description: "Lightweight Codex" },
      { id: "gpt-5.1", name: "GPT-5.1" },
      { id: "gpt-5-pro", name: "GPT-5 Pro" },
      { id: "gpt-5", name: "GPT-5" },
      { id: "gpt-5-mini", name: "GPT-5 Mini" },
      { id: "o3-pro", name: "o3-pro", description: "Maximum reasoning depth" },
      { id: "o3", name: "o3" },
      { id: "o3-mini", name: "o3-mini" },
      { id: "o1-pro", name: "o1-pro" },
      { id: "gpt-4.1", name: "GPT-4.1" },
      { id: "gpt-4.1-mini", name: "GPT-4.1 Mini" },
      { id: "gpt-4.1-nano", name: "GPT-4.1 Nano" },
      { id: "gpt-4o", name: "GPT-4o" },
      { id: "gpt-4o-mini", name: "GPT-4o Mini" },
    ],
    reasoningLevels: [...DEFAULT_ACP_REASONING_LEVELS],
  },
  {
    id: "claude",
    name: "Claude Code",
    badge: "CC",
    builtin: true,
    executable: "",
    defaultCandidates: ["claude-agent-acp", "claude-code-acp"],
    args: [],
    permissionPolicy: "ask",
    defaultModel: "claude-sonnet-5-5",
    defaultReasoning: "medium",
    models: [
      {
        id: "claude-fable-5-2",
        name: "Claude Fable 5.2",
        description: "Latest frontier autonomous coding & synthesis",
      },
      {
        id: "claude-opus-5-5",
        name: "Claude Opus 5.5",
        description: "Deepest architecture, planning & code review",
      },
      {
        id: "claude-sonnet-5-5",
        name: "Claude Sonnet 5.5",
        description: "High-speed frontier agentic coding",
      },
      {
        id: "claude-haiku-5-5",
        name: "Claude Haiku 5.5",
        description: "Instant latency agentic execution",
      },
      {
        id: "claude-fable-5-1",
        name: "Claude Fable 5.1",
        description: "Frontier multi-file engineering",
      },
      { id: "claude-opus-5", name: "Claude Opus 5", description: "Flagship Opus 5 reasoning" },
      { id: "claude-sonnet-5", name: "Claude Sonnet 5", description: "Balanced Sonnet 5 coding" },
      { id: "claude-fable-5", name: "Claude Fable 5", description: "Fable 5 reasoning" },
      { id: "claude-opus-4-8", name: "Claude Opus 4.8", description: "Advanced Opus 4.8" },
      { id: "claude-opus-4-7", name: "Claude Opus 4.7", description: "Opus 4.7 coding & review" },
      { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", description: "Sonnet 4.6 coding" },
      { id: "claude-opus-4-6", name: "Claude Opus 4.6", description: "Opus 4.6 deep analysis" },
      {
        id: "claude-opus-4-5",
        name: "Claude Opus 4.5",
        description: "Architecture & complex debugging",
      },
      {
        id: "claude-sonnet-4-5",
        name: "Claude Sonnet 4.5",
        description: "Balanced speed & coding",
      },
      { id: "claude-haiku-4-5", name: "Claude Haiku 4.5", description: "Ultra-fast responses" },
    ],
    reasoningLevels: [...DEFAULT_ACP_REASONING_LEVELS],
  },
  {
    id: "antigravity",
    name: "Antigravity / Gemini",
    badge: "AG",
    builtin: true,
    executable: "",
    defaultCandidates: ["agy", "gemini"],
    args: ["acp"],
    permissionPolicy: "ask",
    defaultModel: "gemini-4-neon",
    defaultReasoning: "high",
    models: [
      {
        id: "gemini-4-neon",
        name: "Gemini 4 Neon",
        description: "Latest frontier multimodal & agentic coding",
      },
      {
        id: "gemini-4-hydrogen",
        name: "Gemini 4 Hydrogen",
        description: "High-speed frontier reasoning & tool use",
      },
      {
        id: "gemini-4-carbon",
        name: "Gemini 4 Carbon",
        description: "Deep architectural reasoning & large context",
      },
      {
        id: "gemini-4-argon",
        name: "Gemini 4 Argon",
        description: "Balanced frontier coding & analysis",
      },
      {
        id: "gemini-3.8-flash",
        name: "Gemini 3.8 Flash",
        description: "Low-latency high-intelligence Flash",
      },
      { id: "gemini-3.7-flash", name: "Gemini 3.7 Flash", description: "Fast agentic workflows" },
      {
        id: "gemini-3.6-flash",
        name: "Gemini 3.6 Flash",
        description: "Efficient coding & tool use",
      },
      { id: "gemini-3.5-flash", name: "Gemini 3.5 Flash", description: "General Flash reasoning" },
      {
        id: "gemini-3.5-flash-lite",
        name: "Gemini 3.5 Flash Lite",
        description: "Ultra-fast lightweight tasks",
      },
      {
        id: "gemini-3.1-ultra",
        name: "Gemini 3.1 Ultra",
        description: "Maximum compute Ultra reasoning",
      },
      {
        id: "gemini-3.1-pro-preview",
        name: "Gemini 3.1 Pro",
        description: "Pro-tier repository reasoning",
      },
      {
        id: "gemini-3.1-flash-lite",
        name: "Gemini 3.1 Flash Lite",
        description: "High-throughput Flash Lite",
      },
      { id: "gemini-3-flash", name: "Gemini 3 Flash", description: "Fast multimodal coding" },
      {
        id: "gemini-2.5-pro",
        name: "Gemini 2.5 Pro",
        description: "Complex reasoning & large context",
      },
      {
        id: "gemini-2.5-flash",
        name: "Gemini 2.5 Flash",
        description: "Low-latency agentic tasks",
      },
      { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite" },
      { id: "gemma-4-31b-it", name: "Gemma 4 31B IT", description: "Open-weights 31B coding" },
      { id: "gemma-4-26b-a4b-it", name: "Gemma 4 26B A4B IT", description: "MoE fast reasoning" },
      {
        id: "deep-research-max-preview-04-2026",
        name: "Deep Research Max",
        description: "Autonomous deep research & synthesis",
      },
      {
        id: "deep-research-preview-04-2026",
        name: "Deep Research",
        description: "Multi-step codebase & web investigation",
      },
      { id: "claude-opus-5-5", name: "Claude Opus 5.5 (AGY)" },
      { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5 (AGY)" },
      { id: "claude-opus-4-8", name: "Claude Opus 4.8 (AGY)" },
      { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6 (AGY)" },
      { id: "claude-opus-4-6", name: "Claude Opus 4.6 (AGY)" },
      { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5 (AGY)" },
      { id: "claude-haiku-4-5", name: "Claude Haiku 4.5 (AGY)" },
    ],
    reasoningLevels: [...DEFAULT_ACP_REASONING_LEVELS],
  },
  {
    id: "opencode",
    name: "OpenCode",
    badge: "OC",
    builtin: true,
    executable: "",
    defaultCandidates: ["opencode2", "opencode"],
    args: ["acp"],
    permissionPolicy: "ask",
    defaultModel: "opencode-go/glm-5.3",
    defaultReasoning: "medium",
    models: [
      { id: "opencode-go/glm-5.3", name: "GLM-5.3", description: "OpenCode Go · Flagship GLM" },
      {
        id: "opencode-go/glm-5.3-flash",
        name: "GLM-5.3 Flash",
        description: "OpenCode Go · Fast GLM",
      },
      {
        id: "opencode-go/deepseek-v4.1-flash",
        name: "DeepSeek V4.1 Flash",
        description: "OpenCode Go · Reasoning & coding",
      },
      {
        id: "opencode-go/deepseek-v4-pro",
        name: "DeepSeek V4 Pro",
        description: "OpenCode Go · Flagship DeepSeek",
      },
      { id: "opencode-go/kimi-k3.1-pro", name: "Kimi K3.1 Pro", description: "OpenCode Go" },
      { id: "opencode-go/kimi-k3", name: "Kimi K3", description: "OpenCode Go" },
      { id: "opencode-go/qwen4-max", name: "Qwen4 Max", description: "OpenCode Go" },
      { id: "opencode-go/minimax-m3", name: "MiniMax M3", description: "OpenCode Go" },
    ],
    reasoningLevels: [...DEFAULT_ACP_REASONING_LEVELS],
  },
  {
    id: "muse",
    name: "Muse Code",
    badge: "MC",
    builtin: true,
    executable: "",
    defaultCandidates: ["muse-code-acp"],
    args: [],
    permissionPolicy: "ask",
    defaultModel: "",
    defaultReasoning: "",
    models: [],
    reasoningLevels: [],
  },
  {
    id: "zai",
    name: "Z.ai",
    badge: "ZA",
    builtin: true,
    executable: "",
    defaultCandidates: ["opencode2", "opencode"],
    args: ["acp"],
    permissionPolicy: "ask",
    defaultModel: "zai-coding-plan/glm-5.3",
    defaultReasoning: "medium",
    models: [
      {
        id: "zai-coding-plan/glm-5.3",
        name: "GLM-5.3",
        description: "Z.ai Coding Plan · Flagship GLM",
      },
      {
        id: "zai-coding-plan/glm-5.3-flash",
        name: "GLM-5.3 Flash",
        description: "Z.ai Coding Plan · Fast GLM",
      },
      {
        id: "zai-coding-plan/glm-5.3-highspeed",
        name: "GLM-5.3 Highspeed",
        description: "Z.ai Coding Plan · High-throughput GLM",
      },
      {
        id: "zai-coding-plan/glm-5.2-highspeed",
        name: "GLM-5.2 Highspeed",
        description: "Z.ai Coding Plan",
      },
      { id: "zai-coding-plan/glm-5.2", name: "GLM-5.2", description: "Z.ai Coding Plan" },
      { id: "zai-coding-plan/glm-5-turbo", name: "GLM-5 Turbo", description: "Z.ai Coding Plan" },
      { id: "zai-coding-plan/glm-4.7", name: "GLM-4.7", description: "Z.ai Coding Plan" },
    ],
    reasoningLevels: [...DEFAULT_ACP_REASONING_LEVELS],
  },
];

export const DEFAULT_ACP_SETTINGS: AcpSettings = {
  defaultProfileId: "claude",
  profiles: DEFAULT_ACP_PROFILES.map((profile) => ({
    ...profile,
    defaultCandidates: [...profile.defaultCandidates],
    args: [...profile.args],
    models: profile.models.map((model) => ({ ...model })),
    reasoningLevels: profile.reasoningLevels.map((level) => ({ ...level })),
  })),
};
