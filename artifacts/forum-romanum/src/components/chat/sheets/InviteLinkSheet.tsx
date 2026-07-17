import React, { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Icon } from "../../UI";
import { createInviteLink, inviteUrl, listInvites, revokeInvite } from "../../../lib/chatActions";

export function InviteLinkSheet({ groupId, meId, onClose }: { groupId: string; meId: string; onClose: () => void }) {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);

  const reload = async () => { setLoading(true); setList(await listInvites(groupId)); setLoading(false); };
  useEffect(() => { reload(); }, [groupId]);

  const create = async () => {
    const inv = await createInviteLink(groupId, meId, {});
    if (inv) reload();
  };
  const copy = async (code: string) => {
    try { await navigator.clipboard.writeText(inviteUrl(code)); setCopied(code); setTimeout(() => setCopied(null), 1200); } catch {}
  };
  const revoke = async (id: string) => { await revokeInvite(id); reload(); };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 z-[90] bg-black/40 flex items-end chat-ios">
      <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 28, stiffness: 280 }} onClick={(e) => e.stopPropagation()} className="w-full bg-[var(--ios-bg-soft)] rounded-t-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-[var(--ios-sep)] flex items-center justify-between">
          <button onClick={onClose} className="text-[var(--ios-blue)] text-[15px] font-medium">Close</button>
          <h3 className="font-bold text-[15px]">Invite links</h3>
          <button onClick={create} className="text-[var(--ios-blue)] text-[15px] font-bold">+ New</button>
        </div>
        <div className="p-3 space-y-2 overflow-y-auto pb-8">
          {loading && <p className="text-center text-[13px] text-[var(--ios-ink-3)] py-6">Loading…</p>}
          {!loading && list.length === 0 && <p className="text-center text-[13px] text-[var(--ios-ink-3)] py-6">No links yet. Tap “+ New” to create one.</p>}
          {list.map((inv) => (
            <div key={inv.id} className="bg-white rounded-2xl p-3 flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-mono truncate">{inviteUrl(inv.code)}</p>
                <p className="text-[11px] text-[var(--ios-ink-3)] mt-0.5">{inv.uses || 0} uses{inv.max_uses ? ` / ${inv.max_uses}` : ""}{inv.expires_at ? ` · expires ${new Date(inv.expires_at).toLocaleDateString()}` : ""}</p>
              </div>
              <button onClick={() => copy(inv.code)} className="w-9 h-9 rounded-full bg-[var(--ios-blue-soft)] text-[var(--ios-blue)] flex items-center justify-center ios-tap">
                <Icon name={copied === inv.code ? "Check" : "Copy"} size={15} />
              </button>
              <button onClick={() => revoke(inv.id)} className="w-9 h-9 rounded-full bg-[var(--ios-red)]/10 text-[var(--ios-red)] flex items-center justify-center ios-tap">
                <Icon name="Trash2" size={15} />
              </button>
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
