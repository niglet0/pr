/**
 * SpqrCards — rich visual cards + interactive form cards.
 * Theme: cream / gold / black (Hatch design system).
 */
import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import * as Lucide from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
export interface SpqrCard {
  type: string;
  id?: string;
  title: string;
  subtitle?: string;
  image?: string;
  screenshots?: string[];
  badges?: string[];
  techStack?: string[];
  stats?: { label: string; value: any }[];
  price?: string;
  actionType?: string;
  draftData?: Record<string, any>;
  creatorName?: string;
  creatorAvatar?: string;
  verified?: boolean;
  url?: string;
  githubUrl?: string;
  // Form card fields
  formType?: string;
  formIcon?: string;
  formSubmitLabel?: string;
  formFields?: FormField[];
}

export interface FormField {
  key: string;
  label: string;
  placeholder?: string;
  inputType: "text" | "textarea" | "url" | "select" | "tags" | "number";
  required?: boolean;
  options?: string[];
  draftValue?: string | string[];
}

// ── Constants ──────────────────────────────────────────────────────────────────
const C = {
  bg:     "#FAF9F6",
  s1:     "#FFFFFF",
  s2:     "#F3F1EC",
  border: "#E5E3DB",
  gold:   "#C5A059",
  dark:   "#8C6A32",
  ink:    "#202020",
  muted:  "#7A7A7A",
  green:  "#10B981",
};

const TYPE_META: Record<string, { icon: keyof typeof Lucide; color: string; bg: string; label: string }> = {
  launch:  { icon: "Rocket",        color: "#C5A059", bg: "#C5A05910", label: "Launch"    },
  stack:   { icon: "Layers",        color: "#10B981", bg: "#10B98110", label: "Dev Stack" },
  bounty:  { icon: "Coins",         color: "#F59E0B", bg: "#F59E0B10", label: "Bounty"    },
  user:    { icon: "User",          color: "#3B82F6", bg: "#3B82F610", label: "Person"    },
  post:    { icon: "MessageSquare", color: "#8B5CF6", bg: "#8B5CF610", label: "Post"      },
  listing: { icon: "Package",       color: "#EC4899", bg: "#EC489910", label: "Product"   },
  group:   { icon: "Users",         color: "#14B8A6", bg: "#14B8A610", label: "Group"     },
  collab:  { icon: "Handshake",     color: "#F97316", bg: "#F9731610", label: "Collab"    },
};

const TECH_COLORS: Record<string, string> = {
  React: "#61DAFB", Next: "#000000", Vue: "#42B883", Angular: "#DD0031",
  TypeScript: "#3178C6", JavaScript: "#F7DF1E", Python: "#3776AB", Go: "#00ADD8",
  Rust: "#DEA584", Svelte: "#FF3E00", Node: "#339933", Tailwind: "#06B6D4",
  Postgres: "#4169E1", Supabase: "#3ECF8E", Docker: "#2496ED", AWS: "#FF9900",
  Bun: "#FBF0DF", Vite: "#646CFF", Prisma: "#2D3748", tRPC: "#398CCB",
};

function getTechColor(tech: string): string {
  for (const [key, color] of Object.entries(TECH_COLORS)) {
    if (tech.toLowerCase().includes(key.toLowerCase())) return color;
  }
  return "#7A7A7A";
}

function LIcon({ name, size = 14, color }: { name: keyof typeof Lucide; size?: number; color?: string }) {
  const I = Lucide[name] as React.FC<any>;
  if (!I) return null;
  return <I size={size} strokeWidth={2} color={color || "currentColor"} />;
}

function TechBadge({ tech }: { tech: string }) {
  const color = getTechColor(tech);
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wide border"
      style={{ color, borderColor: `${color}40`, backgroundColor: `${color}12` }}
    >
      {tech}
    </span>
  );
}

// ── Tag input for form card ────────────────────────────────────────────────────
function TagInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [inp, setInp] = useState("");
  const add = (raw: string) => {
    const tags = raw.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean);
    if (tags.length) {
      onChange([...value, ...tags.filter((t) => !value.includes(t))]);
      setInp("");
    }
  };
  return (
    <div
      className="flex flex-wrap gap-1.5 rounded-xl border p-2 min-h-[40px] focus-within:border-[#C5A05980] transition-colors"
      style={{ borderColor: C.border, backgroundColor: C.s1 }}
    >
      {value.map((t) => (
        <span
          key={t}
          className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold border"
          style={{ color: getTechColor(t), borderColor: `${getTechColor(t)}40`, backgroundColor: `${getTechColor(t)}12` }}
        >
          {t}
          <button onClick={() => onChange(value.filter((v) => v !== t))} className="hover:opacity-60">
            <LIcon name="X" size={8} />
          </button>
        </span>
      ))}
      <input
        value={inp}
        onChange={(e) => setInp(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(inp); }
          if (e.key === "Backspace" && !inp && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={() => add(inp)}
        placeholder={value.length === 0 ? placeholder : "Add more…"}
        className="flex-1 min-w-[80px] text-[11px] bg-transparent outline-none py-0.5"
        style={{ color: C.ink }}
      />
    </div>
  );
}

// ── Form Card component ────────────────────────────────────────────────────────
function FormCard({
  card,
  onSubmit,
}: {
  card: SpqrCard;
  onSubmit: (formType: string, data: Record<string, any>) => void;
}) {
  const fields = card.formFields || [];
  const [values, setValues] = useState<Record<string, any>>(() => {
    const init: Record<string, any> = {};
    for (const f of fields) {
      if (f.draftValue !== undefined) {
        init[f.key] = f.draftValue;
      } else if (f.inputType === "tags") {
        init[f.key] = [];
      } else {
        init[f.key] = "";
      }
    }
    return init;
  });
  const [submitted, setSubmitted] = useState(false);

  const iconName = (card.formIcon || "Sparkles") as keyof typeof Lucide;

  const handleSubmit = () => {
    // Merge tag-group fields for dev_stack
    let data = { ...values };
    if (card.formType === "dev_stack") {
      const tools: Record<string, string[]> = {};
      for (const key of ["frontend", "backend", "database", "devops"]) {
        const v = data[key];
        if (Array.isArray(v) && v.length > 0) {
          tools[key.charAt(0).toUpperCase() + key.slice(1)] = v;
        }
        delete data[key];
      }
      data = { ...data, tools };
    }
    if (card.formType === "group") {
      data.is_channel = data.is_channel === "channel";
    }
    setSubmitted(true);
    onSubmit(card.formType!, data);
  };

  const set = (key: string, val: any) => setValues((p) => ({ ...p, [key]: val }));

  const requiredMissing = fields
    .filter((f) => f.required)
    .some((f) => {
      const v = values[f.key];
      return !v || (Array.isArray(v) && v.length === 0) || String(v).trim() === "";
    });

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full rounded-2xl border overflow-hidden shadow-md"
      style={{ borderColor: `${C.gold}30`, backgroundColor: C.s1 }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 border-b"
        style={{ background: `linear-gradient(135deg, ${C.gold}18, ${C.gold}06)`, borderColor: `${C.gold}20` }}
      >
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: `linear-gradient(135deg, ${C.gold}, ${C.dark})` }}
        >
          <LIcon name={iconName} size={18} color="white" />
        </div>
        <div>
          <h4 className="font-black text-[14px] leading-tight" style={{ color: C.ink }}>{card.title}</h4>
          <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: C.gold }}>Fill in the details below</p>
        </div>
      </div>

      {/* Fields */}
      <div className="px-4 py-3 space-y-3">
        {fields.map((f) => (
          <div key={f.key} className="space-y-1">
            <label className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest" style={{ color: C.muted }}>
              {f.label}
              {f.required && <span style={{ color: C.gold }}>*</span>}
            </label>

            {f.inputType === "textarea" ? (
              <textarea
                value={values[f.key] || ""}
                onChange={(e) => set(f.key, e.target.value)}
                placeholder={f.placeholder}
                rows={3}
                className="w-full rounded-xl border px-3 py-2 text-[12px] resize-none outline-none focus:border-[#C5A05980] transition-colors"
                style={{ borderColor: C.border, backgroundColor: C.s2, color: C.ink }}
              />
            ) : f.inputType === "select" ? (
              <select
                value={values[f.key] || ""}
                onChange={(e) => set(f.key, e.target.value)}
                className="w-full rounded-xl border px-3 py-2.5 text-[12px] outline-none focus:border-[#C5A05980] transition-colors appearance-none"
                style={{ borderColor: C.border, backgroundColor: C.s2, color: values[f.key] ? C.ink : C.muted }}
              >
                <option value="">{f.placeholder || "Select…"}</option>
                {(f.options || []).map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            ) : f.inputType === "tags" ? (
              <TagInput
                value={Array.isArray(values[f.key]) ? values[f.key] : []}
                onChange={(v) => set(f.key, v)}
                placeholder={f.placeholder}
              />
            ) : (
              <input
                type={f.inputType === "url" ? "url" : f.inputType === "number" ? "number" : "text"}
                value={values[f.key] || ""}
                onChange={(e) => set(f.key, e.target.value)}
                placeholder={f.placeholder}
                className="w-full rounded-xl border px-3 py-2.5 text-[12px] outline-none focus:border-[#C5A05980] transition-colors"
                style={{ borderColor: C.border, backgroundColor: C.s2, color: C.ink }}
              />
            )}
          </div>
        ))}
      </div>

      {/* Submit */}
      <div className="px-4 pb-4">
        <motion.button
          onClick={handleSubmit}
          disabled={requiredMissing || submitted}
          whileTap={{ scale: 0.97 }}
          className="w-full py-3 rounded-xl font-black text-[12px] uppercase tracking-widest transition-all disabled:opacity-40 flex items-center justify-center gap-2"
          style={{
            background: submitted
              ? `${C.green}20`
              : requiredMissing
              ? `${C.gold}30`
              : `linear-gradient(135deg, ${C.gold}, ${C.dark})`,
            color: submitted ? C.green : "white",
          }}
        >
          {submitted ? (
            <>
              <LIcon name="CheckCircle" size={14} color={C.green} />
              <span style={{ color: C.green }}>Submitted — Oracle is reviewing…</span>
            </>
          ) : (
            <>
              <LIcon name="Sparkles" size={14} color={requiredMissing ? C.gold : "white"} />
              <span style={{ color: requiredMissing ? C.gold : "white" }}>{card.formSubmitLabel || "Preview →"}</span>
            </>
          )}
        </motion.button>
        {requiredMissing && (
          <p className="text-center text-[9px] mt-1.5 font-bold uppercase tracking-widest" style={{ color: C.muted }}>
            Fill all required fields (*) to continue
          </p>
        )}
      </div>
    </motion.div>
  );
}

// ── Regular card ───────────────────────────────────────────────────────────────
interface CardAction {
  icon: keyof typeof Lucide;
  label: string;
  color?: string;
  onClick: () => void;
}

function SpqrSingleCard({ card, index, onAction }: {
  card: SpqrCard;
  index: number;
  onAction?: (action: string, card: SpqrCard) => void;
}) {
  const meta = TYPE_META[card.type] || { icon: "Sparkles" as keyof typeof Lucide, color: "#C5A059", bg: "#C5A05910", label: "Item" };
  const [imgIdx, setImgIdx] = useState(0);
  const [bookmarked, setBookmarked] = useState(false);
  const [upvoted, setUpvoted] = useState(false);

  const allImages = [card.image, ...(card.screenshots || [])].filter(Boolean) as string[];
  const currentImg = allImages[imgIdx];

  const actions: CardAction[] = [];
  if (card.type === "launch" && card.id && card.id !== "preview") {
    actions.push({
      icon: "ArrowUp", label: upvoted ? "Upvoted" : "Upvote",
      color: upvoted ? "#C5A059" : undefined,
      onClick: () => { setUpvoted(!upvoted); onAction?.("upvote", card); },
    });
    actions.push({
      icon: "Bookmark", label: bookmarked ? "Saved" : "Save",
      color: bookmarked ? "#C5A059" : undefined,
      onClick: () => { setBookmarked(!bookmarked); onAction?.("bookmark", card); },
    });
  }
  if (card.url) {
    actions.push({ icon: "ExternalLink", label: "Visit", onClick: () => window.open(card.url, "_blank") });
  }
  if (card.githubUrl) {
    actions.push({ icon: "Github", label: "Code", onClick: () => window.open(card.githubUrl, "_blank") });
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: index * 0.07, duration: 0.28, ease: [0.25, 0.1, 0.25, 1] }}
      className="min-w-[230px] max-w-[250px] bg-white rounded-2xl border shadow-sm overflow-hidden shrink-0 flex flex-col"
      style={{ borderColor: C.border }}
    >
      {/* Cover / screenshots */}
      {allImages.length > 0 ? (
        <div className="relative h-[110px] overflow-hidden group" style={{ backgroundColor: C.s2 }}>
          <motion.img
            key={currentImg}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
            src={currentImg}
            alt=""
            className="w-full h-full object-cover"
          />
          {allImages.length > 1 && (
            <>
              <div className="absolute bottom-1.5 left-0 right-0 flex justify-center gap-1">
                {allImages.map((_, i) => (
                  <button key={i} onClick={() => setImgIdx(i)}
                    className="w-1.5 h-1.5 rounded-full transition-all"
                    style={{ backgroundColor: i === imgIdx ? C.gold : "#FFFFFF80" }}
                  />
                ))}
              </div>
              <button
                onClick={() => setImgIdx((p) => (p - 1 + allImages.length) % allImages.length)}
                className="absolute left-1 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <LIcon name="ChevronLeft" size={12} color="white" />
              </button>
              <button
                onClick={() => setImgIdx((p) => (p + 1) % allImages.length)}
                className="absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <LIcon name="ChevronRight" size={12} color="white" />
              </button>
            </>
          )}
          <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ backgroundColor: `${meta.color}dd` }}>
            <LIcon name={meta.icon} size={9} color="white" />
            <span className="text-[8px] font-bold uppercase tracking-widest text-white">{meta.label}</span>
          </div>
          {card.price && (
            <div className="absolute top-2 right-2 bg-[#202020] px-2 py-0.5 rounded-full">
              <span className="text-[9px] font-bold text-white">{card.price}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="h-14 flex items-center justify-center relative" style={{ background: `linear-gradient(135deg, ${meta.bg}, transparent)` }}>
          <LIcon name={meta.icon} size={24} color={meta.color} />
          <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ backgroundColor: `${meta.color}22` }}>
            <LIcon name={meta.icon} size={9} color={meta.color} />
            <span className="text-[8px] font-bold uppercase tracking-widest" style={{ color: meta.color }}>{meta.label}</span>
          </div>
          {card.price && (
            <div className="absolute top-2 right-2 bg-[#202020] px-2 py-0.5 rounded-full">
              <span className="text-[9px] font-bold text-white">{card.price}</span>
            </div>
          )}
        </div>
      )}

      {/* Body */}
      <div className="p-3 space-y-2 flex-1 flex flex-col">
        {card.creatorName && (
          <div className="flex items-center gap-1.5">
            {card.creatorAvatar ? (
              <img src={card.creatorAvatar} className="w-4 h-4 rounded-full object-cover border" style={{ borderColor: C.border }} />
            ) : (
              <div className="w-4 h-4 rounded-full flex items-center justify-center" style={{ backgroundColor: C.gold }}>
                <LIcon name="User" size={8} color="white" />
              </div>
            )}
            <span className="text-[9px] font-medium" style={{ color: C.muted }}>{card.creatorName}</span>
            {card.verified && <LIcon name="BadgeCheck" size={10} color={C.gold} />}
          </div>
        )}

        <h5 className="font-black text-[13px] leading-tight line-clamp-2" style={{ color: C.ink }}>{card.title}</h5>

        {card.subtitle && (
          <p className="text-[11px] leading-snug line-clamp-2" style={{ color: C.muted }}>{card.subtitle}</p>
        )}

        {card.techStack && card.techStack.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {card.techStack.slice(0, 4).map((t, i) => <TechBadge key={i} tech={t} />)}
            {card.techStack.length > 4 && (
              <span className="text-[8px] font-bold self-center" style={{ color: C.muted }}>+{card.techStack.length - 4}</span>
            )}
          </div>
        )}

        {card.badges && card.badges.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {card.badges.slice(0, 3).map((b, i) => (
              <span key={i} className="text-[8px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border"
                style={{ backgroundColor: C.s2, color: C.muted, borderColor: C.border }}>
                {b}
              </span>
            ))}
          </div>
        )}

        {card.stats && card.stats.length > 0 && (
          <div className="flex items-center gap-3 pt-1 mt-auto border-t" style={{ borderColor: "#F0EEE7" }}>
            {card.stats.map((s, i) => (
              <div key={i} className="flex items-baseline gap-1">
                <span className="text-[12px] font-black" style={{ color: C.ink }}>{String(s.value)}</span>
                <span className="text-[8px] uppercase tracking-wide" style={{ color: "#9A9A9A" }}>{s.label}</span>
              </div>
            ))}
          </div>
        )}

        {actions.length > 0 && (
          <div className="flex gap-1.5 pt-1">
            {actions.map((a, i) => (
              <button
                key={i}
                onClick={a.onClick}
                title={a.label}
                className="flex items-center gap-1 px-2 py-1 rounded-full border transition-all hover:opacity-80 active:scale-95 text-[9px] font-bold uppercase tracking-wide"
                style={a.color
                  ? { color: a.color, borderColor: `${a.color}40`, backgroundColor: `${a.color}10` }
                  : { color: C.muted, borderColor: C.border, backgroundColor: C.s2 }}
              >
                <LIcon name={a.icon} size={10} color={a.color || C.muted} />
                <span>{a.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── Card list (handles both form cards and regular cards) ─────────────────────
export function SpqrCardList({
  cards,
  onAction,
}: {
  cards: SpqrCard[];
  onAction?: (action: string, card: SpqrCard, data?: Record<string, any>) => void;
}) {
  if (!cards || cards.length === 0) return null;

  const formCards  = cards.filter((c) => c.type === "form");
  const regularCards = cards.filter((c) => c.type !== "form");

  return (
    <div className="mt-2.5 space-y-3 w-full">
      {/* Form cards — full width, stacked */}
      {formCards.map((c, i) => (
        <FormCard
          key={c.id || `form-${i}`}
          card={c}
          onSubmit={(formType, data) => onAction?.("form_submit", c, { formType, ...data })}
        />
      ))}

      {/* Regular cards — horizontal scroll */}
      {regularCards.length > 0 && (
        <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1.5 -mx-1 px-1">
          {regularCards.map((c, i) => (
            <SpqrSingleCard key={c.id || i} card={c} index={i} onAction={onAction} />
          ))}
        </div>
      )}
    </div>
  );
}
