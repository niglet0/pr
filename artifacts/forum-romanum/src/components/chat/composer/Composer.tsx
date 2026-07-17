import React, { useRef, useState, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Icon, cn } from "../../UI";
import { QUICK_EMOJIS } from "../../../lib/chatUtils";
import { AttachMenu, type AttachKind } from "./AttachMenu";
import { VoiceRecorder } from "./VoiceRecorder";
import { PollComposer } from "./PollComposer";
import { MentionAutocomplete } from "./MentionAutocomplete";

export type SendPayload =
  | { type: "text"; content: string }
  | { type: "image" | "video" | "file"; file: File }
  | { type: "voice"; blob: Blob; duration: number; waveform: number[] }
  | { type: "poll"; question: string; options: string[]; multiple: boolean; anonymous: boolean };

export function Composer({
  onSend,
  onTyping,
  disabled,
  placeholder = "Message",
  editingText,
  onEditDone,
  onEditCancel,
  showPoll = true,
  groupMembers = [],
}: {
  onSend: (p: SendPayload) => Promise<void> | void;
  onTyping?: () => void;
  disabled?: boolean;
  placeholder?: string;
  editingText?: string | null;
  onEditDone?: (text: string) => void;
  onEditCancel?: () => void;
  showPoll?: boolean;
  groupMembers?: { id: string; display_name?: string; username?: string; avatar_url?: string }[];
}) {
  const [text, setText] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [showAttach, setShowAttach] = useState(false);
  const [showPollSheet, setShowPollSheet] = useState(false);
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [mentionQ, setMentionQ] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [fileAccept, setFileAccept] = useState("image/*");
  const fileKindRef = useRef<"image" | "video" | "file">("image");

  useEffect(() => {
    if (editingText != null) {
      setText(editingText);
      taRef.current?.focus();
    }
  }, [editingText]);

  // grow textarea
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 130) + "px";
  }, [text]);

  // detect @ mention prefix
  useEffect(() => {
    const ta = taRef.current;
    if (!ta || !groupMembers.length) { setMentionQ(null); return; }
    const pos = ta.selectionStart || text.length;
    const before = text.slice(0, pos);
    const m = before.match(/@([\w]{0,24})$/);
    setMentionQ(m ? m[1] : null);
  }, [text, groupMembers.length]);

  const matched = mentionQ != null
    ? groupMembers.filter((u) => (u.username || "").toLowerCase().includes(mentionQ.toLowerCase()) || (u.display_name || "").toLowerCase().includes(mentionQ.toLowerCase()))
    : [];

  const pickMention = (u: any) => {
    const ta = taRef.current; if (!ta) return;
    const pos = ta.selectionStart || text.length;
    const before = text.slice(0, pos).replace(/@\w*$/, `@${u.username || u.display_name || "user"} `);
    const after = text.slice(pos);
    setText(before + after);
    setMentionQ(null);
    setTimeout(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = before.length; }, 0);
  };

  const handleSend = async () => {
    const t = text.trim();
    // keep keyboard open — re-focus textarea immediately
    const refocus = () => {
      const ta = taRef.current;
      if (!ta) return;
      ta.focus({ preventScroll: true } as any);
      try { ta.setSelectionRange(0, 0); } catch {}
    };
    if (editingText != null) {
      if (t) onEditDone?.(t);
      setText("");
      refocus();
      return;
    }
    if (!t) return;
    setText("");
    refocus();
    await onSend({ type: "text", content: t });
    refocus();
  };

  const pickAttach = (kind: AttachKind) => {
    if (kind === "poll") { setShowPollSheet(true); return; }
    if (kind === "location" || kind === "contact") return; // placeholder
    fileKindRef.current = kind === "photo" ? "image" : kind === "video" ? "video" : "file";
    setFileAccept(kind === "photo" ? "image/*" : kind === "video" ? "video/*" : "*/*");
    setTimeout(() => fileRef.current?.click(), 50);
  };

  const onFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.currentTarget.value = "";
    if (!f) return;
    setUploading(true);
    try { await onSend({ type: fileKindRef.current as any, file: f }); }
    finally { setUploading(false); }
  };

  if (recording) {
    return (
      <VoiceRecorder
        onCancel={() => setRecording(false)}
        onSend={async (blob, dur, wf) => { setRecording(false); await onSend({ type: "voice", blob, duration: dur, waveform: wf }); }}
      />
    );
  }

  const canSend = !!text.trim() || editingText != null;
  const isEditing = editingText != null;

  return (
    <div className="bg-[var(--ios-bg-elev)] border-t border-[var(--ios-sep)] shrink-0 relative chat-ios">
      <AnimatePresence>
        {showEmoji && (
          <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden border-b border-[var(--ios-sep)]">
            <div className="grid grid-cols-10 gap-1 p-3">
              {QUICK_EMOJIS.map((e) => (
                <button key={e} onClick={() => setText((v) => v + e)} className="text-xl ios-tap">{e}</button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>{matched.length > 0 && <MentionAutocomplete users={matched} onPick={pickMention} />}</AnimatePresence>

      <div className="p-2 pb-6 flex items-end gap-2">
        {!isEditing && (
          <button onClick={() => setShowAttach(true)} disabled={disabled || uploading} className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--ios-blue)] ios-tap disabled:opacity-40 shrink-0">
            <Icon name={uploading ? "Loader2" : "Plus"} size={22} className={uploading ? "animate-spin" : ""} />
          </button>
        )}
        {isEditing && (
          <button onClick={() => { onEditCancel?.(); setText(""); }} className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--ios-red)] ios-tap shrink-0">
            <Icon name="X" size={20} />
          </button>
        )}
        <input ref={fileRef} type="file" accept={fileAccept} className="hidden" onChange={onFileChosen} />

        <div className="flex-1 bg-[var(--ios-bg-soft)] rounded-3xl flex items-end pl-3 pr-1 py-1 min-h-[36px] border border-transparent focus-within:border-[var(--ios-blue)]/30">
          <button onClick={() => setShowEmoji((v) => !v)} className={cn("w-7 h-7 rounded-full flex items-center justify-center mb-1 -ml-1 mr-1 shrink-0", showEmoji ? "text-[var(--ios-blue)]" : "text-[var(--ios-ink-3)]")}>
            <Icon name="Smile" size={20} />
          </button>
          <textarea
            ref={taRef}
            value={text}
            disabled={disabled}
            rows={1}
            onChange={(e) => { setText(e.target.value); onTyping?.(); }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder={isEditing ? "Edit message…" : placeholder}
            className="flex-1 bg-transparent outline-none py-1.5 text-[15.5px] resize-none max-h-32 no-scrollbar leading-snug placeholder:text-[var(--ios-ink-3)]"
          />
        </div>

        <ActionButton
          canSend={canSend}
          isEditing={isEditing}
          disabled={disabled}
          onSend={handleSend}
          onHoldStart={() => setRecording(true)}
        />
      </div>

      <AnimatePresence>
        {showAttach && <AttachMenu enablePoll={showPoll} onPick={pickAttach} onClose={() => setShowAttach(false)} />}
      </AnimatePresence>
      <AnimatePresence>
        {showPollSheet && (
          <PollComposer
            onClose={() => setShowPollSheet(false)}
            onCreate={async (d) => { setShowPollSheet(false); await onSend({ type: "poll", ...d }); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Single, stable action button.
 * - canSend  → tap = send (uses onClick; pointerdown preventDefault keeps the keyboard focus)
 * - !canSend → long-press (200ms) = start voice recording. A quick tap shows a hint and does NOT open the recorder.
 *
 * Stable identity prevents iOS from firing a synthetic mousedown on a freshly-swapped element
 * (which previously opened the recorder after sending a message).
 */
function ActionButton({
  canSend, isEditing, disabled, onSend, onHoldStart,
}: {
  canSend: boolean;
  isEditing: boolean;
  disabled?: boolean;
  onSend: () => void;
  onHoldStart: () => void;
}) {
  const HOLD_MS = 220;
  const holdTimer = useRef<any>(null);
  const triggered = useRef(false);
  const [hint, setHint] = useState(false);

  const clearHold = () => { if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; } };

  const onPointerDown = (e: React.PointerEvent) => {
    // Always keep textarea focus on mobile (don't blur the input).
    e.preventDefault();
    if (canSend) return; // tap = send (handled by onClick)
    triggered.current = false;
    clearHold();
    holdTimer.current = setTimeout(() => {
      triggered.current = true;
      onHoldStart();
    }, HOLD_MS);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (canSend) return;
    clearHold();
    if (!triggered.current) {
      // quick tap on mic — show hint instead of opening recorder
      setHint(true);
      setTimeout(() => setHint(false), 1400);
    }
  };
  const onPointerCancel = () => { clearHold(); };

  return (
    <div className="relative shrink-0">
      {hint && !canSend && (
        <div className="absolute -top-9 right-0 whitespace-nowrap text-[11px] font-medium bg-black/80 text-white px-2 py-1 rounded-lg shadow">
          Hold to record
        </div>
      )}
      <button
        type="button"
        disabled={disabled}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerLeave={onPointerCancel}
        onClick={(e) => { e.preventDefault(); if (canSend) onSend(); }}
        className="w-9 h-9 rounded-full bg-[var(--ios-blue)] flex items-center justify-center text-white ios-tap shadow disabled:opacity-40"
      >
        <Icon name={canSend ? (isEditing ? "Check" : "ArrowUp") : "Mic"} size={18} />
      </button>
    </div>
  );
}
