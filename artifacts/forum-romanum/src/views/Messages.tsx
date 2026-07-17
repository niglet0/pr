import React, { useState, useEffect } from "react";
import { Card, Avatar, Button, Icon, Badge, Skeleton, cn } from "../components/UI";
import { motion, AnimatePresence } from "motion/react";
import { supabase } from "../integrations/supabase/client";
import { ChatRoom, type ChatTarget } from "../components/chat/ChatRoom";
import { ChatListItem } from "../components/chat/ChatListItem";
import { timeAgo, previewIcon } from "../lib/chatUtils";
import { pinChat, unpinChat, muteChat, unmuteChat, getPinnedChats, getMutes, deleteConversation, leaveGroup } from "../lib/chatActions";
import { BotChat } from "../components/spqr/BotChat";

export function MessagesView({
  currentUser,
  forceAction,
  clearAction,
  onInChatChange,
  onOpenProfile,
}: {
  currentUser?: any;
  forceAction?: string | null;
  clearAction?: () => void;
  onInChatChange?: (v: boolean) => void;
  onOpenProfile?: (userId: string) => void;
}) {
  const [view, setView] = useState<"list" | "chat" | "bot">("list");
  const [target, setTarget] = useState<ChatTarget | null>(null);
  const [activeTab, setActiveTab] = useState<"chats" | "legions" | "directory" | "bots">("chats");
  const [conversations, setConversations] = useState<any[]>([]);
  const [joinedGroups, setJoinedGroups] = useState<any[]>([]);
  const [directory, setDirectory] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [isLaunchModalOpen, setIsLaunchModalOpen] = useState(false);
  const [launchName, setLaunchName] = useState("");
  const [launchDesc, setLaunchDesc] = useState("");
  const [launchType, setLaunchType] = useState<"group" | "channel">("group");
  const [launchImage, setLaunchImage] = useState("");
  const [launching, setLaunching] = useState(false);
  const [groupsFilter, setGroupsFilter] = useState<"All" | "Groups" | "Channels">("All");
  const [pinnedKeys, setPinnedKeys] = useState<Set<string>>(new Set());
  const [mutedMap, setMutedMap] = useState<Record<string, string | null>>({});

  const refreshChatMeta = async (userId: string) => {
    const [pins, mutes] = await Promise.all([getPinnedChats(userId), getMutes(userId)]);
    setPinnedKeys(new Set(pins.map((p: any) => `${p.chat_kind}:${p.chat_id}`)));
    setMutedMap(mutes);
  };

  useEffect(() => {
    if (forceAction === "open_bot") {
      setView("bot");
      onInChatChange?.(true);
      clearAction?.();
    } else if (forceAction === "launch_guild") {
      setActiveTab("legions");
      setIsLaunchModalOpen(true);
      clearAction?.();
    }
  }, [forceAction]);

  useEffect(() => {
    if (currentUser) {
      fetchConversations(currentUser.id);
      fetchDirectory(currentUser.id);
      fetchGroups();
      fetchMyGroups(currentUser.id);
      refreshChatMeta(currentUser.id);
    } else setLoading(false);

    const ch1 = supabase
      .channel("rt_conversations")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => {
        if (currentUser) fetchConversations(currentUser.id);
      })
      .subscribe();
    const ch2 = supabase
      .channel("rt_groups")
      .on("postgres_changes", { event: "*", schema: "public", table: "groups" }, () => {
        fetchGroups();
        if (currentUser) fetchMyGroups(currentUser.id);
      })
      .subscribe();
    const ch3 = supabase
      .channel("rt_my_membership")
      .on("postgres_changes", { event: "*", schema: "public", table: "group_members" }, () => {
        if (currentUser) fetchMyGroups(currentUser.id);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch1);
      supabase.removeChannel(ch2);
      supabase.removeChannel(ch3);
    };
  }, [currentUser?.id]);

  const fetchConversations = async (userId: string) => {
    try {
      const { data: convs } = await supabase
        .from("conversations")
        .select("*")
        .or(`participant_1.eq.${userId},participant_2.eq.${userId}`)
        .order("last_message_at", { ascending: false });
      if (!convs || convs.length === 0) {
        setConversations([]);
        setLoading(false);
        return;
      }
      const otherIds = convs.map((c: any) => (c.participant_1 === userId ? c.participant_2 : c.participant_1));
      const { data: users } = await supabase
        .from("users")
        .select("id, display_name, username, avatar_url, verified")
        .in("id", otherIds);
      const enriched = convs.map((c: any) => {
        const otherId = c.participant_1 === userId ? c.participant_2 : c.participant_1;
        return {
          ...c,
          otherUser: users?.find((u: any) => u.id === otherId),
          unread: c.participant_1 === userId ? c.unread_count_1 : c.unread_count_2,
        };
      });
      setConversations(enriched);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchMyGroups = async (userId: string) => {
    try {
      const { data: mem } = await supabase.from("group_members").select("group_id, unread_count, role").eq("user_id", userId);
      if (!mem) return;
      setMemberIds(new Set(mem.map((m: any) => m.group_id)));
      if (mem.length === 0) {
        setJoinedGroups([]);
        return;
      }
      const { data: gs } = await supabase.from("groups").select("*").in("id", mem.map((m: any) => m.group_id));
      const enriched = (gs || []).map((g: any) => ({
        ...g,
        _isGroup: true,
        unread: mem.find((m: any) => m.group_id === g.id)?.unread_count || 0,
      }));
      setJoinedGroups(enriched);
    } catch {}
  };

  const fetchDirectory = async (userId: string) => {
    try {
      const { data } = await supabase
        .from("users")
        .select("id, display_name, username, avatar_url, bio, verified")
        .neq("id", userId)
        .limit(50);
      if (data) setDirectory(data);
    } catch {}
  };

  const fetchGroups = async () => {
    try {
      const { data } = await supabase.from("groups").select("*").order("created_at", { ascending: false }).limit(100);
      if (data) setGroups(data);
    } catch {}
  };

  const startOrOpenChat = async (otherUser: any) => {
    if (!currentUser) return;
    const existing = conversations.find((c) => c.otherUser?.id === otherUser.id);
    if (existing) {
      setTarget({ type: "dm", conversation: existing, otherUser: existing.otherUser });
      setView("chat");
      onInChatChange?.(true);
      return;
    }
    // ordered pair to satisfy unique(participant_1, participant_2)
    const [p1, p2] = [currentUser.id, otherUser.id].sort();
    let { data } = await supabase.from("conversations").insert({ participant_1: p1, participant_2: p2 }).select().single();
    if (!data) {
      const { data: existingRow } = await supabase
        .from("conversations")
        .select("*")
        .or(`and(participant_1.eq.${p1},participant_2.eq.${p2})`)
        .single();
      data = existingRow;
    }
    if (data) {
      setTarget({ type: "dm", conversation: data, otherUser });
      setView("chat");
      onInChatChange?.(true);
    }
  };

  const openGroup = (group: any) => {
    setTarget({ type: "group", group });
    setView("chat");
    onInChatChange?.(true);
  };

  const handleCreateGroup = async () => {
    if (!currentUser || !launchName.trim()) return;
    setLaunching(true);
    const { data: newGroup } = await supabase
      .from("groups")
      .insert({
        owner_id: currentUser.id,
        name: launchName,
        description: launchDesc,
        is_channel: launchType === "channel",
        avatar_url: launchImage || `https://picsum.photos/seed/${encodeURIComponent(launchName)}/200/200`,
      })
      .select("*")
      .single();
    if (newGroup) {
      await supabase.from("group_members").insert({ group_id: newGroup.id, user_id: currentUser.id, role: "owner" });
      setIsLaunchModalOpen(false);
      setLaunchName("");
      setLaunchDesc("");
      setLaunchImage("");
      await fetchMyGroups(currentUser.id);
      openGroup({ ...newGroup, members_count: 1 });
    }
    setLaunching(false);
  };

  const handleJoinGroup = async (group: any, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentUser) return;
    try {
      await supabase.from("group_members").insert({ group_id: group.id, user_id: currentUser.id, role: "member" });
      setMemberIds((prev) => new Set(prev).add(group.id));
      await fetchMyGroups(currentUser.id);
      openGroup(group);
    } catch {}
  };

  // Merge DMs + joined groups into one chat list
  const chatItems = [
    ...conversations.map((c) => ({
      key: `c-${c.id}`,
      kind: "dm" as const,
      chatId: c.id,
      name: c.otherUser?.display_name || "Unknown",
      avatar: c.otherUser?.avatar_url,
      seed: c.otherUser?.username,
      preview: c.last_message_preview || "No messages yet",
      time: c.last_message_at,
      unread: c.unread || 0,
      previewType: c.last_message_type,
      verified: c.otherUser?.verified,
      raw: c,
    })),
    ...joinedGroups.map((g) => ({
      key: `g-${g.id}`,
      kind: "group" as const,
      chatId: g.id,
      name: g.name,
      avatar: g.avatar_url,
      seed: g.id,
      preview: g.last_message_preview || g.description || "No messages yet",
      time: g.last_message_at,
      unread: g.unread || 0,
      isChannel: g.is_channel,
      previewType: g.last_message_type,
      raw: g,
    })),
  ]
    .map((c: any) => ({
      ...c,
      pinned: pinnedKeys.has(`${c.kind}:${c.chatId}`),
      muted: (() => {
        const k = `${c.kind}:${c.chatId}`;
        if (!(k in mutedMap)) return false;
        const v = mutedMap[k];
        if (v === null) return true;
        return new Date(v).getTime() > Date.now();
      })(),
    }))
    .filter((c) => !search || c.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a: any, b: any) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.time || 0).getTime() - new Date(a.time || 0).getTime();
    });

  const handleChatAction = async (c: any, action: "pin" | "unpin" | "mute" | "unmute" | "archive" | "delete") => {
    const meId = currentUser?.id;
    if (!meId) return;
    const key = `${c.kind}:${c.chatId}`;
    if (action === "pin") {
      await pinChat(meId, c.kind, c.chatId);
      setPinnedKeys((p) => new Set(p).add(key));
    } else if (action === "unpin") {
      await unpinChat(meId, c.kind, c.chatId);
      setPinnedKeys((p) => { const n = new Set(p); n.delete(key); return n; });
    } else if (action === "mute") {
      await muteChat(meId, c.kind, c.chatId, null);
      setMutedMap((m) => ({ ...m, [key]: null }));
    } else if (action === "unmute") {
      await unmuteChat(meId, c.kind, c.chatId);
      setMutedMap((m) => { const n = { ...m }; delete n[key]; return n; });
    } else if (action === "delete") {
      if (c.kind === "dm") {
        if (!confirm("Delete this conversation?")) return;
        await deleteConversation(c.chatId);
        setConversations((prev) => prev.filter((x) => x.id !== c.chatId));
      } else {
        if (!confirm(`Leave ${c.raw.is_channel ? "channel" : "group"}?`)) return;
        await leaveGroup(c.chatId, meId);
        setJoinedGroups((prev) => prev.filter((x) => x.id !== c.chatId));
        setMemberIds((prev) => { const n = new Set(prev); n.delete(c.chatId); return n; });
      }
    }
  };

  const filteredGroups = groups.filter((g) => {
    if (groupsFilter === "Groups") return !g.is_channel;
    if (groupsFilter === "Channels") return g.is_channel;
    return true;
  });

  if (view === "chat" && target)
    return (
      <ChatRoom
        target={target}
        currentUser={currentUser}
        onOpenProfile={onOpenProfile}
        onBack={() => {
          setView("list");
          setTarget(null);
          onInChatChange?.(false);
          if (currentUser) {
            fetchConversations(currentUser.id);
            fetchMyGroups(currentUser.id);
            refreshChatMeta(currentUser.id);
          }
        }}
      />
    );
  if (view === "bot") return <BotChat onBack={() => { setView("list"); onInChatChange?.(false); }} />;

  return (
    <div className="space-y-4 pb-24">
      <div className="bg-[#FAF9F6] border border-[#E5E3DB] rounded-2xl p-3 flex items-center gap-3 shadow-sm">
        <Icon name="Search" size={18} color="#C5A059" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search communications…"
          className="bg-transparent border-none text-[14.5px] w-full font-medium placeholder:text-[#7A7A7A] outline-none"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
        {(["chats", "legions", "directory", "bots"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-5 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all shrink-0",
              activeTab === tab ? "bg-[#C5A059] text-white shadow-sm" : "bg-transparent text-[#7A7A7A] hover:bg-[#F3F1EC]"
            )}
          >
            {tab === "bots" ? "Oracles" : tab}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {loading &&
          activeTab === "chats" &&
          Array(4)
            .fill(0)
            .map((_, i) => (
              <Card key={`s-${i}`} className="p-3.5 flex gap-4 items-center">
                <Skeleton width={52} height={52} rounded={26} />
                <div className="flex-1 space-y-2">
                  <Skeleton width="60%" height={16} />
                  <Skeleton width="40%" height={12} />
                </div>
              </Card>
            ))}

        {/* CHATS — DMs + joined groups */}
        {activeTab === "chats" && !loading && (
          <>
            <div className="space-y-1.5 chat-ios">
              {chatItems.map((c: any) => (
                <ChatListItem
                  key={c.key}
                  name={c.name}
                  avatar={c.avatar}
                  seed={c.seed}
                  preview={c.preview}
                  time={c.time}
                  unread={c.unread}
                  previewType={c.previewType}
                  isGroup={c.kind === "group"}
                  isChannel={c.isChannel}
                  isPinned={c.pinned}
                  isMuted={c.muted}
                  verified={c.verified}
                  onOpen={() => {
                    if (c.kind === "dm") setTarget({ type: "dm", conversation: c.raw, otherUser: c.raw.otherUser });
                    else setTarget({ type: "group", group: c.raw });
                    setView("chat");
                    onInChatChange?.(true);
                  }}
                  onAction={(a) => handleChatAction(c, a)}
                />
              ))}
            </div>

            {chatItems.length === 0 && (
              <div className="text-center py-12 opacity-60 flex flex-col items-center">
                <Icon name="MessageSquare" size={42} className="mb-3 text-[#C5A059]" />
                <p className="text-sm font-bold uppercase tracking-widest">No active comms</p>
                <button onClick={() => setActiveTab("directory")} className="mt-4 text-[12px] font-bold uppercase tracking-widest text-[#C5A059]">
                  Find people →
                </button>
              </div>
            )}
          </>
        )}

        {/* LEGIONS — discover groups & channels */}
        {activeTab === "legions" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center px-1">
              <div className="flex bg-[#E5E3DB]/30 p-1 rounded-lg gap-1 border border-[#C5A059]/10">
                {(["All", "Groups", "Channels"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setGroupsFilter(f)}
                    className={cn(
                      "px-3 py-1 text-[10px] font-bold uppercase tracking-widest rounded-md transition-all",
                      groupsFilter === f ? "bg-[#FAF9F6] text-[#C5A059] shadow-sm" : "text-[#7A7A7A]"
                    )}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setIsLaunchModalOpen(true)}
                className="w-8 h-8 rounded-full bg-[#C5A059] text-white flex items-center justify-center active:scale-95 shadow-sm"
              >
                <Icon name="Plus" size={16} />
              </button>
            </div>

            {filteredGroups.length > 0 ? (
              filteredGroups.map((group) => {
                const joined = memberIds.has(group.id);
                return (
                  <Card key={group.id} className="p-4 rounded-3xl" onClick={() => (joined ? openGroup(group) : undefined)}>
                    <div className="flex gap-4">
                      <div className="w-16 h-16 rounded-2xl overflow-hidden border border-[#C5A059]/20 shrink-0">
                        <img src={group.avatar_url || `https://picsum.photos/seed/${group.id}/200/200`} className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start gap-2">
                          <h3 className="text-[16px] font-bold leading-tight mb-1 flex items-center gap-1.5">
                            {group.name}
                            {group.is_channel && <Icon name="Megaphone" size={13} className="text-[#C5A059]" />}
                          </h3>
                          {joined ? (
                            <span className="bg-[#10B981]/10 text-[#10B981] font-bold text-[10px] uppercase tracking-wider px-3 py-1.5 rounded-full shrink-0">Joined</span>
                          ) : (
                            <button onClick={(e) => handleJoinGroup(group, e)} className="bg-[#C5A059]/10 text-[#C5A059] font-bold text-[10px] uppercase tracking-wider px-3 py-1.5 rounded-full shrink-0 active:scale-95">
                              Join
                            </button>
                          )}
                        </div>
                        <p className="text-[13px] text-[#7A7A7A] line-clamp-2">{group.description}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <Icon name="Users" size={14} className="text-[#C5A059]" />
                          <span className="text-[10px] font-bold text-[#C5A059] uppercase tracking-wider">
                            {group.members_count} {group.is_channel ? "subscribers" : "members"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })
            ) : (
              <div className="text-center py-16 opacity-50 flex flex-col items-center">
                <Icon name="Layers" size={48} className="mb-4 text-[#C5A059]" />
                <p className="text-[13px] font-bold uppercase tracking-widest">No legions yet</p>
              </div>
            )}
          </div>
        )}

        {/* DIRECTORY — people */}
        {activeTab === "directory" && (
          <div className="space-y-3">
            {directory.length === 0 ? (
              <div className="text-center py-16 opacity-50">
                <Icon name="Users" size={48} className="mx-auto mb-4 text-[#C5A059]" />
                <p className="text-[13px] font-bold uppercase tracking-widest">Directory empty</p>
              </div>
            ) : (
              directory
                .filter((u) => !search || (u.display_name || "").toLowerCase().includes(search.toLowerCase()))
                .map((user) => (
                  <Card key={user.id} onClick={() => startOrOpenChat(user)} className="p-3.5 flex gap-4 items-center">
                    <Avatar src={user.avatar_url} seed={user.username} size={48} />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-[14.5px] truncate">{user.display_name}</div>
                      <p className="text-[11px] text-[#C5A059] font-bold uppercase tracking-widest">@{user.username}</p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => startOrOpenChat(user)}>
                      <Icon name="MessageCircle" size={16} />
                    </Button>
                  </Card>
                ))
            )}
          </div>
        )}

        {/* BOTS */}
        {activeTab === "bots" && (
          <Card onClick={() => { setView("bot"); onInChatChange?.(true); }} className="p-8 text-center space-y-4 border-[#8B5CF6]/30 border-2 bg-gradient-to-br from-[#8B5CF6]/5 to-transparent">
            <div className="w-16 h-16 rounded-full bg-[#8B5CF6] flex items-center justify-center mx-auto">
              <Icon name="Bot" size={32} color="white" />
            </div>
            <h3 className="font-black text-xl serif italic text-[#8B5CF6]">SPQR Oracle</h3>
            <Button variant="purple" onClick={() => { setView("bot"); onInChatChange?.(true); }}>
              Initiate Session
            </Button>
          </Card>
        )}
      </div>

      <AnimatePresence>
        {isLaunchModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-[#202020]/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center"
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="w-full max-w-[480px] bg-[#FAF9F6] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh] border border-[#C5A059]/20"
            >
              <div className="h-14 border-b border-[#C5A059]/10 flex items-center justify-between px-4 shrink-0">
                <button onClick={() => setIsLaunchModalOpen(false)} className="text-[#7A7A7A] font-bold text-[13px] uppercase tracking-widest">
                  Cancel
                </button>
                <span className="font-bold text-[14px] uppercase tracking-widest">Create New</span>
                <button onClick={handleCreateGroup} disabled={!launchName.trim() || launching} className="text-[#C5A059] font-bold text-[13px] uppercase tracking-widest disabled:opacity-50">
                  {launching ? "..." : "Create"}
                </button>
              </div>
              <div className="p-5 space-y-5 overflow-y-auto">
                <div className="flex bg-[#E5E3DB]/30 p-1 rounded-lg gap-1 border border-[#C5A059]/10">
                  {(["group", "channel"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setLaunchType(t)}
                      className={cn(
                        "flex-1 py-1.5 text-[12px] uppercase tracking-widest font-bold rounded-md transition-all",
                        launchType === t ? "bg-[#F3F1EC] text-[#C5A059] shadow-sm" : "text-[#7A7A7A]"
                      )}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-[#7A7A7A] -mt-2 px-1">
                  {launchType === "channel" ? "Channels broadcast to subscribers — only admins can post." : "Groups let every member chat together."}
                </p>
                <input
                  placeholder="Name"
                  value={launchName}
                  onChange={(e) => setLaunchName(e.target.value)}
                  className="w-full bg-[#FAF9F6] border border-[#C5A059]/20 rounded-xl px-4 py-3 text-[15px] outline-none"
                />
                <textarea
                  placeholder="Description"
                  value={launchDesc}
                  onChange={(e) => setLaunchDesc(e.target.value)}
                  className="w-full bg-[#FAF9F6] border border-[#C5A059]/20 rounded-xl px-4 py-3 text-[15px] outline-none min-h-[80px] resize-none"
                />
                <input
                  placeholder="Image URL (optional)"
                  value={launchImage}
                  onChange={(e) => setLaunchImage(e.target.value)}
                  className="w-full bg-[#FAF9F6] border border-[#C5A059]/20 rounded-xl px-4 py-3 text-[15px] outline-none"
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

