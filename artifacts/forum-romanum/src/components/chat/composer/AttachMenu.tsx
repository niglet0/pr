import React from "react";
import { motion } from "motion/react";
import { Icon } from "../../UI";

export type AttachKind = "photo" | "video" | "file" | "poll" | "location" | "contact";

export function AttachMenu({
  onPick,
  onClose,
  enablePoll = true,
}: {
  onPick: (kind: AttachKind) => void;
  onClose: () => void;
  enablePoll?: boolean;
}) {
  const items: { kind: AttachKind; label: string; icon: any; color: string }[] = [
    { kind: "photo",   label: "Photo",    icon: "Image",     color: "var(--ios-blue)" },
    { kind: "video",   label: "Video",    icon: "Video",     color: "var(--ios-purple)" },
    { kind: "file",    label: "File",     icon: "FileText",  color: "var(--ios-orange)" },
    ...(enablePoll ? [{ kind: "poll" as AttachKind, label: "Poll", icon: "BarChart3", color: "var(--ios-green)" }] : []),
    { kind: "location",label: "Location", icon: "MapPin",    color: "var(--ios-red)" },
    { kind: "contact", label: "Contact",  icon: "User",      color: "var(--ios-yellow)" },
  ];
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      className="absolute inset-0 z-[75] bg-black/30 flex items-end"
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full bg-[var(--ios-bg-elev)] rounded-t-3xl pt-2 pb-8 chat-ios"
      >
        <div className="w-10 h-1 bg-[var(--ios-ink-4)] rounded-full mx-auto mb-3" />
        <div className="grid grid-cols-3 gap-2 px-4">
          {items.map((it) => (
            <button
              key={it.kind}
              onClick={() => { onPick(it.kind); onClose(); }}
              className="flex flex-col items-center gap-2 py-4 rounded-2xl ios-tap hover:bg-[var(--ios-bg-soft)]"
            >
              <span className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: `${it.color}1f`, color: it.color as any }}>
                <Icon name={it.icon} size={24} />
              </span>
              <span className="text-[12.5px] font-medium text-[var(--ios-ink)]">{it.label}</span>
            </button>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
