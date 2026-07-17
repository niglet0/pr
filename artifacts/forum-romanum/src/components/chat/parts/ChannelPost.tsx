import React, { useEffect, useRef } from "react";
import { Avatar, Icon, cn } from "../../UI";
import { EntitiesText } from "./EntitiesText";
import { clockTime, compactNum } from "../../../lib/chatUtils";
import { supabase } from "../../../integrations/supabase/client";

function ReactionsBar({
  reactions, meId, onToggle, onAdd,
}: { reactions: any[]; meId?: string; onToggle: (e: string) => void; onAdd: () => void }) {
  const groups: Record<string, any[]> = {};
  reactions.forEach((r) => { (groups[r.emoji] = groups[r.emoji] || []).push(r); });
  return (
    <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-[#C5A059]/10">
      {Object.entries(groups).map(([e, list]) => {
        const mine = list.some((r) => r.user_id === meId);
        return (
          <button
            key={e}
            onClick={(ev) => { ev.stopPropagation(); onToggle(e); }}
            className={cn(
              "flex items-center gap-1 px-2.5 py-1 rounded-full text-[12.5px] border transition-all",
              mine ? "bg-[#C5A059]/15 border-[#C5A059]/40" : "bg-[#F3F1EC] border-[#E5E3DB] hover:bg-white"
            )}
          >
            <span>{e}</span>
            <span className="text-[10.5px] font-bold text-[#7A7A7A]">{list.length}</span>
          </button>
        );
      })}
      <button onClick={(ev) => { ev.stopPropagation(); onAdd(); }} className="w-7 h-7 rounded-full flex items-center justify-center bg-[#F3F1EC] border border-[#E5E3DB] text-[#7A7A7A] hover:text-[#C5A059]">
        <Icon name="Plus" size={13} />
      </button>
    </div>
  );
}

export function ChannelPost({
  msg, channel, meId, reactions,
  onMenu, onReact, onAddReaction, onShare, onOpenComments,
}: {
  msg: any; channel: any; meId?: string; reactions: any[];
  onMenu: () => void; onReact: (e: string) => void; onAddReaction: () => void;
  onShare: () => void; onOpenComments?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const viewedRef = useRef(false);
  useEffect(() => {
    if (!meId || viewedRef.current || String(msg.id).startsWith("tmp") || msg.is_deleted) return;
    if (msg.sender_id === meId) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !viewedRef.current) {
        viewedRef.current = true;
        supabase.from("message_views").insert({ message_id: msg.id, user_id: meId }).then(() => {});
        io.disconnect();
      }
    }, { threshold: 0.6 });
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, [msg.id, meId, msg.sender_id, msg.is_deleted]);

  if (msg.is_deleted) {
    return (
      <div className="px-1.5 py-1 w-full">
        <div className="bg-white border border-[#E5E3DB] rounded-2xl px-4 py-3 italic text-[#7A7A7A] text-[13.5px] max-w-[92%]">
          This post was deleted
        </div>
      </div>
    );
  }

  const text =
    msg.type === "voice" ? "🎤 Voice message" :
    msg.type === "file"  ? "📎 " + (msg.media_meta?.name || "File") :
    msg.content;

  return (
    <div ref={ref} className="w-full flex">
      <div className="max-w-[92%] w-full">
        <div
          onContextMenu={(e) => { e.preventDefault(); onMenu(); }}
          className="relative bg-white border border-[#E5E3DB] rounded-2xl rounded-bl-md shadow-[0_2px_8px_rgba(0,0,0,0.04)] overflow-hidden"
        >
          <div className="flex items-center gap-2 px-3 pt-2.5">
            <Avatar src={channel?.avatar_url} seed={channel?.id} size={24} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1 min-w-0">
                <span className="font-bold text-[13px] truncate">{channel?.name}</span>
                {channel?.is_verified && <Icon name="BadgeCheck" size={13} className="text-[#3B82F6] shrink-0" />}
                <Icon name="Megaphone" size={11} className="text-[#C5A059] shrink-0" />
              </div>
              {msg.author_signature && (
                <p className="text-[10.5px] text-[#7A7A7A] -mt-0.5 truncate">by {msg.author_signature}</p>
              )}
            </div>
            <button onClick={(e) => { e.stopPropagation(); onMenu(); }} className="text-[#7A7A7A] hover:text-[#C5A059] p-1 -mr-1">
              <Icon name="MoreVertical" size={16} />
            </button>
          </div>

          {msg.forward_from_name && (
            <div className="mx-3 mt-2 text-[11px] text-[#7A7A7A] flex items-center gap-1">
              <Icon name="CornerUpRight" size={12} className="text-[#C5A059]" />
              <span>Forwarded from <strong className="text-[#202020]">{msg.forward_from_name}</strong></span>
            </div>
          )}

          {msg.type === "image" && msg.media_url && (
            <img src={msg.media_url} className="w-full max-h-[420px] object-cover mt-2" />
          )}
          {msg.type === "video" && msg.media_url && (
            <video src={msg.media_url} controls className="w-full max-h-[420px] mt-2 bg-black" />
          )}

          {text && (
            <div className="px-4 py-2.5 text-[14.5px] leading-relaxed whitespace-pre-wrap break-words text-[#202020]">
              <EntitiesText text={text} />
            </div>
          )}

          {reactions.length > 0 && (
            <div className="px-3 pb-1">
              <ReactionsBar reactions={reactions} meId={meId} onToggle={onReact} onAdd={onAddReaction} />
            </div>
          )}

          <div className="flex items-center justify-between px-3 py-2 border-t border-[#C5A059]/10 bg-[#FAF9F6]">
            <div className="flex items-center gap-3 text-[11px] font-medium text-[#7A7A7A]">
              <span className="flex items-center gap-1">
                <Icon name="Eye" size={13} />
                {compactNum(msg.views_count || 0)}
              </span>
              {onOpenComments && (
                <button onClick={(e) => { e.stopPropagation(); onOpenComments(); }} className="flex items-center gap-1 hover:text-[#C5A059]">
                  <Icon name="MessageCircle" size={13} />
                  <span>Comments</span>
                </button>
              )}
              <button onClick={(e) => { e.stopPropagation(); onShare(); }} className="flex items-center gap-1 hover:text-[#C5A059]">
                <Icon name="Share2" size={13} />
                <span>Share</span>
              </button>
              {reactions.length === 0 && (
                <button onClick={(e) => { e.stopPropagation(); onAddReaction(); }} className="flex items-center gap-1 hover:text-[#C5A059]">
                  <Icon name="Smile" size={13} />
                </button>
              )}
            </div>
            <div className="flex items-center gap-1 text-[10.5px] text-[#7A7A7A]">
              {msg.edited_at && <span className="italic opacity-80">edited</span>}
              <span>{clockTime(msg.created_at)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}