import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Icon, Button } from "./UI";
import { supabase } from "../integrations/supabase/client";

export function StoryComposer({
  open,
  onClose,
  currentUser,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  currentUser: any;
  onCreated?: () => void;
}) {
  const [url, setUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [link, setLink] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const reset = () => {
    setUrl("");
    setCaption("");
    setLink("");
    setErr("");
  };

  const submit = async () => {
    if (!currentUser || !url.trim()) {
      setErr("An image URL is required.");
      return;
    }
    setSaving(true);
    setErr("");
    const payload: any = { author_id: currentUser.id, media_url: url.trim() };
    if (caption.trim()) payload.caption = caption.trim();
    if (link.trim()) payload.link_url = link.trim();
    // Try with optional columns; fall back if schema rejects them
    let { error } = await supabase.from("stories").insert(payload);
    if (error && /column|schema/i.test(error.message)) {
      const r = await supabase
        .from("stories")
        .insert({ author_id: currentUser.id, media_url: url.trim() });
      error = r.error;
    }
    setSaving(false);
    if (error) {
      setErr(error.message);
      return;
    }
    reset();
    onCreated?.();
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[120] bg-black/40 backdrop-blur-sm flex items-end justify-center p-3"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 240 }}
            onClick={(e: any) => e.stopPropagation()}
            className="w-full max-w-[440px] bg-[#FAF9F6] rounded-t-[32px] p-6 shadow-2xl border border-[#C5A059]/30"
          >
            <div className="flex items-center justify-between mb-5">
              <button
                onClick={onClose}
                className="text-[#7A7A7A] font-bold uppercase tracking-widest text-[10px]"
              >
                Cancel
              </button>
              <h3 className="font-bold text-sm tracking-widest uppercase">New Story</h3>
              <button
                onClick={submit}
                disabled={saving || !url.trim()}
                className="text-white bg-[#C5A059] px-3 py-1.5 rounded-lg font-bold uppercase tracking-widest text-[10px] disabled:opacity-40"
              >
                {saving ? "Posting" : "Share"}
              </button>
            </div>

            <div className="aspect-[9/12] w-full rounded-2xl bg-[#202020] overflow-hidden mb-4 relative flex items-center justify-center">
              {url ? (
                <img
                  src={url}
                  alt="preview"
                  className="w-full h-full object-cover"
                  onError={() => setErr("Image failed to load.")}
                />
              ) : (
                <div className="text-center text-white/60 px-6">
                  <Icon name="Image" size={32} className="mx-auto mb-2" />
                  <p className="text-[11px] font-bold uppercase tracking-widest">
                    Paste an image URL below
                  </p>
                </div>
              )}
              {url && caption && (
                <div className="absolute bottom-3 left-3 right-3 text-white text-[13px] font-medium bg-black/40 backdrop-blur-md rounded-xl px-3 py-2">
                  {caption}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <label className="block">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#7A7A7A]">
                  Image URL
                </span>
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://…"
                  className="mt-1 w-full bg-white border border-[#E5E3DB] p-3 rounded-xl text-sm font-medium outline-none focus:border-[#C5A059]"
                />
              </label>
              <label className="block">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#7A7A7A]">
                  Caption (optional)
                </span>
                <input
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Say something…"
                  maxLength={120}
                  className="mt-1 w-full bg-white border border-[#E5E3DB] p-3 rounded-xl text-sm font-medium outline-none focus:border-[#C5A059]"
                />
              </label>
              <label className="block">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#7A7A7A]">
                  Link (optional)
                </span>
                <input
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder="https://your-link.com"
                  className="mt-1 w-full bg-white border border-[#E5E3DB] p-3 rounded-xl text-sm font-medium outline-none focus:border-[#C5A059]"
                />
              </label>
              {err && (
                <p className="text-red-500 text-[11px] font-bold text-center">{err}</p>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}