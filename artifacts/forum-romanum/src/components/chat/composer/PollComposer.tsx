import React, { useState } from "react";
import { motion } from "motion/react";
import { Icon } from "../../UI";

export function PollComposer({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (data: { question: string; options: string[]; multiple: boolean; anonymous: boolean }) => void;
}) {
  const [q, setQ] = useState("");
  const [opts, setOpts] = useState<string[]>(["", ""]);
  const [multiple, setMultiple] = useState(false);
  const [anonymous, setAnonymous] = useState(true);

  const valid = q.trim().length > 0 && opts.filter((o) => o.trim()).length >= 2;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 z-[80] bg-black/40 flex items-end chat-ios">
      <motion.div
        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 280 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full bg-[var(--ios-bg-soft)] rounded-t-3xl max-h-[88vh] overflow-y-auto"
      >
        <div className="sticky top-0 bg-[var(--ios-bg-soft)] flex items-center justify-between px-4 py-3 border-b border-[var(--ios-sep)]">
          <button onClick={onClose} className="text-[15px] text-[var(--ios-blue)] font-medium ios-tap">Cancel</button>
          <h3 className="font-bold text-[15px]">New Poll</h3>
          <button
            disabled={!valid}
            onClick={() => onCreate({ question: q.trim(), options: opts.map((o) => o.trim()).filter(Boolean), multiple, anonymous })}
            className="text-[15px] font-bold text-[var(--ios-blue)] disabled:text-[var(--ios-ink-4)] ios-tap"
          >Create</button>
        </div>

        <div className="p-4 space-y-3">
          <div className="bg-white rounded-2xl px-4 py-3">
            <p className="text-[11px] uppercase font-bold tracking-widest text-[var(--ios-ink-3)] mb-1.5">Question</p>
            <textarea
              value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Ask something…" rows={2}
              className="w-full bg-transparent outline-none text-[15px] resize-none"
            />
          </div>

          <div className="bg-white rounded-2xl divide-y divide-[var(--ios-sep)] overflow-hidden">
            {opts.map((o, i) => (
              <div key={i} className="flex items-center px-4 py-2.5 gap-2">
                <input
                  value={o}
                  onChange={(e) => setOpts((p) => p.map((x, idx) => (idx === i ? e.target.value : x)))}
                  placeholder={`Option ${i + 1}`}
                  className="flex-1 bg-transparent outline-none text-[15px]"
                />
                {opts.length > 2 && (
                  <button onClick={() => setOpts((p) => p.filter((_, idx) => idx !== i))} className="text-[var(--ios-red)] ios-tap">
                    <Icon name="X" size={16} />
                  </button>
                )}
              </div>
            ))}
            {opts.length < 10 && (
              <button onClick={() => setOpts((p) => [...p, ""])} className="px-4 py-3 text-[var(--ios-blue)] text-[14px] font-medium w-full text-left ios-tap">
                + Add option
              </button>
            )}
          </div>

          <div className="bg-white rounded-2xl divide-y divide-[var(--ios-sep)] overflow-hidden">
            <Toggle label="Multiple answers" value={multiple} onChange={setMultiple} />
            <Toggle label="Anonymous voting" value={anonymous} onChange={setAnonymous} />
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)} className="flex items-center justify-between px-4 py-3 w-full">
      <span className="text-[15px]">{label}</span>
      <span className={"w-12 h-7 rounded-full transition-colors relative " + (value ? "bg-[var(--ios-green)]" : "bg-[var(--ios-ink-4)]")}>
        <span className="absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform" style={{ transform: value ? "translateX(20px)" : "translateX(0)" }} />
      </span>
    </button>
  );
}
