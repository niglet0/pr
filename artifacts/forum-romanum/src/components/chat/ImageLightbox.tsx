import React, { useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Icon } from "../UI";

export function ImageLightbox({ url, onClose }: { url: string | null; onClose: () => void }) {
  useEffect(() => {
    if (!url) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [url, onClose]);

  const download = async () => {
    if (!url) return;
    try {
      const r = await fetch(url);
      const blob = await r.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = url.split("/").pop() || "image";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch {
      window.open(url, "_blank");
    }
  };

  return (
    <AnimatePresence>
      {url && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="absolute inset-0 z-[90] bg-black/95 flex flex-col"
          onClick={onClose}
        >
          <div className="flex items-center justify-between px-3 py-3 text-white/90" onClick={(e) => e.stopPropagation()}>
            <button onClick={onClose} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center active:scale-95">
              <Icon name="X" size={20} />
            </button>
            <button onClick={download} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center active:scale-95">
              <Icon name="Download" size={18} />
            </button>
          </div>
          <motion.img
            initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
            src={url}
            className="flex-1 min-h-0 w-full object-contain select-none"
            draggable={false}
            onClick={(e) => e.stopPropagation()}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
