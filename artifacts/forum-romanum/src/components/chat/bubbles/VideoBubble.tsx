import React, { useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Icon, cn } from "../../UI";
import { fmtDuration } from "../../../lib/chatUtils";

function fmtSize(n?: number) {
  if (!n) return "";
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + " KB";
  return (n / 1024 / 1024).toFixed(1) + " MB";
}

export function VideoBubble({ url, meta }: { url: string; meta?: any; me?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState<number>(meta?.duration || 0);
  const [muted, setMuted] = useState(true);

  const toggle = (e?: React.SyntheticEvent) => {
    e?.stopPropagation();
    const v = ref.current; if (!v) return;
    if (v.paused) { v.play().catch(() => {}); setPlaying(true); }
    else { v.pause(); setPlaying(false); }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const v = ref.current; if (!v || !v.duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    v.currentTime = p * v.duration;
    setProgress(p);
  };

  return (
    <>
      <div className="relative w-[260px] max-w-full rounded-2xl overflow-hidden bg-black group">
        <video
          ref={ref}
          src={url}
          preload="metadata"
          playsInline
          muted={muted}
          onClick={toggle}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          onTimeUpdate={(e) => setProgress(e.currentTarget.duration ? e.currentTarget.currentTime / e.currentTarget.duration : 0)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => { setPlaying(false); setProgress(0); }}
          className="w-full max-h-[340px] object-cover block"
        />
        {/* Centered play overlay */}
        <button
          type="button"
          onClick={toggle}
          className={cn(
            "absolute inset-0 m-auto w-14 h-14 rounded-full backdrop-blur-md bg-black/35 border border-white/30 flex items-center justify-center text-white shadow-lg active:scale-95 transition-opacity",
            playing ? "opacity-0" : "opacity-100"
          )}
          style={{ left: 0, right: 0, top: 0, bottom: 0 }}
        >
          <Icon name={playing ? "Pause" : "Play"} size={22} className={playing ? "" : "ml-0.5"} />
        </button>

        {/* Top-right controls: mute + fullscreen */}
        <div className="absolute top-2 right-2 flex gap-1.5 opacity-90">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setMuted((m) => !m); if (ref.current) ref.current.muted = !muted; }}
            className="w-7 h-7 rounded-full bg-black/45 backdrop-blur-md text-white flex items-center justify-center active:scale-95"
          >
            <Icon name={muted ? "VolumeX" : "Volume2"} size={13} />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); ref.current?.pause(); setPlaying(false); setOpen(true); }}
            className="w-7 h-7 rounded-full bg-black/45 backdrop-blur-md text-white flex items-center justify-center active:scale-95"
          >
            <Icon name="Maximize2" size={13} />
          </button>
        </div>

        {/* Bottom meta + scrubber */}
        <div className="absolute left-0 right-0 bottom-0 px-2 pt-6 pb-2 bg-gradient-to-t from-black/70 to-transparent">
          <div className="flex items-end justify-between text-[10.5px] text-white/90 font-medium mb-1">
            <span className="bg-black/45 rounded-full px-1.5 py-0.5 tabular-nums">{fmtDuration(duration || 0)}</span>
            {meta?.size && <span className="bg-black/45 rounded-full px-1.5 py-0.5 tabular-nums">{fmtSize(meta.size)}</span>}
          </div>
          <div onClick={seek} className="h-1.5 bg-white/20 rounded-full cursor-pointer overflow-hidden">
            <div className="h-full bg-[#C5A059]" style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black flex flex-col"
            onClick={() => setOpen(false)}
          >
            <div className="flex justify-end p-3">
              <button onClick={() => setOpen(false)} className="w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center active:scale-95">
                <Icon name="X" size={20} />
              </button>
            </div>
            <video src={url} controls autoPlay playsInline className="flex-1 min-h-0 w-full" onClick={(e) => e.stopPropagation()} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
