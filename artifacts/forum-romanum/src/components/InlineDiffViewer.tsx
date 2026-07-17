// Minimal inline unified diff renderer. No external dep.
// Fetches a raw `.diff` from a GitHub PR URL and renders hunks with
// add/remove line tints in the Forum Romanum palette.
import React, { useEffect, useState } from "react";
import { Icon } from "./UI";

type Line = { kind: "add" | "del" | "ctx" | "hunk" | "file"; text: string };

function parsePrUrl(url: string): { owner: string; repo: string; pr: string } | null {
  try {
    const u = new URL(url);
    if (u.hostname !== "github.com") return null;
    const m = u.pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
    if (!m) return null;
    return { owner: m[1], repo: m[2], pr: m[3] };
  } catch {
    return null;
  }
}

function parseDiff(raw: string): { file: string; lines: Line[] }[] {
  const files: { file: string; lines: Line[] }[] = [];
  let current: { file: string; lines: Line[] } | null = null;
  for (const ln of raw.split("\n")) {
    if (ln.startsWith("diff --git ")) {
      const m = ln.match(/ b\/(.+)$/);
      current = { file: m ? m[1] : ln.slice(11), lines: [] };
      files.push(current);
    } else if (!current) {
      continue;
    } else if (ln.startsWith("@@")) {
      current.lines.push({ kind: "hunk", text: ln });
    } else if (ln.startsWith("+++") || ln.startsWith("---") || ln.startsWith("index ") || ln.startsWith("new file") || ln.startsWith("deleted file")) {
      // skip noise
    } else if (ln.startsWith("+")) {
      current.lines.push({ kind: "add", text: ln.slice(1) });
    } else if (ln.startsWith("-")) {
      current.lines.push({ kind: "del", text: ln.slice(1) });
    } else {
      current.lines.push({ kind: "ctx", text: ln.startsWith(" ") ? ln.slice(1) : ln });
    }
  }
  return files;
}

const MAX_BYTES = 250_000;

export function InlineDiffViewer({ url }: { url: string }) {
  const parsed = parsePrUrl(url);
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "error"; msg: string }
    | { kind: "ok"; files: { file: string; lines: Line[] }[]; truncated: boolean; stats: { added: number; removed: number } }
  >({ kind: "idle" });

  useEffect(() => {
    if (!parsed) return;
    let cancelled = false;
    setState({ kind: "loading" });
    const u = `https://patch-diff.githubusercontent.com/raw/${parsed.owner}/${parsed.repo}/pull/${parsed.pr}.diff`;
    fetch(u)
      .then(async (r) => {
        if (!r.ok) throw new Error(`GitHub returned ${r.status}`);
        const txt = await r.text();
        const truncated = txt.length > MAX_BYTES;
        const slice = truncated ? txt.slice(0, MAX_BYTES) : txt;
        const files = parseDiff(slice);
        let added = 0, removed = 0;
        for (const f of files) for (const l of f.lines) {
          if (l.kind === "add") added++;
          else if (l.kind === "del") removed++;
        }
        if (!cancelled) setState({ kind: "ok", files, truncated, stats: { added, removed } });
      })
      .catch((e) => !cancelled && setState({ kind: "error", msg: e.message || "Failed to load diff" }));
    return () => { cancelled = true; };
  }, [url]);

  if (!parsed) {
    return (
      <div className="rounded-xl border border-[#E5E3DB] bg-[#FAF9F6] p-3 text-[11px] text-[#7A7A7A]">
        Diff preview only available for github.com pull requests.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[#E5E3DB] overflow-hidden">
      <div className="px-3 py-2 bg-[#FAF9F6] border-b border-[#E5E3DB] flex items-center gap-2">
        <Icon name="GitPullRequest" size={12} className="text-[#C5A059]" />
        <span className="text-[11px] font-bold tracking-tight truncate">
          {parsed.owner}/{parsed.repo} <span className="text-[#7A7A7A]">#{parsed.pr}</span>
        </span>
        <div className="flex-1" />
        {state.kind === "ok" && (
          <span className="text-[10px] font-bold tracking-widest uppercase flex items-center gap-2">
            <span className="text-[#10B981]">+{state.stats.added}</span>
            <span className="text-[#E64545]">-{state.stats.removed}</span>
          </span>
        )}
      </div>

      {state.kind === "loading" && (
        <div className="px-3 py-6 text-center text-[11px] font-bold uppercase tracking-widest text-[#7A7A7A]">
          Loading diff…
        </div>
      )}
      {state.kind === "error" && (
        <div className="px-3 py-4 text-[11px] text-[#E64545] font-medium">
          {state.msg}. Open on GitHub to review.
        </div>
      )}
      {state.kind === "ok" && state.files.length === 0 && (
        <div className="px-3 py-4 text-[11px] text-[#7A7A7A]">No diff content.</div>
      )}

      {state.kind === "ok" && (
        <div className="max-h-[55vh] overflow-y-auto bg-white">
          {state.files.map((f, i) => (
            <div key={i} className="border-b border-[#E5E3DB] last:border-b-0">
              <div className="px-3 py-1.5 bg-[#FAF9F6] border-b border-[#E5E3DB] text-[10px] font-black uppercase tracking-widest text-[#7A7A7A] truncate">
                {f.file}
              </div>
              <pre className="text-[11px] leading-[1.5] font-mono overflow-x-auto">
                {f.lines.map((l, j) => {
                  const bg =
                    l.kind === "add" ? "bg-[#10B981]/10" :
                    l.kind === "del" ? "bg-[#E64545]/10" :
                    l.kind === "hunk" ? "bg-[#C5A059]/10" : "";
                  const fg =
                    l.kind === "add" ? "text-[#0A6B4B]" :
                    l.kind === "del" ? "text-[#9A2A2A]" :
                    l.kind === "hunk" ? "text-[#8C6A2B]" : "text-[#202020]";
                  const prefix = l.kind === "add" ? "+" : l.kind === "del" ? "-" : l.kind === "hunk" ? "" : " ";
                  return (
                    <div key={j} className={`${bg} ${fg} px-3 whitespace-pre`}>
                      <span className="inline-block w-3 opacity-60">{prefix}</span>
                      {l.text}
                    </div>
                  );
                })}
              </pre>
            </div>
          ))}
          {state.truncated && (
            <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-[#7A7A7A] bg-[#FAF9F6] border-t border-[#E5E3DB] text-center">
              Diff truncated · open on GitHub for full view
            </div>
          )}
        </div>
      )}
    </div>
  );
}
