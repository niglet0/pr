import React from "react";
import { motion } from "motion/react";
import { Icon, cn } from "../UI";

export type HeaderAction =
  | "search" | "mute-1h" | "mute-8h" | "mute-1d" | "mute-forever" | "unmute"
  | "clear" | "block" | "report" | "leave" | "info";

export function ChatHeaderMenu({
  isDM, isChannel, muted, isAdmin, onClose, onAction,
}: {
  isDM: boolean;
  isChannel: boolean;
  muted: boolean;
  isAdmin: boolean;
  onClose: () => void;
  onAction: (a: HeaderAction) => void;
}) {
  const click = (a: HeaderAction) => { onAction(a); onClose(); };
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="absolute inset-0 z-[75] bg-black/35 flex items-end chat-ios"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full bg-[var(--ios-bg-soft)] rounded-t-3xl pt-3 pb-8 px-3 space-y-2"
      >
        <div className="w-10 h-1 bg-[var(--ios-ink-4)] rounded-full mx-auto" />
        <div className="bg-white rounded-2xl divide-y divide-[var(--ios-sep)] overflow-hidden">
          <Row icon="Search" label="Search in chat" onClick={() => click("search")} />
          {!isDM && <Row icon="Info" label={isChannel ? "Channel info" : "Group info"} onClick={() => click("info")} />}
        </div>

        <div className="bg-white rounded-2xl divide-y divide-[var(--ios-sep)] overflow-hidden">
          {muted ? (
            <Row icon="Bell" label="Unmute" onClick={() => click("unmute")} />
          ) : (
            <>
              <Row icon="BellOff" label="Mute for 1 hour" onClick={() => click("mute-1h")} />
              <Row icon="BellOff" label="Mute for 8 hours" onClick={() => click("mute-8h")} />
              <Row icon="BellOff" label="Mute for 1 day" onClick={() => click("mute-1d")} />
              <Row icon="BellOff" label="Mute forever" onClick={() => click("mute-forever")} />
            </>
          )}
        </div>

        <div className="bg-white rounded-2xl divide-y divide-[var(--ios-sep)] overflow-hidden">
          {isDM && <Row icon="Eraser" label="Clear history" danger onClick={() => click("clear")} />}
          {isDM && <Row icon="Ban" label="Block user" danger onClick={() => click("block")} />}
          {!isDM && !isAdmin && <Row icon="LogOut" label={isChannel ? "Leave channel" : "Leave group"} danger onClick={() => click("leave")} />}
          <Row icon="Flag" label="Report" danger onClick={() => click("report")} />
        </div>

        <button onClick={onClose} className="w-full bg-white rounded-2xl py-3 text-[16px] font-bold text-[var(--ios-blue)] ios-tap">Cancel</button>
      </motion.div>
    </motion.div>
  );
}

function Row({ icon, label, onClick, danger }: { icon: any; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={cn("w-full flex items-center gap-3 px-4 py-3 text-[15.5px] ios-tap", danger ? "text-[var(--ios-red)]" : "text-[var(--ios-ink)]")}>
      <Icon name={icon} size={18} />
      <span className="flex-1 text-left">{label}</span>
    </button>
  );
}
