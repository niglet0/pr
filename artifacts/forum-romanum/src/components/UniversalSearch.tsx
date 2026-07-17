import React, { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Avatar, Icon, cn } from "./UI";
import { supabase } from "../integrations/supabase/client";
import type { EntityRef, EntityType } from "./EntityProfile";

interface SearchResult {
  id: string;
  type: EntityType;
  handle: string;
  name: string;
  avatar?: string;
  subtitle?: string;
  verified?: boolean;
}

const RECENT_KEY = "fr_recent_searches";
const MAX_RECENT = 6;

function saveRecent(r: SearchResult) {
  try {
    const prev: SearchResult[] = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    const deduped = [r, ...prev.filter((x) => x.id !== r.id)].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(deduped));
  } catch {}
}

function getRecent(): SearchResult[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
  } catch {
    return [];
  }
}

const TYPE_COLORS: Record<EntityType, string> = {
  user: "#3B82F6",
  company: "#8B5CF6",
  channel: "#10B981",
};

const TYPE_ICONS: Record<EntityType, any> = {
  user: "User",
  company: "Building2",
  channel: "Radio",
};

const TYPE_LABELS: Record<EntityType, string> = {
  user: "Person",
  company: "Company",
  channel: "Channel",
};

function ResultRow({
  r,
  selected,
  onClick,
}: {
  r: SearchResult;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 transition-colors text-left",
        selected ? "bg-[#C5A059]/10" : "hover:bg-[#F3F1EC]"
      )}
    >
      <div className="relative shrink-0">
        {r.avatar ? (
          <img
            src={r.avatar}
            className={cn("object-cover border border-[#E5E3DB]", r.type === "company" ? "w-9 h-9 rounded-xl" : "w-9 h-9 rounded-full")}
            alt={r.name}
          />
        ) : (
          <div
            className={cn("w-9 h-9 flex items-center justify-center text-white font-bold text-sm", r.type === "company" ? "rounded-xl" : "rounded-full")}
            style={{ backgroundColor: TYPE_COLORS[r.type] }}
          >
            {r.name[0]?.toUpperCase()}
          </div>
        )}
        <span
          className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center"
          style={{ backgroundColor: TYPE_COLORS[r.type] }}
        >
          <Icon name={TYPE_ICONS[r.type]} size={9} color="white" />
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-sm text-[#202020] truncate">{r.name}</span>
          {r.verified && <Icon name="BadgeCheck" size={13} className="text-[#C5A059] shrink-0" />}
        </div>
        <p className="text-[11px] text-[#7A7A7A] truncate">
          {r.handle ? `@${r.handle}` : ""}{r.subtitle ? ` · ${r.subtitle}` : ""}
        </p>
      </div>
      <span
        className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0"
        style={{ backgroundColor: TYPE_COLORS[r.type] + "18", color: TYPE_COLORS[r.type] }}
      >
        {TYPE_LABELS[r.type]}
      </span>
    </button>
  );
}

export function UniversalSearch({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (entity: EntityRef) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [recent, setRecent] = useState<SearchResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (open) {
      setRecent(getRecent());
      setTimeout(() => inputRef.current?.focus(), 80);
      setQuery("");
      setResults([]);
      setSelectedIdx(0);
    }
  }, [open]);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const like = `%${q}%`;
    try {
      const [usersRes, companiesRes, channelsRes] = await Promise.all([
        supabase
          .from("users")
          .select("id, username, display_name, avatar_url, verified, handle")
          .or(`username.ilike.${like},display_name.ilike.${like},handle.ilike.${like}`)
          .limit(5),
        supabase
          .from("company_profiles")
          .select("id, name, slug, logo_url, is_verified, industry")
          .or(`name.ilike.${like},slug.ilike.${like}`)
          .limit(4),
        supabase
          .from("groups")
          .select("id, name, username, avatar_url, members_count, is_channel")
          .or(`name.ilike.${like},username.ilike.${like}`)
          .limit(4),
      ]);

      const mapped: SearchResult[] = [
        ...(usersRes.data || []).map((u: any) => ({
          id: u.id,
          type: "user" as EntityType,
          handle: u.handle || u.username || "",
          name: u.display_name || u.username,
          avatar: u.avatar_url,
          verified: u.verified,
        })),
        ...(companiesRes.data || []).map((c: any) => ({
          id: c.id,
          type: "company" as EntityType,
          handle: c.slug,
          name: c.name,
          avatar: c.logo_url,
          subtitle: c.industry,
          verified: c.is_verified,
        })),
        ...(channelsRes.data || []).map((g: any) => ({
          id: g.id,
          type: "channel" as EntityType,
          handle: g.username || "",
          name: g.name,
          avatar: g.avatar_url,
          subtitle: `${(g.members_count || 0).toLocaleString()} members`,
        })),
      ];
      setResults(mapped);
      setSelectedIdx(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (query) {
      debounceRef.current = setTimeout(() => search(query), 280);
    } else {
      setResults([]);
    }
    return () => clearTimeout(debounceRef.current);
  }, [query, search]);

  const handleSelect = (r: SearchResult) => {
    saveRecent(r);
    setRecent(getRecent());
    onSelect({ type: r.type, id: r.id, handle: r.handle });
    onClose();
  };

  const displayList = query ? results : recent;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, displayList.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && displayList[selectedIdx]) {
      handleSelect(displayList[selectedIdx]);
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-[200] flex flex-col"
          style={{ background: "rgba(250,249,246,0.85)", backdropFilter: "blur(12px)" }}
          onClick={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            initial={{ y: -16, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -16, opacity: 0, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 500, damping: 38 }}
            className="mx-3 mt-16 bg-white rounded-2xl shadow-2xl shadow-black/10 border border-[#E5E3DB] overflow-hidden"
            style={{ maxHeight: "70vh" }}
          >
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[#E5E3DB]">
              <Icon name="Search" size={18} className="text-[#7A7A7A] shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search people, companies, channels…"
                className="flex-1 bg-transparent text-sm font-medium text-[#202020] placeholder:text-[#B0ACA5] outline-none"
              />
              {loading && <Icon name="Loader2" size={16} className="text-[#C5A059] animate-spin shrink-0" />}
              <button onClick={onClose} className="text-[10px] font-bold text-[#7A7A7A] bg-[#F3F1EC] px-2 py-1 rounded-md">
                ESC
              </button>
            </div>

            {!query && recent.length > 0 && (
              <div className="px-4 pt-3 pb-1 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#7A7A7A]">Recent</span>
                <button
                  onClick={() => { localStorage.removeItem(RECENT_KEY); setRecent([]); }}
                  className="text-[10px] font-bold text-[#C5A059]"
                >
                  Clear
                </button>
              </div>
            )}

            <div className="overflow-y-auto" style={{ maxHeight: "calc(70vh - 60px)" }}>
              {displayList.length === 0 && !loading && query && (
                <div className="flex flex-col items-center py-12 text-[#7A7A7A]">
                  <Icon name="SearchX" size={32} className="mb-3 opacity-40" />
                  <p className="text-sm font-bold">No results for "{query}"</p>
                </div>
              )}
              {displayList.map((r, i) => (
                <ResultRow
                  key={`${r.type}-${r.id}`}
                  r={r}
                  selected={i === selectedIdx}
                  onClick={() => handleSelect(r)}
                />
              ))}
            </div>

            {!query && recent.length === 0 && (
              <div className="flex flex-col items-center py-12 text-[#7A7A7A]">
                <Icon name="Search" size={32} className="mb-3 opacity-30" />
                <p className="text-sm font-bold">Search the Forum</p>
                <p className="text-xs mt-1 opacity-70">People, companies, and channels</p>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
