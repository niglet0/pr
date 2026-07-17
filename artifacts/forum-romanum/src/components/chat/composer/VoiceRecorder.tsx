import React, { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Icon, cn } from "../../UI";

type Phase = "recording" | "preview";

export function VoiceRecorder({
  onCancel,
  onSend,
}: {
  onCancel: () => void;
  onSend: (blob: Blob, durationSec: number, waveform: number[]) => void;
}) {
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);
  const [locked, setLocked] = useState(false);
  const [phase, setPhase] = useState<Phase>("recording");
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewDur, setPreviewDur] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playProg, setPlayProg] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const tickRef = useRef<any>(null);
  const animRef = useRef<number | null>(null);
  const startRef = useRef(Date.now());

  // ====== START RECORDING ======
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
        const rec = new MediaRecorder(stream, { mimeType: mime });
        rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
        rec.start(100);
        recRef.current = rec;

        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        src.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);

        const tick = () => {
          analyser.getByteFrequencyData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) sum += data[i];
          const avg = sum / data.length / 255;
          setLevels((l) => [...l.slice(-58), Math.max(0.05, Math.min(1, avg * 2.2))]);
          animRef.current = requestAnimationFrame(tick);
        };
        animRef.current = requestAnimationFrame(tick);

        startRef.current = Date.now();
        tickRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 200);
      } catch (e) {
        console.error("mic failed", e);
        onCancel();
      }
    })();
    return () => {
      cancelled = true;
      clearInterval(tickRef.current);
      if (animRef.current) cancelAnimationFrame(animRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioRef.current?.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ====== STOP & SEND helper ======
  const stopRecorderToBlob = (): Promise<{ blob: Blob; dur: number } | null> =>
    new Promise((resolve) => {
      const rec = recRef.current;
      if (!rec) { resolve(null); return; }
      const dur = (Date.now() - startRef.current) / 1000;
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        streamRef.current?.getTracks().forEach((t) => t.stop());
        clearInterval(tickRef.current);
        if (animRef.current) cancelAnimationFrame(animRef.current);
        resolve({ blob, dur });
      };
      try { rec.stop(); } catch { resolve(null); }
    });

  const sendNow = async () => {
    const r = await stopRecorderToBlob();
    if (!r) { onCancel(); return; }
    onSend(r.blob, r.dur, levels.length ? levels : [0.3]);
  };

  const goToPreview = async () => {
    const r = await stopRecorderToBlob();
    if (!r) { onCancel(); return; }
    setPreviewBlob(r.blob);
    setPreviewDur(r.dur);
    setPhase("preview");
  };

  const cancel = () => {
    try { recRef.current?.stop(); } catch {}
    streamRef.current?.getTracks().forEach((t) => t.stop());
    onCancel();
  };

  // ====== PREVIEW audio control ======
  useEffect(() => {
    if (phase !== "preview" || !previewBlob) return;
    const url = URL.createObjectURL(previewBlob);
    const a = new Audio(url);
    audioRef.current = a;
    a.ontimeupdate = () => setPlayProg(a.duration ? a.currentTime / a.duration : 0);
    a.onended = () => { setPlaying(false); setPlayProg(0); };
    a.onpause = () => setPlaying(false);
    a.onplay = () => setPlaying(true);
    return () => { a.pause(); URL.revokeObjectURL(url); audioRef.current = null; };
  }, [phase, previewBlob]);

  const togglePlay = () => {
    const a = audioRef.current; if (!a) return;
    if (a.paused) a.play().catch(() => {}); else a.pause();
  };

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  // ====================================================
  // PREVIEW UI
  // ====================================================
  if (phase === "preview" && previewBlob) {
    const pmm = String(Math.floor(previewDur / 60)).padStart(2, "0");
    const pss = String(Math.floor(previewDur % 60)).padStart(2, "0");
    return (
      <motion.div
        initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        className="flex items-center gap-2 px-3 py-2.5 bg-[var(--ios-bg-elev)] border-t border-[var(--ios-sep)] chat-ios"
      >
        <button
          onClick={onCancel}
          className="w-10 h-10 rounded-full bg-[var(--ios-bg-soft)] text-[var(--ios-red)] flex items-center justify-center ios-tap"
          aria-label="Delete recording"
        >
          <Icon name="Trash2" size={18} />
        </button>
        <div className="flex-1 flex items-center gap-2.5 px-3 py-2 rounded-full bg-[var(--ios-bg-soft)] min-w-0">
          <button
            onClick={togglePlay}
            className="w-8 h-8 rounded-full bg-[var(--ios-blue)] text-white flex items-center justify-center shrink-0 active:scale-95"
          >
            <Icon name={playing ? "Pause" : "Play"} size={14} className={playing ? "" : "ml-0.5"} />
          </button>
          <div className="flex-1 h-7 flex items-center gap-[2px]">
            {(levels.length ? levels : new Array(38).fill(0.4)).slice(-40).map((lv, i, arr) => {
              const pct = i / Math.max(1, arr.length - 1);
              const active = pct <= playProg;
              return (
                <span
                  key={i}
                  className="w-[2.5px] rounded-full"
                  style={{
                    height: `${Math.max(3, lv * 24)}px`,
                    background: active ? "var(--ios-blue)" : "var(--ios-ink-4)",
                  }}
                />
              );
            })}
          </div>
          <span className="text-[11.5px] tabular-nums font-medium text-[var(--ios-ink-3)] shrink-0">{pmm}:{pss}</span>
        </div>
        <button
          onClick={() => onSend(previewBlob, previewDur, levels.length ? levels : [0.3])}
          className="w-10 h-10 rounded-full bg-[var(--ios-blue)] text-white flex items-center justify-center ios-tap shadow-md active:scale-95"
          aria-label="Send recording"
        >
          <Icon name="ArrowUp" size={18} />
        </button>
      </motion.div>
    );
  }

  // ====================================================
  // RECORDING UI (with Lock button)
  // ====================================================
  return (
    <motion.div
      initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
      className="bg-[var(--ios-bg-elev)] border-t border-[var(--ios-sep)] chat-ios"
    >
      {!locked && (
        <div className="flex justify-center pt-2">
          <button
            onClick={() => setLocked(true)}
            className="flex flex-col items-center gap-1 text-[10.5px] font-bold tracking-wider uppercase text-[var(--ios-ink-3)] active:scale-95"
            aria-label="Lock recording"
          >
            <div className="w-9 h-9 rounded-full bg-[var(--ios-bg-soft)] border border-[var(--ios-sep)] flex items-center justify-center text-[var(--ios-blue)]">
              <Icon name="Lock" size={15} />
            </div>
            <span>Slide up to lock</span>
          </button>
        </div>
      )}
      <div className="flex items-center gap-3 px-3 py-2.5">
        <button onClick={cancel} className="text-[var(--ios-red)] font-medium text-[15px] ios-tap">
          Cancel
        </button>
        <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-full bg-[var(--ios-bg-soft)] min-w-0">
          <span className="w-2 h-2 rounded-full bg-[var(--ios-red)] animate-pulse" />
          <span className="text-[13px] tabular-nums font-medium text-[var(--ios-ink)] w-12">{mm}:{ss}</span>
          <div className="flex-1 flex items-center gap-[2px] h-6 overflow-hidden">
            {levels.slice(-50).map((lv, i) => (
              <span key={i} className="w-[2px] rounded-full bg-[var(--ios-blue)]" style={{ height: `${Math.max(2, lv * 22)}px` }} />
            ))}
          </div>
        </div>
        {locked ? (
          <>
            <button
              onClick={goToPreview}
              className="w-10 h-10 rounded-full bg-[var(--ios-bg-soft)] text-[var(--ios-blue)] flex items-center justify-center ios-tap"
              aria-label="Stop and preview"
            >
              <Icon name="Square" size={14} />
            </button>
            <button onClick={sendNow} className="w-10 h-10 rounded-full bg-[var(--ios-blue)] text-white flex items-center justify-center ios-tap shadow-md">
              <Icon name="ArrowUp" size={18} />
            </button>
          </>
        ) : (
          <button onClick={sendNow} className="w-10 h-10 rounded-full bg-[var(--ios-blue)] text-white flex items-center justify-center ios-tap shadow-md">
            <Icon name="ArrowUp" size={18} />
          </button>
        )}
      </div>
      {!locked && (
        <p className="text-center text-[10.5px] text-[var(--ios-ink-3)] pb-2">
          Tap <span className="font-bold">Send</span> to send · tap <span className="font-bold">Lock</span> to free your hand and preview
        </p>
      )}
      {/* unused locked flag silencer */}
      <span className="hidden">{cn(locked && "")}</span>
    </motion.div>
  );
}
