import React, { useRef } from "react";
import { motion, useMotionValue, useTransform } from "motion/react";
import { Avatar, Icon, cn } from "../../UI";
import { EntitiesText } from "../parts/EntitiesText";
import { clockTime } from "../../../lib/chatUtils";
import { colorForUser } from "../../../lib/chatColors";
import { VoiceBubble } from "./VoiceBubble";
import { FileBubble } from "./FileBubble";
import { VideoBubble } from "./VideoBubble";
import { PollBubble } from "./PollBubble";

export function MessageBubble({
  msg, me, meId, showSender, senderProfile, repliedMsg, repliedSenderName, reactions,
  seen, onMenu, onClick, onReply, onRetry, onJumpReply,
}: {
  msg: any;
  me: boolean;
  meId?: string;
  showSender?: boolean;
  senderProfile?: any;
  repliedMsg?: any;
  repliedSenderName?: string;
  reactions: any[];
  seen?: boolean;
  onMenu: () => void;
  onClick?: () => void;
  onReply: () => void;
  onRetry?: () => void;
  onJumpReply?: () => void;
}) {
  const x = useMotionValue(0);
  const replyIconOpacity = useTransform(x, [me ? 0 : 0, me ? -50 : 50], [0, 1]);
  const replyIconScale = useTransform(x, [me ? 0 : 0, me ? -50 : 50], [0.6, 1]);

  const senderColor = showSender ? colorForUser(msg.sender_id) : undefined;
  const rxGroups: Record<string, any[]> = {};
  reactions.forEach((r) => { (rxGroups[r.emoji] = rxGroups[r.emoji] || []).push(r); });

  const lastTap = useRef(0);
  const handleTap = () => {
    const now = Date.now();
    if (now - lastTap.current < 280) onMenu();
    else onClick?.();
    lastTap.current = now;
  };

  const body = (() => {
    if (msg.is_deleted) return <span className={cn("italic text-[13px]", me ? "text-white/75" : "text-[var(--ios-ink-3)]")}>Message deleted</span>;
    if (msg.type === "image" && msg.media_url) return <img src={msg.media_url} className="rounded-xl max-w-[260px] max-h-72 object-cover" />;
    if (msg.type === "video" && msg.media_url) return <VideoBubble url={msg.media_url} />;
    if (msg.type === "voice" && msg.media_url) return <VoiceBubble url={msg.media_url} meta={msg.media_meta} me={me} />;
    if (msg.type === "file" && msg.media_url)  return <FileBubble url={msg.media_url} meta={msg.media_meta} me={me} />;
    if (msg.type === "poll") return <PollBubble messageId={msg.id} meId={meId} me={me} />;
    return (
      <div className="whitespace-pre-wrap leading-snug break-words text-[15.5px]">
        <EntitiesText text={msg.content || ""} />
      </div>
    );
  })();

  const isMedia = msg.type === "image" || msg.type === "video";

  return (
    <div className={cn("flex flex-col w-full relative", me ? "items-end" : "items-start")}>
      {/* swipe-to-reply icon */}
      <motion.div
        style={{ opacity: replyIconOpacity, scale: replyIconScale }}
        className={cn("absolute top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-[var(--ios-blue-soft)] flex items-center justify-center text-[var(--ios-blue)] pointer-events-none", me ? "right-2" : "left-2")}
      >
        <Icon name="Reply" size={15} />
      </motion.div>

      <motion.div
        drag="x"
        dragConstraints={{ left: me ? -70 : 0, right: me ? 0 : 70 }}
        dragElastic={0.18}
        style={{ x }}
        onDragEnd={(_: any, info: any) => {
          if ((me && info.offset.x < -50) || (!me && info.offset.x > 50)) onReply();
        }}
        className={cn("group relative max-w-[82%] flex items-end gap-1.5", me ? "flex-row-reverse" : "flex-row")}
      >
        {showSender && !me && <Avatar src={senderProfile?.avatar_url} seed={msg.sender_id} size={26} className="mb-1" />}
        <div
          onContextMenu={(e) => { e.preventDefault(); if (!msg.is_deleted && !String(msg.id).startsWith("tmp")) onMenu(); }}
          onClick={handleTap}
          className={cn(
            "relative rounded-[18px] px-3 py-1.5 shadow-sm cursor-pointer select-none transition-transform active:scale-[0.985]",
            isMedia ? "p-1 overflow-hidden" : "",
            me ? "bubble-me rounded-br-[6px]" : "bubble-other rounded-bl-[6px]"
          )}
        >
          {showSender && !me && (
            <p className="text-[11.5px] font-bold mb-0.5 pt-0.5" style={{ color: senderColor }}>
              {senderProfile?.display_name || "User"}
            </p>
          )}
          {msg.forward_from_name && (
            <div className={cn("text-[10.5px] flex items-center gap-1 mb-1", me ? "text-white/85" : "text-[var(--ios-ink-3)]")}>
              <Icon name="CornerUpRight" size={11} /> <span>Forwarded from <strong>{msg.forward_from_name}</strong></span>
            </div>
          )}
          {repliedMsg && (
            <div
              onClick={(e) => { e.stopPropagation(); onJumpReply?.(); }}
              className={cn("mb-1 pl-2 border-l-[3px] rounded text-[12.5px] py-0.5 pr-2 cursor-pointer", me ? "border-white/80 bg-white/15" : "bg-black/5")}
              style={!me ? { borderLeftColor: colorForUser(repliedMsg.sender_id) } : undefined}
            >
              <p className={cn("font-bold text-[11px]", me ? "text-white" : "")} style={!me ? { color: colorForUser(repliedMsg.sender_id) } : undefined}>
                {repliedSenderName || "Reply"}
              </p>
              <p className={cn("truncate", me ? "text-white/85" : "text-[var(--ios-ink-3)]")}>
                {repliedMsg.type === "image" ? "🖼 Photo" : repliedMsg.type === "voice" ? "🎤 Voice message" : repliedMsg.type === "file" ? "📎 File" : repliedMsg.content}
              </p>
            </div>
          )}

          {body}

          <div className={cn("flex items-center justify-end gap-1 text-[10px] mt-0.5 tabular-nums", me ? "text-white/85" : "text-[var(--ios-ink-3)]", isMedia ? "absolute bottom-1.5 right-2.5 bg-black/35 px-1.5 py-0.5 rounded-full text-white" : "")}>
            {msg.edited_at && <span className="italic opacity-80 mr-0.5">edited</span>}
            <span>{clockTime(msg.created_at)}</span>
            {me && !msg.is_deleted && (
              <>
                {msg._status === "pending" && <Icon name="Clock" size={11} />}
                {msg._status === "failed" && <button onClick={(e) => { e.stopPropagation(); onRetry?.(); }} className="underline">retry</button>}
                {msg._status === "sent" && <Icon name="CheckCheck" size={13} className={seen ? "text-[#9ecbff]" : ""} />}
              </>
            )}
          </div>
        </div>
      </motion.div>

      {Object.keys(rxGroups).length > 0 && (
        <div className={cn("flex flex-wrap gap-1 mt-1 px-1", me ? "justify-end" : "justify-start", showSender && !me ? "pl-8" : "")}>
          {Object.entries(rxGroups).map(([emoji, list]) => {
            const mine = (list as any[]).some((r) => r.user_id === meId);
            return (
              <span key={emoji} className={cn("flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] border", mine ? "bg-[var(--ios-blue-soft)] border-[var(--ios-blue)]/40" : "bg-white border-[var(--ios-sep)]")}>
                <span>{emoji}</span>
                <span className="text-[10px] font-bold text-[var(--ios-ink-3)]">{(list as any[]).length}</span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
