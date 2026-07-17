import { supabase } from "../integrations/supabase/client";

// Best-effort presence heartbeat using user_presence table.
// Falls back silently if the table isn't writable.
let timer: any = null;
let activeUserId: string | null = null;

async function touch(uid: string) {
  try {
    await supabase
      .from("user_presence")
      .upsert({ user_id: uid, last_seen_at: new Date().toISOString(), is_online: true }, { onConflict: "user_id" });
  } catch {}
}

export function startPresence(userId: string) {
  if (timer && activeUserId === userId) return;
  stopPresence();
  activeUserId = userId;
  touch(userId);
  timer = setInterval(() => touch(userId), 30000);
  const onVis = () => {
    if (document.visibilityState === "visible" && activeUserId) touch(activeUserId);
  };
  document.addEventListener("visibilitychange", onVis);
}

export function stopPresence() {
  if (timer) clearInterval(timer);
  timer = null;
  if (activeUserId) {
    supabase
      .from("user_presence")
      .upsert({ user_id: activeUserId, last_seen_at: new Date().toISOString(), is_online: false }, { onConflict: "user_id" })
      .then(() => {});
  }
  activeUserId = null;
}

export async function getPresence(userIds: string[]) {
  if (!userIds.length) return {};
  const { data } = await supabase.from("user_presence").select("*").in("user_id", userIds);
  const map: Record<string, { last_seen_at: string; is_online: boolean }> = {};
  (data || []).forEach((r: any) => {
    map[r.user_id] = { last_seen_at: r.last_seen_at, is_online: r.is_online };
  });
  return map;
}
