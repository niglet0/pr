import React from "react";
import { motion } from "motion/react";
import { Avatar } from "../../UI";

export function MentionAutocomplete({
  users,
  onPick,
}: {
  users: { id: string; display_name?: string; username?: string; avatar_url?: string }[];
  onPick: (u: any) => void;
}) {
  if (!users.length) return null;
  return (
    <motion.div initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 8, opacity: 0 }} className="absolute bottom-full left-2 right-2 mb-2 bg-white rounded-2xl shadow-lg border border-[var(--ios-sep)] max-h-60 overflow-y-auto z-30">
      {users.slice(0, 8).map((u) => (
        <button key={u.id} onClick={() => onPick(u)} className="w-full flex items-center gap-3 px-3 py-2 hover:bg-[var(--ios-bg-soft)] ios-tap">
          <Avatar src={u.avatar_url} seed={u.username || u.id} size={32} />
          <div className="text-left min-w-0 flex-1">
            <p className="text-[14px] font-bold truncate">{u.display_name || "User"}</p>
            <p className="text-[11.5px] text-[var(--ios-ink-3)] truncate">@{u.username || u.id.slice(0, 6)}</p>
          </div>
        </button>
      ))}
    </motion.div>
  );
}
