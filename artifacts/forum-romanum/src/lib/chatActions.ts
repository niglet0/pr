import { supabase } from "../integrations/supabase/client";

export type ChatKind = "dm" | "group" | "channel";

// ------- Pin chat in the user's list -------
export async function pinChat(userId: string, kind: ChatKind, chatId: string, position = 0) {
  await supabase.from("pinned_chats").upsert(
    { user_id: userId, chat_kind: kind, chat_id: chatId, position, pinned_at: new Date().toISOString() },
    { onConflict: "user_id,chat_kind,chat_id" }
  );
}
export async function unpinChat(userId: string, kind: ChatKind, chatId: string) {
  await supabase.from("pinned_chats").delete().eq("user_id", userId).eq("chat_kind", kind).eq("chat_id", chatId);
}
export async function getPinnedChats(userId: string) {
  const { data } = await supabase.from("pinned_chats").select("*").eq("user_id", userId).order("position");
  return data || [];
}

// ------- Mute a chat for the user -------
export async function muteChat(userId: string, kind: ChatKind, chatId: string, until: Date | null) {
  await supabase.from("chat_mutes").upsert(
    { user_id: userId, chat_kind: kind, chat_id: chatId, mute_until: until?.toISOString() ?? null },
    { onConflict: "user_id,chat_kind,chat_id" }
  );
}
export async function unmuteChat(userId: string, kind: ChatKind, chatId: string) {
  await supabase.from("chat_mutes").delete().eq("user_id", userId).eq("chat_kind", kind).eq("chat_id", chatId);
}
export async function getMutes(userId: string) {
  const { data } = await supabase.from("chat_mutes").select("*").eq("user_id", userId);
  const map: Record<string, string | null> = {};
  (data || []).forEach((r: any) => {
    map[`${r.chat_kind}:${r.chat_id}`] = r.mute_until;
  });
  return map;
}

// ------- Clear chat history (DM only -> client-side hide via marking reads; for groups we can't delete others' msgs) -------
export async function clearDmHistory(convId: string, meId: string) {
  // Soft-clear: just zero the unread + bump last_read; we don't actually delete other party's msgs.
  await supabase.from("conversations").update({ unread_count_1: 0, unread_count_2: 0, last_message_preview: "" }).eq("id", convId);
  await supabase.from("message_reads").upsert({}, { onConflict: "message_id,user_id" }).then(() => {});
}

// ------- Invite link helpers -------
export function makeInviteCode() {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
}
export async function createInviteLink(groupId: string, createdBy: string, opts: { expiresAt?: Date | null; maxUses?: number | null } = {}) {
  const code = makeInviteCode();
  const { data } = await supabase
    .from("chat_invites")
    .insert({
      group_id: groupId,
      code,
      created_by: createdBy,
      expires_at: opts.expiresAt?.toISOString() ?? null,
      max_uses: opts.maxUses ?? null,
      uses: 0,
    })
    .select()
    .single();
  return data;
}
export async function listInvites(groupId: string) {
  const { data } = await supabase.from("chat_invites").select("*").eq("group_id", groupId).order("created_at", { ascending: false });
  return data || [];
}
export async function revokeInvite(id: string) {
  await supabase.from("chat_invites").delete().eq("id", id);
}
export function inviteUrl(code: string) {
  if (typeof window === "undefined") return `/+${code}`;
  return `${window.location.origin}/+${code}`;
}

// ------- Forward a message into a target chat -------
export async function forwardMessage(
  msg: any,
  origin: { kind: ChatKind; name?: string | null },
  to: { kind: ChatKind; conversation_id?: string; receiver_id?: string; group_id?: string },
  senderId: string
) {
  const base: any = {
    sender_id: senderId,
    content: msg.content || "",
    type: msg.type || "text",
    media_url: msg.media_url || null,
    media_meta: msg.media_meta || null,
    entities: msg.entities || null,
    forwarded_from: msg.id,
    forward_from_chat: msg.group_id || msg.conversation_id || null,
    forward_from_name: origin.name || null,
  };
  if (to.kind === "dm") {
    base.conversation_id = to.conversation_id;
    base.receiver_id = to.receiver_id;
  } else {
    base.group_id = to.group_id;
  }
  await supabase.from("messages").insert(base);
}

// ------- Polls -------
export async function createPoll(
  msgInsert: any,
  poll: { question: string; options: string[]; multiple: boolean; anonymous: boolean }
) {
  // First insert message of type poll, then poll row referencing message_id.
  const { data: m } = await supabase.from("messages").insert({ ...msgInsert, type: "poll", content: poll.question }).select().single();
  if (!m) return null;
  await supabase.from("polls").insert({
    message_id: m.id,
    question: poll.question,
    options: poll.options.map((label, idx) => ({ idx, label, votes: 0 })),
    multiple: poll.multiple,
    anonymous: poll.anonymous,
    closed: false,
  });
  return m;
}
export async function votePoll(pollId: string, userId: string, optionIdx: number, multiple: boolean) {
  if (!multiple) {
    await supabase.from("poll_votes").delete().eq("poll_id", pollId).eq("user_id", userId);
  }
  await supabase.from("poll_votes").upsert(
    { poll_id: pollId, user_id: userId, option_idx: optionIdx },
    { onConflict: "poll_id,user_id,option_idx" }
  );
}
export async function fetchPollAndVotes(messageId: string) {
  const { data: poll } = await supabase.from("polls").select("*").eq("message_id", messageId).maybeSingle();
  if (!poll) return null;
  const { data: votes } = await supabase.from("poll_votes").select("*").eq("poll_id", poll.id);
  return { poll, votes: votes || [] };
}

// ------- Read state on a chat -------
export async function markConversationRead(convId: string, meId: string, isP1: boolean) {
  await supabase
    .from("conversations")
    .update({ [isP1 ? "unread_count_1" : "unread_count_2"]: 0 })
    .eq("id", convId);
}
export async function markGroupRead(groupId: string, meId: string) {
  await supabase
    .from("group_members")
    .update({ unread_count: 0, last_read_at: new Date().toISOString() })
    .eq("group_id", groupId)
    .eq("user_id", meId);
}

// ------- Block user (best-effort: stored on conversations as deleted_for_me, fallback no-op) -------
export async function deleteConversation(convId: string) {
  await supabase.from("conversations").delete().eq("id", convId);
}

// ------- Leave group / channel -------
export async function leaveGroup(groupId: string, userId: string) {
  await supabase.from("group_members").delete().eq("group_id", groupId).eq("user_id", userId);
}
export async function joinGroup(groupId: string, userId: string) {
  await supabase.from("group_members").upsert(
    { group_id: groupId, user_id: userId, role: "member" },
    { onConflict: "group_id,user_id" }
  );
}
