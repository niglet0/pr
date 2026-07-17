import { createFileRoute } from "@tanstack/react-router";
import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Icon, Button, Card, Avatar, cn } from "../components/UI";
import { supabase } from "../integrations/supabase/client";
import { NotificationsDrawer, useUnreadCount } from "../components/NotificationsDrawer";
import { HomeView } from "../views/Home";
import { MessagesView } from "../views/Messages";
import { CodersHubView } from "../views/CodersHub";
import { TrendingView } from "../views/Trending";
import { ProfileView } from "../views/Profile";
import { MarketplaceView } from "../views/Marketplace";
import { StoreDashboardView } from "../views/StoreDashboard";
import { useDeepFocus } from "../lib/focusStore";
import { FocusSandbox } from "../components/FocusSandbox";
import { EntityProfile } from "../components/EntityProfile";
import { UniversalSearch } from "../components/UniversalSearch";
import { CompanyHub } from "../components/CompanyHub";
import type { EntityRef } from "../components/EntityProfile";
import SandboxIDE from "../components/sandbox/SandboxIDE";


export const Route = createFileRoute("/")({
  ssr: false,
  component: AppShell,
});

type TabId = "home" | "messages" | "hub" | "trending" | "profile" | "marketplace" | "store";

function AuthScreen() {
  const [mode, setMode] = useState<"login" | "signup" | "otp_request" | "otp_verify">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMsg("");
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    } else if (mode === "signup") {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) setError(error.message);
      else setMsg("Account created. Check your email or paste the magic link below.");
    } else if (mode === "otp_request") {
      const { error } = await supabase.auth.signInWithOtp({ email });
      if (error) setError(error.message);
      else {
        setMsg("Magic link sent. Paste it or the 6-digit code below.");
        setMode("otp_verify");
      }
    } else {
      try {
        const url = new URL(otp);
        const token_hash = url.searchParams.get("token");
        const type = (url.searchParams.get("type") || "magiclink") as any;
        if (token_hash) {
          const { error } = await supabase.auth.verifyOtp({ token_hash, type });
          if (error) setError(error.message);
        } else setError("Link missing token.");
      } catch {
        const { error } = await supabase.auth.verifyOtp({ email, token: otp, type: "email" });
        if (error) setError(error.message);
      }
    }
    setLoading(false);
  };

  const guest = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInAnonymously();
    if (error) setError("Enable Anonymous sign-ins in Supabase Auth settings.");
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] flex flex-col items-center justify-center p-4">
      <Card className="w-full max-w-sm p-8 border-[#C5A059]/20">
        <div className="w-12 h-12 bg-[#C5A059] rounded-xl flex items-center justify-center text-white font-black text-2xl mx-auto shadow-lg shadow-[#C5A059]/30 mb-6">
          S
        </div>
        <h2 className="text-2xl font-black text-center mb-1 serif tracking-tight">Forum Romanum</h2>
        <p className="text-xs text-center font-bold tracking-widest uppercase text-[#C5A059] mb-8">
          Identify Yourself
        </p>
        <form onSubmit={submit} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-[#FAF9F6] border border-[#E5E3DB] p-3.5 rounded-xl text-sm font-medium focus:border-[#C5A059] outline-none"
          />
          {(mode === "login" || mode === "signup") && (
            <input
              type="password"
              placeholder="Password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#FAF9F6] border border-[#E5E3DB] p-3.5 rounded-xl text-sm font-medium focus:border-[#C5A059] outline-none"
            />
          )}
          {mode === "otp_verify" && (
            <input
              type="text"
              placeholder="Paste full link or 6-digit code"
              required
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              className="w-full bg-[#FAF9F6] border border-[#C5A059] p-3.5 rounded-xl text-center text-xs font-medium outline-none"
            />
          )}
          {error && <p className="text-red-500 text-[11px] font-bold text-center">{error}</p>}
          {msg && (
            <p className="text-[#C5A059] text-[11px] font-bold text-center bg-[#C5A059]/10 p-2 rounded-lg">
              {msg}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {mode === "login"
              ? "Enter the Legion"
              : mode === "signup"
                ? "Enlist Now"
                : mode === "otp_request"
                  ? "Request Link"
                  : "Verify"}
          </Button>
        </form>
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex justify-between px-1">
            {(["login", "signup", "otp_request"] as const).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m);
                  setError("");
                  setMsg("");
                }}
                className={cn(
                  "text-[10px] font-bold uppercase tracking-widest",
                  mode === m || (m === "otp_request" && mode === "otp_verify")
                    ? "text-[#C5A059]"
                    : "text-[#7A7A7A]"
                )}
              >
                {m === "otp_request" ? "Magic Link" : m}
              </button>
            ))}
          </div>
          <div className="relative flex items-center py-2">
            <div className="flex-grow border-t border-[#E5E3DB]" />
            <span className="mx-4 text-[10px] text-[#7A7A7A] uppercase font-bold tracking-widest">
              Or
            </span>
            <div className="flex-grow border-t border-[#E5E3DB]" />
          </div>
          <Button variant="ghost" onClick={guest} disabled={loading} className="w-full">
            Continue as Guest
          </Button>
        </div>
      </Card>
    </div>
  );
}

function AppShell() {
  const [activeTab, setActiveTab] = useState<TabId>("home");
  const [contentItem, setContentItem] = useState<any>(null);
  const [plusOpen, setPlusOpen] = useState(false);
  const [session, setSession] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [forceAction, setForceAction] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [entityRef, setEntityRef] = useState<EntityRef | null>(null);
  const [companyHubId, setCompanyHubId] = useState<string | null>(null);
  const [pendingListingId, setPendingListingId] = useState<string | null>(null);
  const [pendingLaunchId, setPendingLaunchId] = useState<string | null>(null);
  const [inChat, setInChat] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [forgeOpen, setForgeOpen] = useState(false);
  const { active: focusActive } = useDeepFocus();
  const unreadCount = useUnreadCount(session?.user?.id);

  useEffect(() => {
    if (activeTab !== "messages") setInChat(false);
  }, [activeTab]);

  const openEntity = useCallback((ref: EntityRef) => {
    setEntityRef(ref);
    setSearchOpen(false);
  }, []);

  const openCompanyHub = useCallback((id: string) => {
    setCompanyHubId(id);
  }, []);

  // ── Scroll-position refs for display:none tab switching ──────────────────
  const activeTabRef = useRef<TabId>("home");
  const scrollPositions = useRef<Record<TabId, number>>({
    home: 0, messages: 0, hub: 0, trending: 0, profile: 0, marketplace: 0, store: 0,
  });
  const tabEls = useRef<Partial<Record<TabId, HTMLDivElement>>>({});

  const switchTab = useCallback((newTab: TabId) => {
    const cur = activeTabRef.current;
    const curEl = tabEls.current[cur];
    if (curEl) scrollPositions.current[cur] = curEl.scrollTop;
    activeTabRef.current = newTab;
    setActiveTab(newTab);
    requestAnimationFrame(() => {
      const el = tabEls.current[newTab];
      if (el) el.scrollTop = scrollPositions.current[newTab] ?? 0;
    });
  }, []);

  // ── Stable memoised callbacks → stop child re-renders on every switch ────
  const clearAction = useCallback(() => setForceAction(null), []);
  const openListing = useCallback((id: string) => {
    setPendingListingId(id);
    activeTabRef.current = "marketplace";
    setActiveTab("marketplace");
  }, []);
  const goToHub = useCallback((launchId?: string) => {
    activeTabRef.current = "hub";
    setActiveTab("hub");
    if (launchId) setPendingLaunchId(launchId);
  }, []);
  const consumeForceLaunch = useCallback(() => setPendingLaunchId(null), []);
  const openProfileEntity = useCallback((userId: string) => openEntity({ type: "user", id: userId }), [openEntity]);


  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((s) => !s);
      }
      if (e.key === "Escape") {
        setSearchOpen(false);
        setEntityRef(null);
        setCompanyHubId(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    let mounted = true;
    const t = setTimeout(() => mounted && setAuthLoading(false), 5000);
    supabase.auth.getSession().then(({ data: { session } }: any) => {
      if (!mounted) return;
      setSession(session);
      if (session) {
        supabase.from("users").select("*").eq("id", session.user.id).single().then(({ data }: any) => {
          if (mounted && data) setUserProfile(data);
        });
      }
      clearTimeout(t);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e: any, session: any) => {
      if (!mounted) return;
      setSession(session);
      if (session) {
        supabase.from("users").select("*").eq("id", session.user.id).single().then(({ data }: any) => {
          if (mounted && data) setUserProfile(data);
        });
      } else setUserProfile(null);
    });
    return () => {
      mounted = false;
      clearTimeout(t);
      subscription.unsubscribe();
    };
  }, []);

  const getRank = (s: number = 0) => {
    if (s > 1000) return "Emperor";
    if (s > 500) return "Consul";
    if (s > 200) return "Senator";
    if (s > 50) return "Equestrian";
    return "Plebeian";
  };

  if (authLoading)
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center">
        <Icon name="Loader2" className="animate-spin text-[#C5A059]" size={32} />
      </div>
    );
  if (!session) return <AuthScreen />;
  if (focusActive) return <FocusSandbox userId={session.user.id} />;


  const TABS: { id: TabId | "plus"; icon: any; devNexus?: boolean }[] = [
    { id: "home", icon: "Home" },
    { id: "messages", icon: "MessageCircle" },
    { id: "hub", icon: "Layers", devNexus: true },
    { id: "plus", icon: "Plus" },
    { id: "marketplace", icon: "Store" },
    { id: "store", icon: "LayoutDashboard" },
    { id: "profile", icon: "User" },
  ];

  return (
    <div className="min-h-screen app-ambient text-[#202020] font-sans">
      <div className="app-frame max-w-[520px] mx-auto min-h-screen bg-[#FAF9F6] flex flex-col relative overflow-hidden">
        <header className={`h-16 border-b border-[#C5A059]/15 glass flex items-center justify-between pl-4 pr-3 shrink-0 sticky top-0 z-40 transition-all duration-200 ${inChat ? "hidden" : ""}`}>
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => switchTab("profile")}
              className="shrink-0 tap-scale"
              aria-label="Your profile"
            >
              <div className="w-9 h-9 rounded-full bg-[#F3F1EC] ring-2 ring-[#C5A059] ring-offset-1 ring-offset-[#FAF9F6] overflow-hidden flex items-center justify-center">
                <Avatar
                  src={userProfile?.avatar_url || session.user.user_metadata?.avatar_url}
                  seed={session.user.id}
                  size={36}
                  className="w-full h-full object-cover rounded-full"
                />
              </div>
            </button>
            <button onClick={() => switchTab("home")} className="text-left leading-none tap-scale">
              <h1 className="text-[18px] font-bold tracking-tight text-[#202020] italic serif">
                Forum Romanum
              </h1>
              <p className="text-[8px] font-bold tracking-[0.25em] uppercase text-[#C5A059] mt-0.5">
                {userProfile?.display_name || "The Legion"}
              </p>
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => switchTab("trending")}
              className="w-9 h-9 rounded-full flex items-center justify-center text-[#7A7A7A] hover:text-[#C5A059] hover:bg-[#C5A059]/10 transition-colors tap-scale"
              aria-label="Trending"
            >
              <Icon name="TrendingUp" size={19} />
            </button>
            <button
              onClick={() => setForgeOpen(true)}
              className="w-9 h-9 rounded-full flex items-center justify-center text-[#7A7A7A] hover:text-[#C5A059] hover:bg-[#C5A059]/10 transition-colors tap-scale"
              aria-label="Forge Terminal"
              title="Forge — Sandbox IDE"
            >
              <Icon name="Terminal" size={19} />
            </button>
            <button
              onClick={() => setNotificationsOpen(true)}
              className="relative w-9 h-9 rounded-full flex items-center justify-center text-[#7A7A7A] hover:text-[#C5A059] hover:bg-[#C5A059]/10 transition-colors tap-scale"
              aria-label="Notifications"
            >
              <Icon name="Bell" size={19} />
              {unreadCount > 0 ? (
                <span className="absolute top-1 right-1 min-w-[14px] h-[14px] rounded-full bg-[#C5A059] text-white text-[8px] font-black flex items-center justify-center px-0.5 leading-none">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              ) : (
                <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[#C5A059]/50" />
              )}
            </button>
            <button
              onClick={() => { setSearchOpen(true); }}
              className="w-9 h-9 rounded-full flex items-center justify-center text-[#7A7A7A] hover:text-[#C5A059] hover:bg-[#C5A059]/10 transition-colors tap-scale"
              aria-label="Search"
            >
              <Icon name="Search" size={19} />
            </button>
          </div>
        </header>


        <main className="flex-1 bg-[#FAF9F6] relative overflow-hidden">
          {/* ── Always-mounted tabs — display:none eliminates GPU layer flicker ── */}
          <div ref={(el) => { if (el) tabEls.current.home = el; }} className={cn("absolute inset-0 overflow-y-auto no-scrollbar px-2.5 pt-3 bg-[#FAF9F6]", activeTab !== "home" && "hidden")}>
            <HomeView
              onOpenContent={setContentItem}
              currentUser={session.user}
              forceAction={forceAction}
              clearAction={clearAction}
              onOpenCompany={openCompanyHub}
              onOpenListing={openListing}
              onGoToHub={goToHub}
              onOpenEntity={openEntity}
            />
          </div>
          <div ref={(el) => { if (el) tabEls.current.messages = el; }} className={cn("absolute inset-0 overflow-y-auto no-scrollbar bg-[#FAF9F6]", activeTab !== "messages" && "hidden")}>
            <MessagesView
              currentUser={session.user}
              forceAction={forceAction}
              clearAction={clearAction}
              onInChatChange={setInChat}
              onOpenProfile={openProfileEntity}
            />
          </div>
          <div ref={(el) => { if (el) tabEls.current.hub = el; }} className={cn("absolute inset-0 overflow-y-auto no-scrollbar px-2.5 pt-3 bg-[#FAF9F6]", activeTab !== "hub" && "hidden")}>
            <CodersHubView
              currentUser={session.user}
              forceAction={forceAction}
              clearAction={clearAction}
              forceLaunchId={pendingLaunchId}
              onForceLaunchConsumed={consumeForceLaunch}
              onOpenProfile={openProfileEntity}
            />
          </div>
          <div ref={(el) => { if (el) tabEls.current.marketplace = el; }} className={cn("absolute inset-0 overflow-y-auto no-scrollbar px-2.5 pt-3 bg-[#FAF9F6]", activeTab !== "marketplace" && "hidden")}>
            <MarketplaceView
              currentUser={session.user}
              initialListingId={pendingListingId}
              onOpenProfile={openProfileEntity}
            />
          </div>
          <div ref={(el) => { if (el) tabEls.current.trending = el; }} className={cn("absolute inset-0 overflow-y-auto no-scrollbar px-2.5 pt-3 bg-[#FAF9F6]", activeTab !== "trending" && "hidden")}>
            <TrendingView onOpenContent={setContentItem} />
          </div>
          <div ref={(el) => { if (el) tabEls.current.profile = el; }} className={cn("absolute inset-0 overflow-y-auto no-scrollbar px-2.5 pt-3 bg-[#FAF9F6]", activeTab !== "profile" && "hidden")}>
            <ProfileView
              currentUser={session.user}
              onOpenCompany={openCompanyHub}
              onOpenListing={openListing}
            />
          </div>
          <div ref={(el) => { if (el) tabEls.current.store = el; }} className={cn("absolute inset-0 overflow-y-auto no-scrollbar px-2.5 pt-3 bg-[#FAF9F6]", activeTab !== "store" && "hidden")}>
            <StoreDashboardView currentUser={session.user} />
          </div>
        </main>

        <AnimatePresence>
          {plusOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPlusOpen(false)}
              className="absolute inset-0 z-30 bg-[#FAF9F6]/80 backdrop-blur-md"
            >
              <div className="absolute bottom-28 left-0 right-0 flex flex-col items-center gap-6">
                {[
                  { label: "Draft Decree", icon: "FileText", color: "#F59E0B", action: () => { switchTab("home"); setForceAction("new_post"); } },
                  { label: "Launch Product", icon: "Rocket", color: "#C5A059", action: () => { switchTab("hub"); setForceAction("launch_product"); } },
                  { label: "Post Collab", icon: "Users", color: "#8B5CF6", action: () => { switchTab("hub"); setForceAction("post_collab"); } },
                  { label: "New Legion", icon: "Shield", color: "#3B82F6", action: () => { switchTab("messages"); setForceAction("launch_guild"); } },
                  { label: "Consult Oracle", icon: "Bot", color: "#10B981", action: () => { switchTab("messages"); setForceAction("open_bot"); } },
                ].map((it, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, scale: 0.5, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="flex flex-col items-center gap-2 cursor-pointer"
                    onClick={(e: any) => {
                      e.stopPropagation();
                      setPlusOpen(false);
                      it.action();
                    }}
                  >
                    <div
                      className="w-14 h-14 rounded-full bg-[#F3F1EC] border border-[#C5A059]/20 shadow-xl flex items-center justify-center"
                      style={{ color: it.color }}
                    >
                      <Icon name={it.icon as any} size={22} />
                    </div>
                    <span className="text-[10px] font-black bg-[#F3F1EC] px-3 py-1.5 rounded-full shadow-sm border border-[#C5A059]/20 uppercase tracking-widest">
                      {it.label}
                    </span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <nav className={`fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center glass px-2 py-1 rounded-full border border-[#C5A059]/30 shadow-2xl shadow-[#202020]/20 gap-0.5 z-50 transition-all duration-200 ${inChat ? "hidden" : ""}`}>
          {TABS.map((tab) => {
            if (tab.id === "plus") {
              return (
                <div key="plus" className="relative px-1.5">
                  <button
                    onClick={() => setPlusOpen(!plusOpen)}
                    className={`w-11 h-11 rounded-full flex items-center justify-center text-white shadow-lg transition-transform duration-300 ${
                      plusOpen
                        ? "bg-[#202020] rotate-[135deg] scale-95"
                        : "bg-[#C5A059] shadow-[#C5A059]/40 active:scale-95"
                    }`}
                  >
                    <Icon name="Plus" size={22} />
                  </button>
                </div>
              );
            }
            if (tab.devNexus) {
              const isActive = activeTab === "hub";
              return (
                <button
                  key="devnexus"
                  onClick={() => { switchTab("hub"); setPlusOpen(false); }}
                  className={cn(
                    "w-11 h-11 flex items-center justify-center rounded-full transition-all duration-300",
                    isActive
                      ? "bg-[#C5A059]/15 text-[#C5A059]"
                      : "text-[#7A7A7A] hover:bg-[#C5A059]/5"
                  )}
                >
                  <Icon name="Layers" size={20} className={isActive ? "animate-[navBounce_0.4s]" : ""} />
                </button>
              );
            }
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  switchTab(tab.id as TabId);
                  setPlusOpen(false);
                }}
                className={cn(
                  "w-11 h-11 flex items-center justify-center rounded-full transition-all duration-300",
                  isActive
                    ? "text-[#C5A059] bg-[#C5A059]/10"
                    : "text-[#7A7A7A] hover:bg-[#C5A059]/5"
                )}
              >
                <Icon
                  name={tab.icon as any}
                  size={20}
                  className={isActive ? "animate-[navBounce_0.4s]" : ""}
                />
              </button>
            );
          })}
        </nav>

        <UniversalSearch
          open={searchOpen}
          onClose={() => setSearchOpen(false)}
          onSelect={openEntity}
        />

        <AnimatePresence>
          {entityRef && (
            <motion.div
              key={`${entityRef.type}-${entityRef.id}`}
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 220 }}
              className="absolute inset-0 z-[115] bg-[#FAF9F6] overflow-y-auto"
            >
              {entityRef.type === "user" ? (
                <ProfileView
                  currentUser={session?.user}
                  viewUserId={entityRef.id}
                  onClose={() => setEntityRef(null)}
                  onOpenCompany={openCompanyHub}
                  onOpenListing={(id) => { setEntityRef(null); setPendingListingId(id); switchTab("marketplace"); }}
                />
              ) : (
                <EntityProfile
                  entity={entityRef}
                  currentUserId={session?.user?.id}
                  onClose={() => setEntityRef(null)}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {companyHubId && (
            <motion.div
              key={`company-hub-${companyHubId}`}
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 220 }}
              className="absolute inset-0 z-[118]"
            >
              <CompanyHub
                companyId={companyHubId}
                currentUser={session ? { id: session.user.id, ...userProfile } : undefined}
                onClose={() => setCompanyHubId(null)}
                onOpenProfile={(userId) => openEntity({ type: "user", id: userId })}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {contentItem && (
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="absolute inset-0 z-[100] bg-[#FAF9F6] flex flex-col"
            >
              <header className="h-14 px-4 border-b border-[#E5E3DB] flex items-center justify-between shrink-0">
                <button
                  onClick={() => setContentItem(null)}
                  className="p-2 hover:bg-[#E5E3DB] rounded-xl"
                >
                  <Icon name="X" />
                </button>
                <div className="flex-1 px-4 truncate text-center">
                  <h3 className="font-bold text-sm truncate">{contentItem.title || "Details"}</h3>
                </div>
                <div className="w-10" />
              </header>
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {(contentItem.image_url || contentItem.media_url) && (
                  <img
                    src={contentItem.image_url || contentItem.media_url}
                    className="w-full rounded-2xl"
                  />
                )}
                <p className="text-[15px] leading-relaxed">
                  {contentItem.content || contentItem.description || contentItem.title}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {session?.user?.id && (
          <NotificationsDrawer
            open={notificationsOpen}
            onClose={() => setNotificationsOpen(false)}
            userId={session.user.id}
          />
        )}

        <SandboxIDE
          open={forgeOpen}
          onClose={() => setForgeOpen(false)}
          namespace="global"
          title="Forge"
        />
      </div>
    </div>
  );
}
