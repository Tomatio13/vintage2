function formatDuration(diffMs: number): string {
  const totalMinutes = Math.max(0, Math.floor(diffMs / 60_000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${Math.max(minutes, 1)}m`;
}

export function formatResetCountdown(
  resetAt: string | null | undefined,
  now: number = Date.now(),
): string {
  if (!resetAt) return "";
  const reset = Date.parse(resetAt);
  if (!Number.isFinite(reset)) return "";
  const diffMs = reset - now;
  if (diffMs <= 0) return "Reset pending";
  return `Resets in ${formatDuration(diffMs)}`;
}

export function formatRelative(
  timestamp: string | null | undefined,
  now: number = Date.now(),
): string {
  if (!timestamp) return "";
  const at = Date.parse(timestamp);
  if (!Number.isFinite(at)) return "";
  const diffMs = now - at;
  if (diffMs < 45_000) return "just now";
  return `${formatDuration(diffMs)} ago`;
}

function clockOf(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function formatResetTime(
  resetAt: string | null | undefined,
  now: number = Date.now(),
): string {
  if (!resetAt) return "";
  const reset = Date.parse(resetAt);
  if (!Number.isFinite(reset) || reset <= now) return "";
  const resetDate = new Date(reset);
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${resetDate.getFullYear()}/${pad(resetDate.getMonth() + 1)}/${pad(resetDate.getDate())} ${clockOf(resetDate)}`;
}
