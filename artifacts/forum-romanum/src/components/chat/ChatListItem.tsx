import React, { useRef } from "react";
import { motion, useMotionValue, useTransform, animate } from "motion/react";
import { Avatar, Icon, Badge, cn } from "../UI";
import { timeAgo, previewIcon } from "../../lib/chatUtils";

export type ChatListAction = "pin" | "unpin" | "mute" | "unmute" | "archive" | "delete";

export function ChatListItem({
  name,
  avatar,
  seed,
  preview,
  time,
  unread,
  previewType,
  isGroup,
  isChannel,
  isPinned,
  isMuted,
  online,
  verified,
  onOpen,
  onAction,
}: {
  name: string;
  avatar?: string;
  seed?: string;
  preview: string;
  time?: string;
  unread?: number;
  previewType?: string;
  isGroup?: boolean;
  isChannel?: boolean;
  isPinned?: boolean;
  isMuted?: boolean;
  online?: boolean;
  verified?: boolean;
  onOpen: () => void;
  onAction: (a: ChatListAction) => void;
}) {
  const x = useMotionValue(0);
  const startX = useRef(0);
  // Reveal widths: 2 actions per side
  const LEFT_W = 80;            // pin
  const RIGHT_W = 80 * 2;       // mute + delete

  const leftOpacity = useTransform(x, [0, 40], [0, 1]);
  const rightOpacity = useTransform(x, [-40, 0], [1, 0]);

  const reset = () => animate(x, 0, { type: "spring", stiffness: 380, damping: 32 });

  return (
    <div className="relative overflow-hidden rounded-2xl bg-white">
      {/* Left action (Pin) */}
      <motion.div
        style={{ opacity: leftOpacity }}
        className="absolute inset-y-0 left-0 flex items-center"
      >
        <button
          onClick={() => { onAction(isPinned ? "unpin" : "pin"); reset(); }}
          className="h-full w-20 bg-[var(--ios-orange,#FF9500)] text-white flex flex-col items-center justify-center gap-0.5"
        >
          <Icon name={isPinned ? "PinOff" : "Pin"} size={18} />
          <span className="text-[10px] font-bold">{isPinned ? "Unpin" : "Pin"}</span>
        </button>
      </motion.div>

      {/* Right actions (Mute + Delete) */}
      <motion.div
        style={{ opacity: rightOpacity }}
        className="absolute inset-y-0 right-0 flex items-center"
      >
        <button
          onClick={() => { onAction(isMuted ? "unmute" : "mute"); reset(); }}
          className="h-full w-20 bg-[var(--ios-blue,#007AFF)] text-white flex flex-col items-center justify-center gap-0.5"
        >
          <Icon name={isMuted ? "Bell" : "BellOff"} size={18} />
          <span className="text-[10px] font-bold">{isMuted ? "Unmute" : "Mute"}</span>
        </button>
        <button
          onClick={() => { onAction("delete"); reset(); }}
          className="h-full w-20 bg-[var(--ios-red,#FF3B30)] text-white flex flex-col items-center justify-center gap-0.5"
        >
          <Icon name="Trash2" size={18} />
          <span className="text-[10px] font-bold">Delete</span>
        </button>
      </motion.div>

      <motion.div
        drag="x"
        dragConstraints={{ left: -RIGHT_W, right: LEFT_W }}
        dragElastic={0.08}
        style={{ x }}
        onDragStart={() => { startX.current = x.get(); }}
        onDragEnd={(_, info) => {
          const v = x.get();
          if (v <= -RIGHT_W * 0.55) animate(x, -RIGHT_W, { type: "spring", stiffness: 360, damping: 32 });
          else if (v >= LEFT_W * 0.55) animate(x, LEFT_W, { type: "spring", stiffness: 360, damping: 32 });
          else reset();
        }}
        onClick={() => {
          if (Math.abs(x.get()) > 6) { reset(); return; }
          onOpen();
        }}
        className={cn(
          "relative flex gap-3 items-center px-3.5 py-3 bg-white active:bg-[#F2F2F7] transition-colors select-none touch-pan-y",
          isPinned && "bg-[#FAFAF7]"
        )}
      >
        <div className="relative shrink-0">
          <Avatar src={avatar} seed={seed} size={52} />
          {online && !isGroup && (
            <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-[var(--ios-green,#34C759)] border-2 border-white" />
          )}
          {isGroup && (
            <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-[var(--ios-blue,#007AFF)] flex items-center justify-center border-2 border-white">
              <Icon name={isChannel ? "Megaphone" : "Users"} size={10} color="white" />
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-center gap-2">
            <div className="flex items-center gap-1 min-w-0">
              <span className="font-semibold text-[15.5px] truncate text-[var(--ios-ink,#1C1C1E)]">{name}</span>
              {verified && <Icon name="BadgeCheck" size={14} className="text-[var(--ios-blue,#007AFF)] shrink-0" />}
              {isMuted && <Icon name="BellOff" size={12} className="text-[var(--ios-ink-4,#C7C7CC)] shrink-0" />}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {time && <span className="text-[12px] text-[var(--ios-ink-3,#8E8E93)]">{timeAgo(time)}</span>}
            </div>
          </div>
          <div className="flex justify-between items-center gap-2 mt-0.5">
            <p className="text-[13.5px] text-[var(--ios-ink-3,#8E8E93)] truncate flex-1">
              {previewIcon(previewType) && <span className="mr-1">{previewIcon(previewType)}</span>}
              {preview}
            </p>
            <div className="flex items-center gap-1.5 shrink-0">
              {isPinned && !unread && <Icon name="Pin" size={12} className="text-[var(--ios-ink-4,#C7C7CC)]" />}
              {unread && unread > 0 ? (
                <span
                  className={cn(
                    "min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold text-white flex items-center justify-center tabular-nums",
                    isMuted ? "bg-[var(--ios-ink-4,#C7C7CC)]" : "bg-[var(--ios-blue,#007AFF)]"
                  )}
                >
                  {unread > 99 ? "99+" : unread}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
