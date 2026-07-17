import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "pwa-install-dismissed-at";
const DISMISS_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari
    (window.navigator as any).standalone === true
  );
}

function isIos() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios|edgios/i.test(navigator.userAgent);
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;

    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
    if (dismissedAt && Date.now() - dismissedAt < DISMISS_MS) return;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setShow(true);
    };

    const onInstalled = () => {
      setShow(false);
      setDeferred(null);
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    // iOS Safari has no beforeinstallprompt — show manual hint
    if (isIos()) {
      const t = setTimeout(() => setIosHint(true), 2500);
      return () => {
        clearTimeout(t);
        window.removeEventListener("beforeinstallprompt", onBeforeInstall);
        window.removeEventListener("appinstalled", onInstalled);
      };
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setShow(false);
    setIosHint(false);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === "accepted" || outcome === "dismissed") {
      setShow(false);
      setDeferred(null);
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    }
  };

  if (!show && !iosHint) return null;

  return (
    <div
      role="dialog"
      aria-label="Install Forum Romanum"
      className="fixed inset-x-0 bottom-0 z-[100] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pointer-events-none"
    >
      <div className="mx-auto max-w-md pointer-events-auto rounded-2xl border border-[#C5A059]/30 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.12)] p-4 flex items-center gap-3">
        <img src="/icon-192.png" alt="" className="h-12 w-12 rounded-xl border border-[#E5E3DB]" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-[#202020]">Install Forum Romanum</div>
          <div className="text-xs text-[#7A7A7A] truncate">
            {show
              ? "Add it to your home screen for a faster, app-like experience."
              : "Tap the Share icon, then “Add to Home Screen”."}
          </div>
        </div>
        {show ? (
          <button
            onClick={install}
            className="shrink-0 rounded-full bg-[#C5A059] px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:brightness-110 active:scale-95"
          >
            Install
          </button>
        ) : null}
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="shrink-0 rounded-full p-2 text-[#7A7A7A] hover:bg-[#F3F1EC]"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
