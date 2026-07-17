import React, { useState, useEffect, useMemo } from "react";
import { motion } from "motion/react";
import { Avatar, Icon, Button, cn } from "../UI";
import { supabase } from "../../integrations/supabase/client";
import { createInviteLink, listInvites, revokeInvite, inviteUrl } from "../../lib/chatActions";

type Tab = "members" | "media" | "links" | "files" | "settings";

export function GroupInfoSheet({
  group,
  currentUser,
  isAdmin,
  onClose,
  onLeft,
}: {
  group: any;
  currentUser: any;
  isAdmin: boolean;
  onClose: () => void;
  onLeft: () => void;
}) {
  const [members, setMembers] = useState<any[]>([]);
  const [media, setMedia] = useState<any[]>([]);
  const [files, setFiles] = useState<any[]>([]);
  const [links, setLinks] = useState<any[]>([]);
  const [invites, setInvites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("members");
  const [muted, setMuted] = useState(false);
  const [signMessages, setSignMessages] = useState<boolean>(!!group.sign_messages);
  const [slowMode, setSlowMode] = useState<number>(group.slow_mode_seconds || 0);
  const [publicHandle, setPublicHandle] = useState<string>(group.username || "");

  const meId = currentUser?.id;
  const isChannel = !!group.is_channel;

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [memRes, msgRes, muteRes, inviteRes] = await Promise.all([
        supabase.from("group_members").select("user_id, role, joined_at").eq("group_id", group.id),
        supabase.from("messages").select("id, type, media_url, media_meta, content, created_at, sender_id")
          .eq("group_id", group.id).eq("is_deleted", false).in("type", ["image", "video", "file", "text"])
          .order("created_at", { ascending: false }).limit(200),
        supabase.from("chat_mutes").select("mute_until").eq("user_id", meId).eq("chat_kind", "group").eq("chat_id", group.id).maybeSingle(),
        isAdmin ? listInvites(group.id) : Promise.resolve([] as any[]),
      ]);

      // members
      const mem = memRes.data || [];
      const ids = mem.map((m: any) => m.user_id);
      const { data: users } = ids.length
        ? await supabase.from("users").select("id, display_name, username, avatar_url, verified").in("id", ids)
        : { data: [] as any[] };
      const enriched = mem.map((m: any) => ({ ...m, user: (users || []).find((u: any) => u.id === m.user_id) }));
      enriched.sort((a: any, b: any) => (a.role === "owner" ? -1 : b.role === "owner" ? 1 : a.role === "admin" ? -0.5 : 0));
      setMembers(enriched);

      // media / files / links
      const rows = msgRes.data || [];
      setMedia(rows.filter((m: any) => (m.type === "image" || m.type === "video") && m.media_url));
      setFiles(rows.filter((m: any) => m.type === "file" && m.media_url));
      const urlRe = /(https?:\/\/[^\s]+)/gi;
      const linkRows: any[] = [];
      rows.forEach((m: any) => {
        if (m.type !== "text" || !m.content) return;
        const found = m.content.match(urlRe);
        if (found) found.forEach((u: string) => linkRows.push({ ...m, url: u }));
      });
      setLinks(linkRows);

      // mute
      if (muteRes.data) {
        const u = muteRes.data.mute_until ? new Date(muteRes.data.mute_until) : null;
        setMuted(!u || u.getTime() > Date.now());
      }
      setInvites((inviteRes as any[]) || []);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.id]);

  const promote = async (m: any) => {
    const next = m.role === "admin" ? "member" : "admin";
    setMembers((prev) => prev.map((x) => (x.user_id === m.user_id ? { ...x, role: next } : x)));
    await supabase.from("group_members").update({ role: next }).eq("group_id", group.id).eq("user_id", m.user_id);
  };
  const kick = async (m: any) => {
    setMembers((prev) => prev.filter((x) => x.user_id !== m.user_id));
    await supabase.from("group_members").delete().eq("group_id", group.id).eq("user_id", m.user_id);
  };
  const leave = async () => {
    await supabase.from("group_members").delete().eq("group_id", group.id).eq("user_id", meId);
    onLeft();
  };
  const toggleMute = async () => {
    if (muted) {
      await supabase.from("chat_mutes").delete().eq("user_id", meId).eq("chat_kind", "group").eq("chat_id", group.id);
      setMuted(false);
    } else {
      await supabase.from("chat_mutes").upsert(
        { user_id: meId, chat_kind: "group", chat_id: group.id, mute_until: null },
        { onConflict: "user_id,chat_kind,chat_id" },
      );
      setMuted(true);
    }
  };
  const saveSetting = async (patch: any) => {
    await supabase.from("groups").update(patch).eq("id", group.id);
  };
  const newInvite = async () => {
    const inv = await createInviteLink(group.id, meId);
    if (inv) setInvites((p) => [inv, ...p]);
  };
  const dropInvite = async (id: string) => {
    await revokeInvite(id);
    setInvites((p) => p.filter((x) => x.id !== id));
  };

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: "members", label: isChannel ? "Subs" : "Members", icon: "Users" },
    { id: "media",   label: "Media",   icon: "Image" },
    { id: "links",   label: "Links",   icon: "Link" },
    { id: "files",   label: "Files",   icon: "FileText" },
    ...(isAdmin ? [{ id: "settings" as Tab, label: "Admin", icon: "Settings" }] : []),
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-[80] bg-black/40 backdrop-blur-sm flex items-end chat-ios" onClick={onClose}>
      <motion.div
        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 280 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-h-[92vh] bg-[var(--ios-bg-soft,#F2F2F7)] rounded-t-3xl flex flex-col overflow-hidden"
      >
        <div className="w-10 h-1 bg-[var(--ios-ink-4,#C7C7CC)] rounded-full mx-auto mt-2 mb-1" />
        <div className="h-11 flex items-center justify-between px-4 shrink-0">
          <span className="text-[15px] text-[var(--ios-blue,#007AFF)] font-medium" onClick={onClose}>Done</span>
          <span className="font-semibold text-[15px]">{isChannel ? "Channel Info" : "Group Info"}</span>
          <button onClick={toggleMute} className="text-[var(--ios-blue,#007AFF)]">
            <Icon name={muted ? "Bell" : "BellOff"} size={18} />
          </button>
        </div>

        <div className="overflow-y-auto no-scrollbar pb-10">
          {/* Header card */}
          <div className="flex flex-col items-center px-6 pb-4 text-center">
            <div className="w-24 h-24 rounded-full overflow-hidden mb-3 ring-2 ring-white shadow-sm">
              <img src={group.avatar_url || `https://picsum.photos/seed/${group.id}/200/200`} className="w-full h-full object-cover" />
            </div>
            <h2 className="text-[22px] font-bold text-[var(--ios-ink,#1C1C1E)] flex items-center gap-1.5">
              {group.name}
              {isChannel && <Icon name="Megaphone" size={16} className="text-[var(--ios-blue,#007AFF)]" />}
            </h2>
            <p className="text-[13px] text-[var(--ios-ink-3,#8E8E93)] mt-0.5">
              {group.members_count} {isChannel ? "subscribers" : "members"}
            </p>
            {group.description && <p className="text-[14px] text-[var(--ios-ink-2,#3A3A3C)] mt-3 leading-relaxed max-w-md">{group.description}</p>}
            {group.username && (
              <p className="text-[13px] text-[var(--ios-blue,#007AFF)] mt-2">@{group.username}</p>
            )}
          </div>

          {/* Tab bar */}
          <div className="px-3 mb-3">
            <div className="flex bg-[var(--ios-ink-5,#E5E5EA)] rounded-xl p-1 gap-0.5">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "flex-1 py-1.5 text-[12.5px] font-semibold rounded-lg transition-all flex items-center justify-center gap-1",
                    tab === t.id ? "bg-white text-[var(--ios-ink,#1C1C1E)] shadow-sm" : "text-[var(--ios-ink-3,#8E8E93)]"
                  )}
                >
                  <Icon name={t.icon} size={13} />
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-8"><Icon name="Loader2" size={22} className="animate-spin text-[var(--ios-blue,#007AFF)]" /></div>
          ) : (
            <div className="px-3">
              {tab === "members" && (
                <div className="bg-white rounded-2xl divide-y divide-[var(--ios-sep,#E5E5EA)] overflow-hidden">
                  {members.length === 0 && <p className="text-center py-8 text-[13px] text-[var(--ios-ink-3,#8E8E93)]">No members</p>}
                  {members.map((m) => (
                    <div key={m.user_id} className="flex items-center gap-3 px-4 py-2.5">
                      <Avatar src={m.user?.avatar_url} seed={m.user_id} size={40} />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-[14.5px] truncate text-[var(--ios-ink,#1C1C1E)]">{m.user?.display_name || "User"}</p>
                        <p className="text-[12px] text-[var(--ios-ink-3,#8E8E93)] truncate">@{m.user?.username || "unknown"}</p>
                      </div>
                      {m.role !== "member" && (
                        <span className={cn("text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full",
                          m.role === "owner" ? "bg-[var(--ios-orange,#FF9500)]/15 text-[var(--ios-orange,#FF9500)]" : "bg-[var(--ios-blue,#007AFF)]/15 text-[var(--ios-blue,#007AFF)]"
                        )}>{m.role}</span>
                      )}
                      {isAdmin && m.user_id !== meId && m.role !== "owner" && (
                        <div className="flex gap-0.5">
                          <button onClick={() => promote(m)} className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--ios-blue,#007AFF)] hover:bg-[var(--ios-blue,#007AFF)]/10">
                            <Icon name={m.role === "admin" ? "ShieldOff" : "Shield"} size={15} />
                          </button>
                          <button onClick={() => kick(m)} className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--ios-red,#FF3B30)] hover:bg-[var(--ios-red,#FF3B30)]/10">
                            <Icon name="UserMinus" size={15} />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {tab === "media" && (
                media.length === 0
                  ? <Empty icon="Image" label="No media yet" />
                  : (
                    <div className="grid grid-cols-3 gap-1">
                      {media.map((m) => (
                        <a key={m.id} href={m.media_url} target="_blank" rel="noreferrer" className="relative aspect-square overflow-hidden rounded-lg bg-black/5">
                          {m.type === "image"
                            ? <img src={m.media_url} className="w-full h-full object-cover" loading="lazy" />
                            : <video src={m.media_url} className="w-full h-full object-cover" muted playsInline />}
                          {m.type === "video" && (
                            <span className="absolute bottom-1 left-1 bg-black/55 text-white text-[10px] px-1.5 rounded">▶</span>
                          )}
                        </a>
                      ))}
                    </div>
                  )
              )}

              {tab === "links" && (
                links.length === 0
                  ? <Empty icon="Link" label="No links shared" />
                  : (
                    <div className="bg-white rounded-2xl divide-y divide-[var(--ios-sep,#E5E5EA)] overflow-hidden">
                      {links.map((l, i) => {
                        let host = ""; try { host = new URL(l.url).hostname.replace(/^www\./, ""); } catch {}
                        return (
                          <a key={i} href={l.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-4 py-3">
                            <div className="w-10 h-10 rounded-xl bg-[var(--ios-blue,#007AFF)]/10 text-[var(--ios-blue,#007AFF)] flex items-center justify-center shrink-0">
                              <Icon name="Link" size={16} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-[14px] font-semibold text-[var(--ios-ink,#1C1C1E)] truncate">{host || l.url}</p>
                              <p className="text-[12px] text-[var(--ios-ink-3,#8E8E93)] truncate">{l.url}</p>
                            </div>
                          </a>
                        );
                      })}
                    </div>
                  )
              )}

              {tab === "files" && (
                files.length === 0
                  ? <Empty icon="FileText" label="No files shared" />
                  : (
                    <div className="bg-white rounded-2xl divide-y divide-[var(--ios-sep,#E5E5EA)] overflow-hidden">
                      {files.map((f) => {
                        const name = f.media_meta?.name || "File";
                        const size = f.media_meta?.size as number | undefined;
                        const ext = (name.split(".").pop() || "").slice(0, 4).toUpperCase();
                        return (
                          <a key={f.id} href={f.media_url} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-4 py-3">
                            <div className="w-10 h-10 rounded-xl bg-[var(--ios-orange,#FF9500)]/15 text-[var(--ios-orange,#FF9500)] flex items-center justify-center text-[10px] font-bold shrink-0">{ext || "FILE"}</div>
                            <div className="min-w-0 flex-1">
                              <p className="text-[14px] font-semibold text-[var(--ios-ink,#1C1C1E)] truncate">{name}</p>
                              <p className="text-[12px] text-[var(--ios-ink-3,#8E8E93)]">{formatBytes(size)}</p>
                            </div>
                            <Icon name="Download" size={16} className="text-[var(--ios-ink-3,#8E8E93)]" />
                          </a>
                        );
                      })}
                    </div>
                  )
              )}

              {tab === "settings" && isAdmin && (
                <div className="space-y-3">
                  <div className="bg-white rounded-2xl divide-y divide-[var(--ios-sep,#E5E5EA)] overflow-hidden">
                    <SettingRow label="Public handle" >
                      <div className="flex items-center gap-1">
                        <span className="text-[var(--ios-ink-3,#8E8E93)] text-[14px]">@</span>
                        <input
                          value={publicHandle}
                          onChange={(e) => setPublicHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                          onBlur={() => saveSetting({ username: publicHandle || null })}
                          placeholder="handle"
                          className="bg-transparent outline-none text-[14px] text-right w-32"
                        />
                      </div>
                    </SettingRow>
                    {isChannel && (
                      <ToggleRow label="Sign messages" value={signMessages} onChange={(v) => { setSignMessages(v); saveSetting({ sign_messages: v }); }} />
                    )}
                    {!isChannel && (
                      <SettingRow label="Slow mode">
                        <select
                          value={slowMode}
                          onChange={(e) => { const v = parseInt(e.target.value); setSlowMode(v); saveSetting({ slow_mode_seconds: v }); }}
                          className="bg-transparent text-[14px] text-[var(--ios-blue,#007AFF)] outline-none"
                        >
                          {[0,10,30,60,300,900,3600].map((s) => (
                            <option key={s} value={s}>{s === 0 ? "Off" : s < 60 ? `${s}s` : s < 3600 ? `${s/60}m` : "1h"}</option>
                          ))}
                        </select>
                      </SettingRow>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between px-2 mb-1.5">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--ios-ink-3,#8E8E93)]">Invite Links</p>
                      <button onClick={newInvite} className="text-[12.5px] font-semibold text-[var(--ios-blue,#007AFF)] flex items-center gap-1">
                        <Icon name="Plus" size={13} /> New
                      </button>
                    </div>
                    <div className="bg-white rounded-2xl divide-y divide-[var(--ios-sep,#E5E5EA)] overflow-hidden">
                      {invites.length === 0 && <p className="text-center py-6 text-[13px] text-[var(--ios-ink-3,#8E8E93)]">No active invites</p>}
                      {invites.map((inv) => (
                        <div key={inv.id} className="flex items-center gap-3 px-4 py-3">
                          <Icon name="Link2" size={16} className="text-[var(--ios-blue,#007AFF)] shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-[13.5px] font-semibold truncate">{inviteUrl(inv.code)}</p>
                            <p className="text-[11.5px] text-[var(--ios-ink-3,#8E8E93)]">
                              {inv.uses || 0}{inv.max_uses ? `/${inv.max_uses}` : ""} uses
                              {inv.expires_at ? ` · expires ${new Date(inv.expires_at).toLocaleDateString()}` : ""}
                            </p>
                          </div>
                          <button onClick={() => navigator.clipboard?.writeText(inviteUrl(inv.code))} className="text-[var(--ios-blue,#007AFF)]"><Icon name="Copy" size={15} /></button>
                          <button onClick={() => dropInvite(inv.id)} className="text-[var(--ios-red,#FF3B30)]"><Icon name="Trash2" size={15} /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="px-3 mt-5">
            <button onClick={leave} className="w-full bg-white rounded-2xl py-3.5 text-[15.5px] font-semibold text-[var(--ios-red,#FF3B30)] flex items-center justify-center gap-2">
              <Icon name="LogOut" size={16} />
              {isChannel ? "Leave Channel" : "Leave Group"}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Empty({ icon, label }: { icon: any; label: string }) {
  return (
    <div className="text-center py-14 opacity-60">
      <Icon name={icon} size={36} className="mx-auto mb-2 text-[var(--ios-ink-3,#8E8E93)]" />
      <p className="text-[13px] text-[var(--ios-ink-3,#8E8E93)]">{label}</p>
    </div>
  );
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 gap-3">
      <span className="text-[14.5px] text-[var(--ios-ink,#1C1C1E)]">{label}</span>
      <div>{children}</div>
    </div>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)} className="flex items-center justify-between px-4 py-3 w-full">
      <span className="text-[14.5px] text-[var(--ios-ink,#1C1C1E)]">{label}</span>
      <span className={cn("w-12 h-7 rounded-full transition-colors relative", value ? "bg-[var(--ios-green,#34C759)]" : "bg-[var(--ios-ink-4,#C7C7CC)]")}>
        <span className="absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform" style={{ transform: value ? "translateX(20px)" : "translateX(0)" }} />
      </span>
    </button>
  );
}

function formatBytes(n?: number) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
