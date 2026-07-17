import { useState, useEffect, useRef, useCallback, Suspense, lazy } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { getFS, writeFile, persistFS, clearFSStorage, readFile, exists } from "./vfs";
import type { MemFS } from "./vfs";
import { loadZipFile } from "./zipLoader";
import FileTree from "./FileTree";
import {
  type HatchBlockPolicy,
  EMPTY_POLICY,
  isBlocked,
  isReadonly,
  getPartialLines,
  applyPartialView,
  policyFromVFS,
} from "./hatchBlock";

const TerminalPanel = lazy(() => import("./TerminalPanel"));
const EditorPanel = lazy(() => import("./EditorPanel"));
const PreviewPanel = lazy(() => import("./PreviewPanel"));

type Panel = "editor" | "terminal" | "preview";

interface OpenFile {
  path: string;
  content: string;
  dirty: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  namespace?: string;
  initialZipUrl?: string;
  title?: string;
  /** Seller's Hatch username — shown in the sandbox branding bar */
  sellerUsername?: string;
  /** Slugified project name — shown in the sandbox branding bar */
  projectSlug?: string;
  /** Marketplace listing ID — used for the "Buy This Product" link */
  listingId?: string;
  /** Full URL to the marketplace listing */
  listingUrl?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function loadHatchPolicy(fs: MemFS): Promise<HatchBlockPolicy> {
  try {
    const content = await readFile(fs, "/.HatchBlock");
    return policyFromVFS(content);
  } catch {
    return EMPTY_POLICY;
  }
}

async function detectRunCommand(fs: MemFS): Promise<string | null> {
  try {
    const pkgRaw = await readFile(fs, "/package.json");
    const pkg = JSON.parse(pkgRaw);
    if (pkg.scripts?.dev)   return "npm run dev";
    if (pkg.scripts?.start) return "npm start";
    if (pkg.scripts?.serve) return "npm run serve";
    if (pkg.scripts?.["start:dev"]) return "npm run start:dev";
  } catch {}
  // Fallback: detect by entry file
  const checks: [string, string | null][] = [
    ["/server.js", "node server.js"],
    ["/index.js", "node index.js"],
    ["/main.js", "node main.js"],
    ["/app.js", "node app.js"],
    ["/main.py", "python main.py"],
    ["/app.py", "python app.py"],
    ["/server.py", "python server.py"],
    ["/index.php", "php -S localhost:8080 index.php"],
    ["/index.html", null],
  ];
  for (const [path, cmd] of checks) {
    if (await exists(fs, path)) return cmd;
  }
  return null;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SandboxIDE({
  open, onClose,
  namespace = "default", initialZipUrl, title,
  sellerUsername, projectSlug, listingId, listingUrl,
}: Props) {
  const [fs, setFs] = useState<MemFS | null>(null);
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>("editor");
  const [refreshTick, setRefreshTick] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [zipLoaded, setZipLoaded] = useState(false);
  const [treeOpen, setTreeOpen] = useState(true);
  const [previewTick, setPreviewTick] = useState(0);
  const [previewDir, setPreviewDir] = useState<string>("/");
  const [shellSessionId, setShellSessionId] = useState<string | null>(null);
  const [shellPort, setShellPort] = useState<number | null>(null);
  const [shellProxyBase, setShellProxyBase] = useState<string>("/api/sandbox");
  const [previewMode, setPreviewMode] = useState<"static" | "server" | "proxy">("static");
  const [hatchPolicy, setHatchPolicy] = useState<HatchBlockPolicy>(EMPTY_POLICY);
  const [detectedRunCmd, setDetectedRunCmd] = useState<string | null>(null);
  const swReadyRef = useRef(false);

  const [terminalEverShown, setTerminalEverShown] = useState(false);

  const zipInputRef = useRef<HTMLInputElement>(null);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Register Service Worker ──────────────────────────────────────────────
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sandbox-sw.js", { scope: "/" }).then((reg) => {
      swReadyRef.current = true;
      reg.update();
    }).catch(() => {});

    const handler = (event: MessageEvent) => {
      const { type, req, path: filePath } = event.data ?? {};
      const port = event.ports[0];

      if (type === "SANDBOX_FETCH") {
        import("./nodePolyfills").then(({ virtualServerHandlers }) => {
          const handler = [...virtualServerHandlers.values()][0];
          if (!handler) { port?.postMessage({ status: 503, body: "No server running" }); return; }

          const chunks: string[] = [];
          const resObj = {
            statusCode: 200,
            _headers: {} as Record<string, string>,
            setHeader(k: string, v: string) { this._headers[k.toLowerCase()] = v; },
            getHeader(k: string) { return this._headers[k.toLowerCase()]; },
            removeHeader(k: string) { delete this._headers[k.toLowerCase()]; },
            writeHead(code: number, hdrs?: any) { this.statusCode = code; if (hdrs) Object.assign(this._headers, hdrs); },
            write(chunk: any) { chunks.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk)); return true; },
            end(chunk?: any) {
              if (chunk != null) this.write(chunk);
              port?.postMessage({ status: this.statusCode, headers: this._headers, body: chunks.join("") });
            },
            json(obj: any) { this.setHeader("content-type", "application/json"); this.end(JSON.stringify(obj)); },
            send(data: any) { typeof data === "object" ? this.json(data) : this.end(String(data)); },
            status(code: number) { this.statusCode = code; return this; },
            redirect(url: string) { this.statusCode = 302; this.setHeader("location", url); this.end(""); },
          };

          const url = req.url ?? "/";
          const qs = url.includes("?") ? url.split("?")[1] : "";
          const pathname = url.split("?")[0];

          const reqObj = {
            url, method: req.method ?? "GET", headers: req.headers ?? {},
            body: req.body ?? "", rawBody: req.body ?? "",
            path: pathname, query: Object.fromEntries(new URLSearchParams(qs)),
            params: {}, socket: { remoteAddress: "127.0.0.1" },
            on: (_: string, __: Function) => reqObj,
          };

          try { handler(reqObj, resObj); }
          catch (e: any) { port?.postMessage({ status: 500, body: e.message }); }
        });
      }

      if (type === "SANDBOX_READ_FILE" && filePath) {
        const currentFs = fsRef.current;
        if (!currentFs) { port?.postMessage({ error: "FS not ready" }); return; }
        import("./vfs").then(({ readFile, resolvePath }) => {
          const staticDir = previewDirRef.current;
          const resolved = filePath.startsWith("/") ? filePath : resolvePath(staticDir, filePath);
          readFile(currentFs, resolved)
            .then(content => port?.postMessage({ content }))
            .catch(() => port?.postMessage({ error: "File not found" }));
        });
      }
    };
    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, []);

  const fsRef = useRef<typeof fs>(null);
  const previewDirRef = useRef("/");
  useEffect(() => { fsRef.current = fs; }, [fs]);
  useEffect(() => { previewDirRef.current = previewDir; }, [previewDir]);

  // ─── Init FS on open ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const memFS = getFS(namespace);
    setFs(memFS);

    const unsub = memFS.onChange(() => {
      setRefreshTick((t) => t + 1);
      if (persistTimer.current) clearTimeout(persistTimer.current);
      persistTimer.current = setTimeout(() => persistFS(namespace), 2000);
    });

    return () => unsub();
  }, [open, namespace]);

  useEffect(() => {
    if (panel === "terminal") setTerminalEverShown(true);
  }, [panel]);

  // ─── Auto-load ZIP from URL ───────────────────────────────────────────────
  useEffect(() => {
    if (!open || !initialZipUrl || !fs || zipLoaded) return;
    (async () => {
      try {
        setUploading(true);
        const { loadZipUrl } = await import("./zipLoader");
        await loadZipUrl(fs, initialZipUrl);
        setZipLoaded(true);
        setRefreshTick((t) => t + 1);
        const policy = await loadHatchPolicy(fs);
        setHatchPolicy(policy);
        const cmd = await detectRunCommand(fs);
        setDetectedRunCmd(cmd);
      } catch (e: any) {
        console.error("Failed to load ZIP:", e);
      } finally {
        setUploading(false);
      }
    })();
  }, [open, initialZipUrl, fs, zipLoaded]);

  // ─── Prevent body scroll when open ────────────────────────────────────────
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      document.body.style.touchAction = "none";
    } else {
      document.body.style.overflow = "";
      document.body.style.touchAction = "";
    }
    return () => {
      document.body.style.overflow = "";
      document.body.style.touchAction = "";
    };
  }, [open]);

  // ─── File operations ──────────────────────────────────────────────────────
  const openFile = useCallback((path: string, content: string) => {
    if (isBlocked(hatchPolicy, path)) return;
    const maxLines = getPartialLines(hatchPolicy, path);
    const displayContent = maxLines !== null ? applyPartialView(content, maxLines) : content;

    setOpenFiles((prev) => {
      if (prev.find((f) => f.path === path)) return prev;
      return [...prev, { path, content: displayContent, dirty: false }];
    });
    setActiveFilePath(path);
    setPanel("editor");
  }, [hatchPolicy]);

  const closeFile = useCallback((path: string) => {
    setOpenFiles((prev) => {
      const next = prev.filter((f) => f.path !== path);
      if (activeFilePath === path) {
        setActiveFilePath(next.length > 0 ? next[next.length - 1].path : null);
      }
      return next;
    });
  }, [activeFilePath]);

  const onEditorChange = useCallback(async (path: string, content: string) => {
    if (!fs || isReadonly(hatchPolicy, path)) return;
    setOpenFiles((prev) =>
      prev.map((f) => f.path === path ? { ...f, content, dirty: true } : f)
    );
    await writeFile(fs, path, content);
    setPreviewTick((t) => t + 1);
  }, [fs, hatchPolicy]);

  const saveActiveFile = useCallback(async () => {
    if (!fs || !activeFilePath || isReadonly(hatchPolicy, activeFilePath)) return;
    const file = openFiles.find((f) => f.path === activeFilePath);
    if (!file) return;
    await writeFile(fs, file.path, file.content);
    setOpenFiles((prev) =>
      prev.map((f) => f.path === activeFilePath ? { ...f, dirty: false } : f)
    );
    persistFS(namespace);
  }, [fs, activeFilePath, openFiles, namespace, hatchPolicy]);

  // ─── ZIP upload ───────────────────────────────────────────────────────────
  const onZipUpload = async (file: File) => {
    if (!fs) return;
    setUploading(true);
    try {
      await loadZipFile(fs, file);
      setRefreshTick((t) => t + 1);
      // Parse .HatchBlock protection config
      const policy = await loadHatchPolicy(fs);
      setHatchPolicy(policy);
      // Detect project type & run command
      const cmd = await detectRunCommand(fs);
      setDetectedRunCmd(cmd);
    } catch (e: any) {
      alert(`ZIP load failed: ${e.message}`);
    } finally {
      setUploading(false);
    }
  };

  // ─── Keyboard shortcuts ───────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInTerminal = target.classList.contains("xterm-helper-textarea") ||
        target.closest?.(".xterm");
      const isInEditor = target.closest?.(".cm-editor");

      if (!isInTerminal && !isInEditor) {
        if ((e.metaKey || e.ctrlKey) && e.key === "s") {
          e.preventDefault();
          saveActiveFile();
        }
        if (e.key === "Escape") {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, saveActiveFile, onClose]);

  const activeFile = openFiles.find((f) => f.path === activeFilePath) ?? null;
  const activeFileReadOnly = activeFilePath ? isReadonly(hatchPolicy, activeFilePath) : false;

  // Derived policy arrays for FileTree
  const policyBlockedPaths = hatchPolicy.blocked;
  const policyReadonlyPaths = [
    ...Object.keys(hatchPolicy.partial),
    ...hatchPolicy.readonly,
  ];

  const hasHatchBlock = hatchPolicy.blocked.length > 0 ||
    Object.keys(hatchPolicy.partial).length > 0 ||
    hatchPolicy.readonly.length > 0;

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 flex flex-col"
      style={{
        zIndex: 9999,
        background: "#0D0D0B",
        overflow: "hidden",
        overscrollBehavior: "none",
        touchAction: "none",
        userSelect: "none",
      }}
      onTouchMove={(e) => e.preventDefault()}
    >
      {/* ─── Persistent Branding Header (Part 2.4) ───────────────────────── */}
      {(sellerUsername || projectSlug) && (
        <BrandingBar
          sellerUsername={sellerUsername}
          projectSlug={projectSlug}
          listingUrl={listingUrl}
          hasHatchBlock={hasHatchBlock}
        />
      )}

      {/* ─── Top bar ─────────────────────────────────────────────────────── */}
      <TopBar
        title={title}
        activeFile={activeFilePath}
        panel={panel}
        setPanel={setPanel}
        treeOpen={treeOpen}
        setTreeOpen={setTreeOpen}
        uploading={uploading}
        onZipClick={() => zipInputRef.current?.click()}
        onClear={() => {
          if (confirm("Clear all files in this workspace?")) {
            clearFSStorage(namespace);
            setOpenFiles([]);
            setActiveFilePath(null);
            setHatchPolicy(EMPTY_POLICY);
            setDetectedRunCmd(null);
            setRefreshTick((t) => t + 1);
          }
        }}
        onClose={onClose}
      />

      {/* ─── File tabs ───────────────────────────────────────────────────── */}
      <AnimatePresence>
        {openFiles.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 30, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="flex items-stretch overflow-x-auto no-scrollbar shrink-0 border-b"
            style={{ background: "#0D0D0B", borderColor: "#1A1A18" }}
          >
            {openFiles.map((f) => {
              const name = f.path.split("/").pop() ?? f.path;
              const isActive = f.path === activeFilePath;
              const ro = isReadonly(hatchPolicy, f.path);
              return (
                <button
                  key={f.path}
                  onClick={() => { setActiveFilePath(f.path); setPanel("editor"); }}
                  className="flex items-center gap-1.5 px-3 shrink-0 transition-colors relative text-[10.5px] font-mono"
                  style={{
                    color: isActive ? "#E8E6E0" : "#555550",
                    borderRight: "1px solid #1A1A18",
                    userSelect: "none",
                  }}
                >
                  {isActive && (
                    <div className="absolute bottom-0 left-0 right-0 h-[1.5px] bg-[#C5A059]" />
                  )}
                  <span className="truncate max-w-[90px]">{name}</span>
                  {ro && <span className="text-[8px]" style={{ color: "#C5A05980" }}>🔒</span>}
                  {f.dirty && !ro && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#C5A059] shrink-0" />
                  )}
                  <span
                    className="text-[#333330] hover:text-[#E05C5C] transition-colors text-[12px] leading-none ml-0.5"
                    style={{ userSelect: "none" }}
                    onClick={(e) => { e.stopPropagation(); closeFile(f.path); }}
                  >
                    ×
                  </span>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Main workspace ──────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">
        {/* File tree */}
        <AnimatePresence initial={false}>
          {treeOpen && fs && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 188, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="shrink-0 border-r overflow-hidden"
              style={{ borderColor: "#1A1A18" }}
            >
              <FileTree
                fs={fs}
                activeFile={activeFilePath}
                onOpenFile={openFile}
                refreshTick={refreshTick}
                blockedPaths={policyBlockedPaths}
                readonlyPaths={policyReadonlyPaths}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Content area */}
        <div className="flex-1 min-w-0 min-h-0 relative">

          {/* EDITOR */}
          <div
            className="absolute inset-0"
            style={{ display: panel === "editor" ? "flex" : "none", flexDirection: "column" }}
          >
            {activeFile ? (
              <Suspense fallback={<Loader />}>
                <EditorPanel
                  key={activeFile.path}
                  path={activeFile.path}
                  content={activeFile.content}
                  onChange={(c) => onEditorChange(activeFile.path, c)}
                  readOnly={activeFileReadOnly}
                />
              </Suspense>
            ) : (
              fs && (
                <WelcomeScreen
                  detectedRunCmd={detectedRunCmd}
                  onNewFile={() => {
                    const name = prompt("New file name:", "index.html");
                    if (!name || !fs) return;
                    writeFile(fs, `/${name}`, getTemplate(name)).then(() => {
                      fs.promises
                        .readFile(`/${name}`, { encoding: "utf8" })
                        .then((c) => openFile(`/${name}`, c as string));
                    });
                  }}
                />
              )
            )}
          </div>

          {/* TERMINAL */}
          <div
            className="absolute inset-0"
            style={{ display: panel === "terminal" ? "flex" : "none", flexDirection: "column" }}
          >
            {terminalEverShown && (
              <Suspense fallback={<Loader />}>
                <TerminalPanel
                  fs={fs}
                  onFSChange={() => setRefreshTick((t) => t + 1)}
                  onSessionCreated={(sessionId, port) => {
                    setShellSessionId(sessionId);
                    setShellPort(port);
                    setShellProxyBase("/api/shell");
                    setPreviewMode("proxy");
                  }}
                />
              </Suspense>
            )}
          </div>

          {/* PREVIEW */}
          <div
            className="absolute inset-0 flex flex-col"
            style={{ display: panel === "preview" ? "flex" : "none" }}
          >
            <div
              className="flex items-center px-3 h-8 shrink-0 border-b gap-2"
              style={{ background: "#111110", borderColor: "#1A1A18" }}
            >
              <span className="text-[10px] text-[#555550] font-mono">🌐 Preview</span>
              <div className="flex-1" />
              <button
                onClick={() => setPreviewTick((t) => t + 1)}
                className="text-[10px] text-[#555550] hover:text-[#C5A059] transition-colors px-1.5 py-0.5 rounded font-mono"
              >
                ↺ refresh
              </button>
              {/* ── New-tab warning button (Part 1.3) ─────────────────── */}
              <button
                onClick={() =>
                  alert(
                    "Sandbox preview must run inside the Hatch window.\n\n" +
                    "Opening in a new tab is not supported — the sandbox uses a Service Worker " +
                    "that requires the parent window context to read files from IndexedDB. " +
                    "The page would load forever and have no CSS or assets in a separate tab."
                  )
                }
                className="text-[10px] text-[#333330] hover:text-[#555550] transition-colors px-1.5 py-0.5 rounded font-mono"
                title="Cannot open in new tab — sandbox requires parent window context"
              >
                ⤢ new tab
              </button>
            </div>
            <div className="flex-1 min-h-0">
              {fs && (
                <Suspense fallback={<Loader />}>
                  <PreviewPanel
                    fs={fs}
                    refreshTick={previewTick}
                    dir={previewDir}
                    mode={previewMode}
                    sessionId={shellSessionId}
                    proxyBase={shellProxyBase}
                  />
                </Suspense>
              )}
            </div>
          </div>

        </div>
      </div>

      <input
        ref={zipInputRef}
        type="file"
        accept=".zip"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onZipUpload(e.target.files[0])}
      />
    </div>,
    document.body
  );
}

// ─── Branding Bar (Part 2.4) ──────────────────────────────────────────────────
// Non-removable — rendered unconditionally when seller info is present.
// Cannot be hidden or overridden by uploaded project code.

function BrandingBar({
  sellerUsername, projectSlug, listingUrl, hasHatchBlock,
}: {
  sellerUsername?: string;
  projectSlug?: string;
  listingUrl?: string;
  hasHatchBlock: boolean;
}) {
  return (
    <div
      className="flex items-center justify-between px-4 shrink-0 border-b gap-3"
      style={{
        height: 32,
        background: "#0A0A08",
        borderColor: "#1A1A14",
        zIndex: 10,
      }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-[#C5A059] font-mono font-black text-[11px] shrink-0">⚡ Hatch Sandbox</span>
        {(sellerUsername || projectSlug) && (
          <>
            <span className="text-[#2A2A28] text-[10px]">|</span>
            <span className="text-[#7A7A7A] text-[10px] font-mono truncate">
              {sellerUsername && <span style={{ color: "#9A9A98" }}>@{sellerUsername}</span>}
              {sellerUsername && projectSlug && <span style={{ color: "#3A3A38" }}> / </span>}
              {projectSlug && <span>{projectSlug}</span>}
            </span>
          </>
        )}
        {hasHatchBlock && (
          <>
            <span className="text-[#2A2A28] text-[10px]">|</span>
            <span className="text-[10px] font-mono" style={{ color: "#6A5A38" }}>
              🔒 Protected by .HatchBlock
            </span>
          </>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[9px] font-mono" style={{ color: "#3A3A38" }}>
          Try before you buy
        </span>
        {listingUrl && (
          <a
            href={listingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded transition-all font-mono"
            style={{ background: "#C5A059", color: "#0D0D0B" }}
            onClick={(e) => e.stopPropagation()}
          >
            Buy This Product
          </a>
        )}
      </div>
    </div>
  );
}

// ─── Top Bar ─────────────────────────────────────────────────────────────────

function TopBar({
  title, activeFile, panel, setPanel, treeOpen, setTreeOpen,
  uploading, onZipClick, onClear, onClose,
}: {
  title?: string;
  activeFile: string | null;
  panel: Panel;
  setPanel: (p: Panel) => void;
  treeOpen: boolean;
  setTreeOpen: (v: boolean) => void;
  uploading: boolean;
  onZipClick: () => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const fileName = activeFile?.split("/").pop();

  return (
    <div
      className="flex items-center px-3 gap-2 shrink-0 border-b"
      style={{ height: 40, background: "#0D0D0B", borderColor: "#1A1A18" }}
    >
      {/* Brand */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-[#C5A059] font-mono font-black text-[12px] tracking-tight">⚡forge</span>
        {title && (
          <>
            <span className="text-[#2A2A28] text-[11px]">/</span>
            <span className="text-[#555550] text-[11px] font-mono truncate max-w-[100px]">{title}</span>
          </>
        )}
        {fileName && (
          <>
            <span className="text-[#2A2A28] text-[11px]">/</span>
            <span className="text-[#7A7A7A] text-[10px] font-mono truncate max-w-[80px]">{fileName}</span>
          </>
        )}
      </div>

      <div className="flex-1" />

      {/* Panel switcher */}
      <div
        className="flex items-center rounded-lg overflow-hidden shrink-0"
        style={{ background: "#1A1A18", padding: "2px" }}
      >
        {([
          { id: "editor", label: "Editor", icon: "⌨" },
          { id: "terminal", label: "Terminal", icon: ">_" },
          { id: "preview", label: "Preview", icon: "⬚" },
        ] as const).map(({ id, label, icon }) => (
          <button
            key={id}
            onClick={() => setPanel(id)}
            title={label}
            className="px-2 py-1 rounded-md text-[9.5px] font-bold uppercase tracking-wider transition-all font-mono"
            style={{
              color: panel === id ? "#0D0D0B" : "#555550",
              background: panel === id ? "#C5A059" : "transparent",
            }}
          >
            {icon}
          </button>
        ))}
      </div>

      {/* Tree toggle */}
      <button
        onClick={() => setTreeOpen(!treeOpen)}
        title="File tree"
        className="w-6 h-6 flex items-center justify-center rounded transition-colors text-[11px] font-mono shrink-0"
        style={{ color: treeOpen ? "#C5A059" : "#555550" }}
      >
        ☰
      </button>

      {/* Upload ZIP */}
      <button
        onClick={onZipClick}
        disabled={uploading}
        title="Upload ZIP"
        className="w-6 h-6 flex items-center justify-center rounded transition-colors text-[12px] shrink-0"
        style={{ color: uploading ? "#C5A059" : "#555550" }}
      >
        {uploading ? "⏳" : "⇪"}
      </button>

      {/* Separator */}
      <div className="w-px h-4 shrink-0" style={{ background: "#1A1A18" }} />

      {/* Close */}
      <button
        onClick={onClose}
        className="w-6 h-6 flex items-center justify-center rounded transition-colors text-[13px] shrink-0"
        style={{ color: "#555550" }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "#E8E6E0")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "#555550")}
      >
        ✕
      </button>
    </div>
  );
}

// ─── Welcome screen ───────────────────────────────────────────────────────────

function WelcomeScreen({ onNewFile, detectedRunCmd }: { onNewFile: () => void; detectedRunCmd: string | null }) {
  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center gap-5 p-8 select-none"
      style={{ background: "#0D0D0B" }}
    >
      <div className="text-center">
        <div className="text-[#C5A059] font-mono font-black text-[22px] tracking-tight mb-1">⚡ forge</div>
        <p className="text-[#555550] text-[12px] leading-relaxed">
          Open a file from the tree, upload a ZIP,
          <br />or create a new file to get started.
        </p>
      </div>

      <div className="flex flex-col gap-2 w-full max-w-[200px]">
        <button
          onClick={onNewFile}
          className="flex items-center justify-center gap-2 h-9 rounded-xl text-[11px] font-bold tracking-wider uppercase transition-all"
          style={{ background: "#C5A059", color: "#0D0D0B" }}
        >
          + New File
        </button>
      </div>

      {/* Detected run command (Part 3.1) */}
      {detectedRunCmd && (
        <div
          className="text-[10px] font-mono text-center leading-relaxed px-4 py-3 rounded-xl w-full max-w-[240px]"
          style={{ background: "#0A1A0A", color: "#7DBF8E", border: "1px solid #1A2A1A" }}
        >
          <span style={{ color: "#555550" }}>detected start command:</span>
          <br />
          <span style={{ color: "#94D4A3" }}>$ {detectedRunCmd}</span>
        </div>
      )}

      <div
        className="text-[10px] font-mono text-center leading-relaxed px-4 py-3 rounded-xl"
        style={{ background: "#111110", color: "#555550", border: "1px solid #1A1A18" }}
      >
        <span style={{ color: "#C5A059" }}>$</span>{" "}
        <span style={{ color: "#7A7A7A" }}>git clone https://github.com/you/repo</span>
        <br />
        <span style={{ color: "#C5A059" }}>$</span>{" "}
        <span style={{ color: "#7A7A7A" }}>node index.js</span>
        <br />
        <span style={{ color: "#C5A059" }}>$</span>{" "}
        <span style={{ color: "#7A7A7A" }}>python main.py</span>
      </div>
    </div>
  );
}

function Loader() {
  return (
    <div
      className="w-full h-full flex items-center justify-center"
      style={{ background: "#0D0D0B" }}
    >
      <span className="text-[#555550] text-[11px] font-mono animate-pulse">Loading…</span>
    </div>
  );
}

// ─── File templates ───────────────────────────────────────────────────────────

function getTemplate(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "html": case "htm":
      return `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n  <title>App</title>\n  <link rel="stylesheet" href="style.css" />\n</head>\n<body>\n  <h1>Hello, Forge!</h1>\n  <script src="app.js"></script>\n</body>\n</html>\n`;
    case "js": case "mjs":
      return `// main script\nconsole.log("Hello from Forge!");\n`;
    case "css":
      return `/* styles */\nbody {\n  font-family: sans-serif;\n  margin: 0;\n  padding: 2rem;\n  background: #faf9f6;\n  color: #202020;\n}\n`;
    case "py":
      return `# Python\nprint("Hello from Forge!")\n`;
    case "ts":
      return `// TypeScript\nconst greet = (name: string) => \`Hello, \${name}!\`;\nconsole.log(greet("Forge"));\n`;
    case "json":
      return `{\n  "name": "my-project",\n  "version": "1.0.0"\n}\n`;
    case "md":
      return `# My Project\n\nWelcome to Forge.\n`;
    default:
      return "";
  }
}
