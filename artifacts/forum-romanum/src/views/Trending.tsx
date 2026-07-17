import React, { useState, useEffect } from "react";
import { Card, Icon, Chip, Skeleton, Button } from "../components/UI";
import { supabase } from "../integrations/supabase/client";

export function TrendingView({ onOpenContent }: { onOpenContent: (item: any) => void }) {
  const [activeTab, setActiveTab] = useState<"crypto" | "topics" | "dev">("crypto");
  return (
    <div className="space-y-4 pb-24">
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar sticky top-0 bg-[#FAF9F6] z-10 p-2 border-b border-[#E5E3DB]">
        <Chip label="Crypto Markets" active={activeTab === "crypto"} onClick={() => setActiveTab("crypto")} />
        <Chip label="Top Decrees" active={activeTab === "topics"} onClick={() => setActiveTab("topics")} />
        <Chip label="Dev Repos" active={activeTab === "dev"} onClick={() => setActiveTab("dev")} />
      </div>
      <div className="px-4">
        {activeTab === "crypto" && <CryptoMonitor />}
        {activeTab === "topics" && <TrendingTopics onOpenContent={onOpenContent} />}
        {activeTab === "dev" && <DevRepos />}
      </div>
    </div>
  );
}

function DevRepos() {
  const [repos, setRepos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch(
      "https://api.github.com/search/repositories?q=language:typescript+stars:>5000&sort=stars&order=desc&per_page=10"
    )
      .then((r) => r.json())
      .then((d) => setRepos(d.items || []))
      .finally(() => setLoading(false));
  }, []);
  if (loading)
    return (
      <div className="space-y-3">
        {Array(4)
          .fill(0)
          .map((_, i) => (
            <Card key={i} className="p-4">
              <Skeleton width="60%" height={16} className="mb-2" />
              <Skeleton width="100%" height={12} />
            </Card>
          ))}
      </div>
    );
  return (
    <div className="space-y-3">
      {repos.map((repo) => (
        <a key={repo.id} href={repo.html_url} target="_blank" rel="noreferrer" className="block">
          <Card className="p-4 hover:border-[#C5A059]/40 group">
            <div className="flex items-start justify-between gap-2 mb-2">
              <h3 className="font-bold text-[#3B82F6] group-hover:underline text-[15px] truncate">
                {repo.full_name}
              </h3>
              <div className="flex items-center gap-1 text-[11px] font-black uppercase tracking-widest text-[#C5A059] bg-[#C5A059]/10 px-2 py-0.5 rounded-full">
                <Icon name="Star" size={12} />{" "}
                {repo.stargazers_count > 1000
                  ? (repo.stargazers_count / 1000).toFixed(1) + "k"
                  : repo.stargazers_count}
              </div>
            </div>
            <p className="text-[12px] text-slate-500 line-clamp-2">{repo.description}</p>
          </Card>
        </a>
      ))}
    </div>
  );
}

function TrendingTopics({ onOpenContent }: { onOpenContent: (item: any) => void }) {
  const [topics, setTopics] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    supabase
      .from("v_posts")
      .select("*")
      .order("likes_count", { ascending: false })
      .limit(10)
      .then(({ data }: any) => {
        if (data) setTopics(data);
        setLoading(false);
      });
  }, []);
  if (loading)
    return (
      <div className="space-y-2">
        {Array(4)
          .fill(0)
          .map((_, i) => (
            <Skeleton key={i} width="100%" height={64} />
          ))}
      </div>
    );
  return (
    <div className="space-y-2">
      {topics.map((t, i) => (
        <Card key={t.id} onClick={() => onOpenContent(t)} className="p-4 flex gap-4 items-center">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-[15px] ${
              i < 3
                ? "bg-gradient-to-br from-[#C5A059] to-[#8E6D2F] text-white"
                : "bg-white border border-[#E5E3DB] text-[#7A7A7A]"
            }`}
          >
            {i + 1}
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-bold text-[14px] truncate">{t.content}</h4>
            <div className="flex gap-3 text-[10px] font-bold text-[#7A7A7A] mt-2 uppercase tracking-widest">
              <span className="text-[#C5A059] flex items-center gap-1">
                <Icon name="Heart" size={10} /> {t.likes_count}
              </span>
              <span className="flex items-center gap-1">
                <Icon name="MessageSquare" size={10} /> {t.comments_count}
              </span>
              <span className="truncate ml-auto">@{t.username}</span>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function CryptoMonitor() {
  const [coins, setCoins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const f = async () => {
      try {
        const res = await fetch("https://api.binance.com/api/v3/ticker/24hr");
        const data = await res.json();
        const syms = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"];
        const names: Record<string, string> = {
          BTCUSDT: "Bitcoin",
          ETHUSDT: "Ethereum",
          SOLUSDT: "Solana",
          BNBUSDT: "BNB",
        };
        setCoins(
          data
            .filter((c: any) => syms.includes(c.symbol))
            .map((c: any) => ({
              symbol: c.symbol.replace("USDT", ""),
              name: names[c.symbol],
              price: parseFloat(c.lastPrice),
              change: parseFloat(c.priceChangePercent),
            }))
        );
      } catch {}
      setLoading(false);
    };
    f();
    const id = setInterval(f, 60000);
    return () => clearInterval(id);
  }, []);
  return (
    <Card className="p-5 space-y-5">
      <div className="flex items-center gap-2 mb-2">
        <Icon name="BarChart3" size={18} color="#C5A059" />
        <span className="text-[10px] uppercase tracking-widest font-black text-[#C5A059]">
          Live Market via Binance
        </span>
      </div>
      {loading ? (
        <div className="space-y-3">
          {Array(4).fill(0).map((_, i) => (
            <Skeleton key={i} width="100%" height={40} />
          ))}
        </div>
      ) : (
        coins.map((c) => (
          <div key={c.symbol} className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-[#F3F1EC] flex items-center justify-center font-black text-[#C5A059]">
              {c.symbol.charAt(0)}
            </div>
            <div className="flex-1">
              <div className="text-[14.5px] font-bold">{c.name}</div>
              <div className="text-[10px] font-bold text-[#C5A059] uppercase tracking-widest mt-0.5">
                {c.symbol}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[15px] font-black">
                ${c.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div
                className={`text-[11px] font-bold mt-0.5 ${c.change >= 0 ? "text-[#10B981]" : "text-[#EF4444]"}`}
              >
                {c.change >= 0 ? "▲" : "▼"} {Math.abs(c.change).toFixed(2)}%
              </div>
            </div>
          </div>
        ))
      )}
      <Button variant="ghost" className="w-full text-[10px] py-2 mt-2">
        View Exchange
      </Button>
    </Card>
  );
}
