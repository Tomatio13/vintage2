import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, GitBranch } from "lucide-react";
import type { WorkspaceGitReviewCommit } from "../../shared/desktop.js";

const colors = ["#729be8", "#d8aa48", "#4cba98", "#bb86db", "#df8673", "#62b6c9"];
const laneX = (lane: number) => 12 + lane * 14;

/** Keep parent lanes alive between rows, including branches absent from this page. */
export function layoutHistory(commits: WorkspaceGitReviewCommit[]) {
  let lanes: string[] = [];
  return commits.map((commit) => {
    if (!lanes.includes(commit.hash)) lanes.push(commit.hash);
    const before = [...lanes];
    const lane = lanes.indexOf(commit.hash);
    lanes.splice(lane, 1);
    for (const [index, parent] of commit.parents.entries()) {
      if (!lanes.includes(parent)) lanes.splice(Math.min(lane + index, lanes.length), 0, parent);
    }
    const after = [...lanes];
    const edges = before.flatMap((hash, from) => {
      const targets = hash === commit.hash ? commit.parents : [hash];
      return targets.map((target) => ({
        from,
        to: after.indexOf(target),
        color: colors[from % colors.length],
      }));
    });
    return { commit, lane, edges, before, width: laneX(Math.max(before.length, after.length)) + 6 };
  });
}

export function ReviewHistory({
  commits,
  currentBranch,
  message,
}: {
  commits: WorkspaceGitReviewCommit[];
  currentBranch: string | null;
  message?: string | null;
}) {
  const [expanded, setExpanded] = useState(true);
  const rows = useMemo(() => layoutHistory(commits), [commits]);
  const width = Math.max(28, ...rows.map((row) => row.width));
  return (
    <section
      aria-label="Commit history"
      className={`flex min-h-0 shrink-0 flex-col border-t border-border ${expanded ? "h-[35%] min-h-28" : ""}`}
    >
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        className="flex min-h-9 shrink-0 items-center gap-2 px-3 text-ui-xs text-foreground-subtle hover:bg-surface-hover"
      >
        {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        <span className="font-semibold tracking-wider">GRAPH</span>
        <span className="ml-auto flex min-w-0 items-center gap-1 truncate">
          <GitBranch className="size-3 shrink-0" />
          {currentBranch ?? "Detached HEAD"}
        </span>
        <span className="shrink-0 text-foreground-subtlest">{commits.length} shown</span>
      </button>
      {expanded && (
        <div className="min-h-0 flex-1 overflow-auto px-2 pb-2">
          {message || !commits.length ? (
            <p className="p-2 text-ui-xs text-foreground-subtle">{message ?? "No commits yet."}</p>
          ) : (
            <ol className="min-w-full w-max rounded-lg border border-border bg-background py-1">
              {rows.map(({ commit, lane, edges, before }) => (
                <li
                  key={commit.hash}
                  className="flex h-8 items-center pr-2 text-ui-xs hover:bg-surface-hover"
                  title={`${commit.subject}\n${commit.hash}\n${commit.author} · ${commit.date}`}
                >
                  <svg
                    aria-hidden="true"
                    width={width}
                    height={32}
                    className="shrink-0 overflow-visible"
                  >
                    {edges.map((edge, index) => (
                      <path
                        key={index}
                        d={`M ${laneX(edge.from)} 16 C ${laneX(edge.from)} 26, ${laneX(edge.to)} 22, ${laneX(edge.to)} 32`}
                        fill="none"
                        stroke={edge.color}
                        strokeWidth="1.5"
                      />
                    ))}
                    {before.map((hash, index) =>
                      hash !== commit.hash || commit !== commits[0] ? (
                        <path
                          key={hash}
                          d={`M ${laneX(index)} 0 V 16`}
                          stroke={colors[index % colors.length]}
                          strokeWidth="1.5"
                        />
                      ) : null,
                    )}
                    <circle
                      cx={laneX(lane)}
                      cy="16"
                      r="3.5"
                      fill="var(--color-background, #222)"
                      stroke={colors[lane % colors.length]}
                      strokeWidth="2"
                    />
                  </svg>
                  <span className="whitespace-nowrap text-foreground">{commit.subject}</span>
                  <span className="ml-2 flex items-center gap-1">
                    {commit.refs.map((ref) => (
                      <span
                        key={ref}
                        className="max-w-40 truncate rounded border border-border px-1.5 py-0.5 font-mono text-foreground-subtle"
                      >
                        {ref}
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}
