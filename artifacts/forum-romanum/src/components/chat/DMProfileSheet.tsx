import React, { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Avatar, Icon, cn } from "../UI";
import { supabase } from "../../integrations/supabase/client";
import { muteChat, unmuteChat, clearDmHistory, deleteConversation } from "../../lib/chatActions";
import { lastSeenLabel } from "../../lib/chatUtils";

export function DMProfileSheet({
  otherUser,
  conversationId,
  meId,
  muted,
  onClose,
  onMuteChange,
  onCleared,
  onDeleted,
  onOpenProfile,
}: {
  otherUser: any;
  conversationId: string;
  meId: string;
  muted: boolean;
  onClose: () => void;
  onMuteChange: (next: boolean) => void;
  onCleared?: () => void;
  onDeleted?: () => void;
  onOpenProfile?: () => void;
}) {
  const [profile, setProfile] = useState<any>(otherUser);
  const [media, setMedia] = useState<any[]>([]);
  const [files, setFiles] = useState<any[]>([]);
  const [links, setLinks] = useState<{ msgId: string; url: string }[]>([]);
  const [tab, setTab] = useState<"media" | "files" | "links">("media");
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    if (!otherUser?.id) return;
    supabase.from("users").select("*").eq("id", otherUser.id).maybeSingle().then(({ data }: any) => data && setProfile(data));
    supabase.from("messages")
      .select("id, type, media_url, media_meta, content, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(400)
      .then(({ data }: any) => {
        const rows = data || [];
        setMedia(rows.filter((r: any) => (r.type === "image" || r.type === "video") && r.media_url));
        setFiles(rows.filter((r: any) => r.type === "file" && r.media_url));
        const urlRe = /(https?:\/\/[^\s)]+)/g;
        const ls: { msgId: string; url: string }[] = [];
        rows.forEach((r: any) => {
          if (r.type !== "text" || !r.content) return;
          const m = r.content.match(urlRe);
          if (m) m.forEach((u: string) => ls.push({ msgId: r.id, url: u }));
        });
        setLinks(ls);
      });
  }, [otherUser?.id, conversationId]);

  const setMuteFor = async (hours: number | null) => {
    if (hours === 0) {
      await unmuteChat(meId, "dm", conversationId);
      onMuteChange(false);
      return;
    }
    const until = hours == null ? null : new Date(Date.now() + hours * 3600 * 1000);
    await muteChat(meId, "dm", conversationId, until);
    onMuteChange(true);
  };

  const clearAll = async () => {
    await clearDmHistory(conversationId, meId);
    setConfirmClear(false);
    onCleared?.();
  };
  const blockAndDelete = async () => {
    await deleteConversation(conversationId);
    setConfirmBlock(false);
    onDeleted?.();
  };

  const joinDate = profile?.created_at ? new Date(profile.created_at).toLocaleDateString([], { month: "long", year: "numeric" }) : null;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="absolute inset-0 z-[80] bg-black/40 backdrop-blur-sm flex items-end chat-ios"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 280 }}
        className="w-full max-h-[92%] bg-[var(--ios-bg-soft)] rounded-t-3xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--ios-sep)]">
          <button onClick={onClose} className="text-[15px] text-[var(--ios-blue)] font-medium ios-tap">Done</button>
          <span className="text-[15px] font-bold">Info</span>
          <div className="w-12" />
        </div>

        <div className="overflow-y-auto no-scrollbar">
          {/* Banner + Avatar */}
          <div className="relative">
            <div
              className="h-28 w-full"
              style={{
                background: profile?.banner_url
                  ? `url(${profile.banner_url}) center/cover`
                  : "linear-gradient(135deg, #FBF7EE 0%, rgba(197,160,89,0.25) 50%, #F5F2EB 100%)",
              }}
            />
            <div className="absolute left-1/2 -translate-x-1/2 -bottom-10">
              <div className="rounded-full p-1 bg-white shadow-md">
                <Avatar src={profile?.avatar_url} seed={profile?.username || profile?.id} size={80} />
              </div>
            </div>
          </div>

          {/* Identity */}
          <div className="pt-12 pb-4 px-4 text-center">
            <h2 className="text-[20px] font-black flex items-center justify-center gap-1.5">
              {profile?.display_name || "User"}
              {profile?.verified && <Icon name="BadgeCheck" size={16} className="text-[var(--ios-blue)]" />}
            </h2>
            {profile?.username && <p className="text-[13px] text-[var(--ios-ink-3)] mt-0.5">@{profile.username}</p>}
            {profile?.status && (
              <span className="inline-block mt-2 text-[11px] font-bold uppercase tracking-widest text-[#8C6A32] bg-[#C5A059]/12 border border-[#C5A059]/25 px-2.5 py-1 rounded-full">
                {profile.status}
              </span>
            )}
            {profile?.bio && <p className="text-[13.5px] text-[var(--ios-ink-2)] mt-3 leading-snug px-2">{profile.bio}</p>}
            {onOpenProfile && (
              <button
                onClick={() => { onClose(); onOpenProfile(); }}
                className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#C5A059] bg-[#C5A059]/10 border border-[#C5A059]/25 px-4 py-1.5 rounded-full ios-tap"
              >
                <Icon name="User" size={13} color="#C5A059" />
                View Full Profile
              </button>
            )}
          </div>

          {/* About rows */}
          <div className="mx-3 bg-white rounded-2xl divide-y divide-[var(--ios-sep)] overflow-hidden">
            {profile?.location && <InfoRow icon="MapPin" label="Location" value={profile.location} />}
            {profile?.tech_stack && <InfoRow icon="Code2" label="Stack" value={String(profile.tech_stack)} />}
            {profile?.website && <InfoRow icon="Globe" label="Website" value={profile.website} href={profile.website} />}
            {profile?.github && <InfoRow icon="Github" label="GitHub" value={profile.github} href={`https://github.com/${profile.github.replace(/^@/, "")}`} />}
            {joinDate && <InfoRow icon="Calendar" label="Joined" value={joinDate} />}
            <InfoRow icon="Clock" label="Last seen" value={profile?.last_seen_at ? lastSeenLabel(profile.last_seen_at) : "—"} />
          </div>

          {/* Actions */}
          <div className="mx-3 mt-3 bg-white rounded-2xl divide-y divide-[var(--ios-sep)] overflow-hidden">
            <ActionRow icon={muted ? "Bell" : "BellOff"} label={muted ? "Unmute notifications" : "Mute notifications"} onClick={() => setMuteFor(muted ? 0 : null)} />
            {!muted && (
              <div className="px-4 py-2 flex gap-2 overflow-x-auto no-scrollbar bg-[var(--ios-bg-soft)]/40">
                {[{ h: 1, l: "1h" }, { h: 8, l: "8h" }, { h: 24, l: "1d" }, { h: 24 * 7, l: "1w" }].map(({ h, l }) => (
                  <button key={l} onClick={() => setMuteFor(h)} className="text-[12px] font-semibold px-3 py-1 rounded-full bg-white border border-[var(--ios-sep)] ios-tap">
                    Mute {l}
                  </button>
                ))}
              </div>
            )}
            <ActionRow icon="Share2" label="Share contact" onClick={() => navigator.share?.({ title: profile?.display_name, url: profile?.website || "" }).catch(() => {})} />
          </div>

          {/* Tabs */}
          <div className="px-3 mt-4">
            <div className="ios-seg w-full">
              {(["media", "files", "links"] as const).map((t) => (
                <button key={t} data-active={tab === t} onClick={() => setTab(t)} className="flex-1 capitalize">
                  {t} {t === "media" ? media.length : t === "files" ? files.length : links.length}
                </button>
              ))}
            </div>
          </div>

          <div className="px-3 py-3 min-h-[140px]">
            {tab === "media" && (
              media.length === 0
                ? <EmptyTab icon="Image" label="No shared media" />
                : <div className="grid grid-cols-3 gap-1">
                    {media.map((m) => (
                      <a key={m.id} href={m.media_url} target="_blank" rel="noreferrer" className="aspect-square rounded-lg overflow-hidden bg-black/5 block">
                        {m.type === "video"
                          ? <div className="relative w-full h-full"><video src={m.media_url} className="w-full h-full object-cover" /><Icon name="Play" size={20} className="absolute inset-0 m-auto text-white drop-shadow" /></div>
                          : <img src={m.media_url} className="w-full h-full object-cover" />}
                      </a>
                    ))}
                  </div>
            )}
            {tab === "files" && (
              files.length === 0
                ? <EmptyTab icon="FileText" label="No shared files" />
                : <div className="bg-white rounded-2xl divide-y divide-[var(--ios-sep)] overflow-hidden">
                    {files.map((f) => (
                      <a key={f.id} href={f.media_url} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-3 py-2.5">
                        <div className="w-10 h-10 rounded-xl bg-[#C5A059]/15 text-[#8C6A32] flex items-center justify-center font-bold text-[10px]">
                          {(f.media_meta?.name || "").split(".").pop()?.slice(0, 4).toUpperCase() || "FILE"}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[14px] font-bold truncate">{f.media_meta?.name || "File"}</p>
                          <p className="text-[11.5px] text-[var(--ios-ink-3)]">{new Date(f.created_at).toLocaleDateString()}</p>
                        </div>
                      </a>
                    ))}
                  </div>
            )}
            {tab === "links" && (
              links.length === 0
                ? <EmptyTab icon="Link2" label="No shared links" />
                : <div className="bg-white rounded-2xl divide-y divide-[var(--ios-sep)] overflow-hidden">
                    {links.map((l, i) => (
                      <a key={i} href={l.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-3 py-2.5">
                        <div className="w-10 h-10 rounded-xl bg-[var(--ios-blue-soft)] text-[var(--ios-blue)] flex items-center justify-center shrink-0">
                          <Icon name="Link2" size={16} />
                        </div>
                        <p className="text-[13px] truncate text-[var(--ios-blue)] flex-1 break-all">{l.url}</p>
                      </a>
                    ))}
                  </div>
            )}
          </div>

          {/* Destructive */}
          <div className="mx-3 mt-3 mb-6 bg-white rounded-2xl divide-y divide-[var(--ios-sep)] overflow-hidden">
            <button onClick={() => setConfirmClear(true)} className={cn("w-full flex items-center gap-3 px-4 py-3.5 text-[15px] text-[var(--ios-red)] ios-tap")}>
              <Icon name="Eraser" size={18} /><span className="flex-1 text-left">Clear history</span>
            </button>
            <button onClick={() => setConfirmBlock(true)} className={cn("w-full flex items-center gap-3 px-4 py-3.5 text-[15px] text-[var(--ios-red)] ios-tap")}>
              <Icon name="Ban" size={18} /><span className="flex-1 text-left">Block & delete chat</span>
            </button>
            <button onClick={() => {}} className={cn("w-full flex items-center gap-3 px-4 py-3.5 text-[15px] text-[var(--ios-red)] ios-tap")}>
              <Icon name="Flag" size={18} /><span className="flex-1 text-left">Report</span>
            </button>
          </div>
        </div>

        {/* Confirm dialogs */}
        {(confirmClear || confirmBlock) && (
          <div className="absolute inset-0 z-10 bg-black/40 flex items-center justify-center p-6" onClick={() => { setConfirmBlock(false); setConfirmClear(false); }}>
            <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl w-full max-w-xs overflow-hidden">
              <div className="p-4 text-center">
                <p className="font-bold text-[15px]">{confirmClear ? "Clear chat history?" : `Block ${profile?.display_name || "user"}?`}</p>
                <p className="text-[12.5px] text-[var(--ios-ink-3)] mt-1">
                  {confirmClear ? "Messages will be hidden from your side." : "This conversation will be removed."}
                </p>
              </div>
              <div className="border-t border-[var(--ios-sep)] grid grid-cols-2">
                <button onClick={() => { setConfirmBlock(false); setConfirmClear(false); }} className="py-3 text-[15px] text-[var(--ios-blue)] font-medium">Cancel</button>
                <button onClick={confirmClear ? clearAll : blockAndDelete} className="py-3 text-[15px] text-[var(--ios-red)] font-bold border-l border-[var(--ios-sep)]">
                  {confirmClear ? "Clear" : "Block"}
                </button>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

function InfoRow({ icon, label, value, href }: { icon: any; label: string; value: string; href?: string }) {
  const content = (
    <div className="px-4 py-2.5 flex items-center gap-3">
      <Icon name={icon} size={16} className="text-[var(--ios-ink-3)] shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wider font-bold text-[var(--ios-ink-3)]">{label}</p>
        <p className={cn("text-[14px] truncate", href ? "text-[var(--ios-blue)]" : "text-[var(--ios-ink)]")}>{value}</p>
      </div>
    </div>
  );
  return href ? <a href={href} target="_blank" rel="noreferrer">{content}</a> : content;
}

function ActionRow({ icon, label, onClick, danger }: { icon: any; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={cn("w-full flex items-center gap-3 px-4 py-3 text-[15px] ios-tap", danger ? "text-[var(--ios-red)]" : "text-[var(--ios-ink)]")}>
      <Icon name={icon} size={18} /><span className="flex-1 text-left">{label}</span>
      <Icon name="ChevronRight" size={16} className="text-[var(--ios-ink-4)]" />
    </button>
  );
}

function EmptyTab({ icon, label }: { icon: any; label: string }) {
  return (
    <div className="text-center py-8 text-[var(--ios-ink-3)]">
      <Icon name={icon} size={28} className="mx-auto mb-2 opacity-40" />
      <p className="text-[12.5px]">{label}</p>
    </div>
  );
}
