import React, { useEffect, useRef, useState } from "react";
import { Icon, cn } from "../../UI";

function fmt(s: number) {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const ss = String(Math.floor(s % 60)).padStart(2, "0");
  return `${m}:${ss}`;
}

export function VoiceBubble({ url, meta, me }: { url: string; meta?: any; me?: boolean }) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1
  const [current, setCurrent] = useState(0);
  const [dur, setDur] = useState<number>(Number(meta?.duration) || 0);
  const [rate, setRate] = useState<number>(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const wf: number[] = Array.isArray(meta?.waveform) && meta.waveform.length
    ? meta.waveform
    : new Array(36).fill(0).map((_, i) => 0.35 + 0.4 * Math.abs(Math.sin(i * 0.9)));

  useEffect(() => {
    const a = new Audio(url);
    a.preload = "metadata";
    audioRef.current = a;
    a.onloadedmetadata = () => { if (isFinite(a.duration)) setDur(a.duration); };
    a.ontimeupdate = () => {
      setCurrent(a.currentTime);
      setProgress(a.duration ? a.currentTime / a.duration : 0);
    };
    a.onended = () => { setPlaying(false); setProgress(0); setCurrent(0); };
    a.onpause = () => setPlaying(false);
    a.onplay = () => setPlaying(true);
    return () => { a.pause(); a.src = ""; audioRef.current = null; };
  }, [url]);

  const toggle = () => {
    const a = audioRef.current; if (!a) return;
    if (a.paused) a.play().catch(() => {}); else a.pause();
  };

  const seekAt = (clientX: number) => {
    const a = audioRef.current; const el = barRef.current;
    if (!a || !el || !a.duration || !isFinite(a.duration)) return;
    const rect = el.getBoundingClientRect();
    const r = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    a.currentTime = r * a.duration;
    setProgress(r);
  };

  const cycleRate = () => {
    const a = audioRef.current; if (!a) return;
    const next = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1;
    a.playbackRate = next;
    setRate(next);
  };

  return (
    <div className="flex items-center gap-2.5 min-w-[220px] py-0.5">
      <button
        onClick={toggle}
        className={cn(
          "w-10 h-10 rounded-full flex items-center justify-center shrink-0 shadow-sm active:scale-95 transition",
          me ? "bg-white/25 text-white" : "bg-[var(--ios-blue)] text-white"
        )}
      >
        <Icon name={playing ? "Pause" : "Play"} size={18} className={playing ? "" : "ml-0.5"} />
      </button>
      <div className="flex-1 min-w-0">
        <div
          ref={barRef}
          onClick={(e) => seekAt(e.clientX)}
          onTouchStart={(e) => seekAt(e.touches[0].clientX)}
          onTouchMove={(e) => seekAt(e.touches[0].clientX)}
          className="h-8 flex items-center gap-[2.5px] cursor-pointer touch-none"
        >
          {wf.slice(0, 40).map((v, i) => {
            const pct = i / Math.max(1, Math.min(40, wf.length) - 1);
            const active = pct <= progress;
            return (
              <span
                key={i}
                className="w-[2.5px] rounded-full transition-colors"
                style={{
                  height: `${Math.max(4, v * 26)}px`,
                  background: active
                    ? (me ? "rgba(255,255,255,1)" : "var(--ios-blue)")
                    : (me ? "rgba(255,255,255,0.40)" : "var(--ios-ink-4)"),
                }}
              />
            );
          })}
        </div>
        <div className={cn("flex items-center justify-between text-[10.5px] mt-0.5 tabular-nums", me ? "text-white/85" : "text-[var(--ios-ink-3)]")}>
          <span>{fmt(playing || current > 0 ? current : dur)}</span>
          <button
            onClick={(e) => { e.stopPropagation(); cycleRate(); }}
            className={cn(
              "px-1.5 py-0.5 rounded-full font-bold text-[10px]",
              me ? "bg-white/25 text-white" : "bg-[var(--ios-blue-soft)] text-[var(--ios-blue)]"
            )}
          >
            {rate}x
          </button>
        </div>
      </div>
    </div>
  );
}
