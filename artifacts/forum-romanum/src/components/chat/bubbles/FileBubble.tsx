import React from "react";
import { Icon, cn } from "../../UI";

function fmtSize(n?: number) {
  if (!n) return "";
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + " MB";
  return (n / 1024 / 1024 / 1024).toFixed(1) + " GB";
}

// Map extensions to elegant glyph + accent
function iconFor(ext: string): { glyph: string; accent: string } {
  const e = ext.toLowerCase();
  if (["pdf"].includes(e)) return { glyph: "PDF", accent: "#B4321F" };
  if (["doc", "docx"].includes(e)) return { glyph: "DOC", accent: "#2563EB" };
  if (["xls", "xlsx", "csv"].includes(e)) return { glyph: "XLS", accent: "#10B981" };
  if (["ppt", "pptx", "key"].includes(e)) return { glyph: "PPT", accent: "#C5780F" };
  if (["zip", "rar", "7z", "tar", "gz"].includes(e)) return { glyph: "ZIP", accent: "#6B4FA8" };
  if (["mp3", "wav", "flac", "m4a", "ogg"].includes(e)) return { glyph: "AUD", accent: "#8C6A32" };
  if (["mp4", "mov", "mkv", "webm", "avi"].includes(e)) return { glyph: "VID", accent: "#1F2937" };
  if (["png", "jpg", "jpeg", "webp", "gif", "heic"].includes(e)) return { glyph: "IMG", accent: "#C5A059" };
  if (["js", "ts", "tsx", "jsx", "json", "html", "css", "py", "go", "rs", "java", "cpp"].includes(e)) return { glyph: "CODE", accent: "#374151" };
  return { glyph: e ? e.slice(0, 3).toUpperCase() : "FILE", accent: "#8C6A32" };
}

export function FileBubble({ url, meta, me }: { url: string; meta?: any; me?: boolean }) {
  const name = meta?.name || "File";
  const ext = (name.includes(".") ? name.split(".").pop() : "") || "";
  const { glyph, accent } = iconFor(ext);

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="flex items-center gap-3 min-w-[240px] py-0.5"
    >
      {/* Document-card icon */}
      <div className="relative w-12 h-14 shrink-0">
        <div
          className={cn(
            "absolute inset-0 rounded-[10px] flex items-end justify-center pb-1.5 font-black text-[10px] tracking-wider text-white shadow-md",
          )}
          style={{
            background: me
              ? `linear-gradient(160deg, rgba(255,255,255,0.32), rgba(255,255,255,0.18))`
              : `linear-gradient(160deg, ${accent} 0%, ${accent}dd 60%, ${accent}aa 100%)`,
            border: me ? "1px solid rgba(255,255,255,0.3)" : "none",
          }}
        >
          {glyph}
        </div>
        {/* folded corner */}
        <div
          className="absolute top-0 right-0 w-3.5 h-3.5"
          style={{
            background: me ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.35)",
            clipPath: "polygon(0 0, 100% 0, 100% 100%)",
            borderTopRightRadius: "10px",
          }}
        />
      </div>

      <div className="min-w-0 flex-1">
        <p className={cn("text-[14px] font-bold truncate leading-tight", me ? "text-white" : "text-[var(--ios-ink)]")}>{name}</p>
        <p className={cn("text-[11.5px] mt-0.5 flex items-center gap-1.5", me ? "text-white/80" : "text-[var(--ios-ink-3)]")}>
          <span className="uppercase tracking-wider font-semibold">{ext || "FILE"}</span>
          {meta?.size ? <><span className="opacity-50">•</span><span className="tabular-nums">{fmtSize(meta.size)}</span></> : null}
        </p>
      </div>

      <div className={cn(
        "w-9 h-9 rounded-full flex items-center justify-center shrink-0",
        me ? "bg-white/20 text-white" : "bg-[var(--ios-blue-soft)] text-[var(--ios-blue)]"
      )}>
        <Icon name="ArrowDownToLine" size={16} />
      </div>
    </a>
  );
}
