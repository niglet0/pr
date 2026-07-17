import React from "react";

// Very small Telegram-lite renderer:
//   **bold**, *italic*, `code`, ||spoiler||, @mention, #hash, http(s) links
// Renders inline. Safe (no HTML injection).

type Tok = { t: "text" | "bold" | "italic" | "code" | "spoiler" | "mention" | "hash" | "link"; v: string };

function tokenize(input: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  const push = (t: Tok["t"], v: string) => { if (v) out.push({ t, v }); };
  while (i < input.length) {
    const rest = input.slice(i);
    // ordered: spoiler, bold, italic, code, link, mention, hash
    let m: RegExpMatchArray | null = null;
    if ((m = rest.match(/^\|\|([^|]+)\|\|/))) { push("spoiler", m[1]); i += m[0].length; continue; }
    if ((m = rest.match(/^\*\*([^*]+)\*\*/))) { push("bold", m[1]); i += m[0].length; continue; }
    if ((m = rest.match(/^\*([^*]+)\*/)))      { push("italic", m[1]); i += m[0].length; continue; }
    if ((m = rest.match(/^`([^`]+)`/)))        { push("code", m[1]); i += m[0].length; continue; }
    if ((m = rest.match(/^(https?:\/\/[^\s]+)/))) { push("link", m[1]); i += m[0].length; continue; }
    if ((m = rest.match(/^@([a-zA-Z0-9_]{2,32})/))) { push("mention", "@" + m[1]); i += m[0].length; continue; }
    if ((m = rest.match(/^#([a-zA-Z0-9_]{2,32})/))) { push("hash", "#" + m[1]); i += m[0].length; continue; }
    // plain char run until next special
    const next = rest.search(/(\*\*|\*|`|\|\||https?:\/\/|@\w|#\w)/);
    const chunk = next === -1 ? rest : rest.slice(0, next || 1);
    push("text", chunk);
    i += chunk.length;
  }
  return out;
}

export function EntitiesText({
  text,
  highlightMention,
  className,
}: {
  text: string;
  highlightMention?: string; // e.g. "@me" to bold-highlight when matched
  className?: string;
}) {
  const [revealed, setRevealed] = React.useState<Record<number, boolean>>({});
  const toks = React.useMemo(() => tokenize(text || ""), [text]);
  return (
    <span className={className}>
      {toks.map((t, i) => {
        if (t.t === "text") return <React.Fragment key={i}>{t.v}</React.Fragment>;
        if (t.t === "bold") return <strong key={i} className="font-bold">{t.v}</strong>;
        if (t.t === "italic") return <em key={i}>{t.v}</em>;
        if (t.t === "code") return <code key={i} className="px-1 py-px rounded bg-black/8 font-mono text-[12.5px]">{t.v}</code>;
        if (t.t === "spoiler")
          return (
            <span
              key={i}
              onClick={(e) => { e.stopPropagation(); setRevealed((p) => ({ ...p, [i]: !p[i] })); }}
              className={
                revealed[i]
                  ? "underline decoration-dotted"
                  : "bg-[#202020] text-[#202020] rounded px-1 cursor-pointer select-none"
              }
            >{t.v}</span>
          );
        if (t.t === "link")
          return (
            <a key={i} href={t.v} target="_blank" rel="noreferrer" className="underline break-all hover:opacity-80">
              {t.v.replace(/^https?:\/\//, "").slice(0, 60)}
            </a>
          );
        if (t.t === "mention") {
          const me = highlightMention && t.v.toLowerCase() === highlightMention.toLowerCase();
          return (
            <span key={i} className={me ? "bg-[#C5A059]/25 text-[#8C6A32] font-bold rounded px-1" : "text-[#3B82F6] font-bold"}>
              {t.v}
            </span>
          );
        }
        if (t.t === "hash") return <span key={i} className="text-[#3B82F6]">{t.v}</span>;
        return null;
      })}
    </span>
  );
}