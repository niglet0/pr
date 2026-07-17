import { useState, useEffect } from "react";
import type { MemFS } from "./vfs";
import { readFile, exists } from "./vfs";

interface Props {
  fs: MemFS;
  refreshTick: number;
  dir?: string;
  mode?: "static" | "server" | "proxy";
  sessionId?: string | null;
  /** Base path for proxy sessions. Defaults to /api/sandbox (legacy). Use /api/shell for PTY sessions. */
  proxyBase?: string;
}

function joinPath(dir: string, file: string): string {
  const base = dir.endsWith("/") ? dir : dir + "/";
  return base + file;
}

// Script injected into every static preview page to fix navigation issues:
// 1. target="_blank" links → same-frame navigation (iframes can't open new tabs)
// 2. Absolute URL links that should be relative → rewrite to /__sandbox_page__
const NAV_FIX_SCRIPT = `<script>
(function() {
  function fixLinks() {
    document.querySelectorAll('a[href]').forEach(function(a) {
      // Convert _blank → _self so clicks navigate within the iframe
      if (a.target === '_blank' || a.target === '_top' || a.target === '_parent') {
        a.target = '_self';
      }
    });
  }
  fixLinks();
  // Re-run when DOM updates (SPAs, dynamically added links)
  if (typeof MutationObserver !== 'undefined') {
    new MutationObserver(fixLinks).observe(document.body || document.documentElement, {
      childList: true, subtree: true
    });
  }
})();
</script>`;

// ─── Static HTML mode: inline srcdoc with inlined assets ─────────────────────

async function buildStaticHTML(fs: MemFS, dir: string): Promise<string | null> {
  const tryPaths = [joinPath(dir, "index.html"), joinPath(dir, "index.htm")];
  let htmlPath: string | null = null;
  for (const p of tryPaths) { if (await exists(fs, p)) { htmlPath = p; break; } }
  if (!htmlPath) return null;
  let html = await readFile(fs, htmlPath);
  html = await inlineAssets(fs, dir, html);
  // Inject base tag so relative links navigate through the SW static file handler
  const base = `<base href="/__sandbox_page__${dir.endsWith("/") ? dir : dir + "/"}">`;
  // Inject nav-fix script just before </head> (or at start of <head>)
  html = html.replace(/<\/head>/i, `  ${NAV_FIX_SCRIPT}\n</head>`);
  html = html.replace(/<head>/i, `<head>\n  ${base}`);
  if (!html.includes(base)) {
    // No <head> tag at all — prepend both
    html = `<head>${base}${NAV_FIX_SCRIPT}</head>` + html;
  }
  return html;
}

async function inlineAssets(fs: MemFS, dir: string, html: string): Promise<string> {
  html = await replaceAsync(
    html,
    /<link\s+[^>]*href=["']([^"']+\.css)["'][^>]*>/gi,
    async (match, href) => {
      if (href.startsWith("http") || href.startsWith("//") || href.startsWith("data:")) return match;
      const resolved = href.startsWith("/") ? href : joinPath(dir, href);
      try { return `<style>/* ${href} */\n${await readFile(fs, resolved)}</style>`; } catch { return match; }
    }
  );
  html = await replaceAsync(
    html,
    /<script\s+[^>]*src=["']([^"']+\.(?:js|mjs))["'][^>]*><\/script>/gi,
    async (match, src) => {
      if (src.startsWith("http") || src.startsWith("//") || src.startsWith("data:")) return match;
      const resolved = src.startsWith("/") ? src : joinPath(dir, src);
      try { return `<script>/* ${src} */\n${await readFile(fs, resolved)}</script>`; } catch { return match; }
    }
  );
  return html;
}

async function replaceAsync(str: string, regex: RegExp, fn: (m: string, ...a: any[]) => Promise<string>): Promise<string> {
  const promises: Promise<string>[] = [];
  str.replace(regex, (m, ...a) => { promises.push(fn(m, ...a)); return m; });
  const replacements = await Promise.all(promises);
  let i = 0;
  return str.replace(regex, () => replacements[i++]);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PreviewPanel({
  fs,
  refreshTick,
  dir = "/",
  mode = "static",
  sessionId,
  proxyBase = "/api/sandbox",
}: Props) {
  const [srcDoc, setSrcDoc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [noHtml, setNoHtml] = useState(false);

  useEffect(() => {
    if (mode === "proxy" || mode === "server") {
      setSrcDoc(null);
      setNoHtml(false);
      setLoading(false);
      return;
    }
    // Static mode
    setLoading(true);
    buildStaticHTML(fs, dir).then((html) => {
      if (html) { setSrcDoc(html); setNoHtml(false); }
      else setNoHtml(true);
      setLoading(false);
    });
  }, [fs, refreshTick, dir, mode]);

  // ── Proxy mode: iframe points to backend proxy endpoint ───────────────────
  if (mode === "proxy" && sessionId) {
    return (
      <iframe
        key={`proxy-${refreshTick}-${sessionId}`}
        src={`${proxyBase}/${sessionId}/proxy/`}
        className="w-full h-full border-0"
        title="Preview"
        style={{ background: "#FFFFFF" }}
        sandbox="allow-scripts allow-forms allow-modals allow-same-origin allow-popups"
      />
    );
  }

  // ── Server mode: iframe points to Service Worker virtual server ───────────
  if (mode === "server") {
    return (
      <iframe
        key={`server-${refreshTick}`}
        src="/__sandbox_server__/"
        className="w-full h-full border-0"
        title="Preview"
        style={{ background: "#FFFFFF" }}
        sandbox="allow-scripts allow-forms allow-modals allow-same-origin"
      />
    );
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center" style={{ background: "#111110" }}>
        <div className="text-[#555550] text-[12px]">Building preview…</div>
      </div>
    );
  }

  // ── No HTML found ──────────────────────────────────────────────────────────
  if (noHtml) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-6" style={{ background: "#111110" }}>
        <span className="text-4xl">🌐</span>
        <p className="text-[#555550] text-[12px] text-center leading-relaxed">
          No <code className="text-[#C5A059] font-mono">index.html</code> found.<br />
          Create one to see a live preview.
        </p>
        <pre className="text-[10px] text-[#333330] font-mono mt-2">
{`<!DOCTYPE html>
<html>
<head><title>My App</title></head>
<body>
  <h1>Hello, Forge!</h1>
</body>
</html>`}
        </pre>
      </div>
    );
  }

  // ── Static srcdoc ──────────────────────────────────────────────────────────
  return (
    <iframe
      key={`static-${refreshTick}-${dir}`}
      srcDoc={srcDoc ?? ""}
      sandbox="allow-scripts allow-forms allow-modals allow-same-origin"
      className="w-full h-full border-0"
      title="Preview"
      style={{ background: "#FFFFFF" }}
    />
  );
}
