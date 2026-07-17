import { useEffect, useRef, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import type { MemFS } from "./vfs";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  fs: MemFS | null;
  onFSChange?: () => void;
  onSessionCreated?: (sessionId: string, port: number) => void;
}

const THEME = {
  background: "#0D0D0B",
  foreground: "#E8E6E0",
  cursor: "#C5A059",
  cursorAccent: "#0D0D0B",
  selectionBackground: "#C5A05938",
  black: "#1E1E1C",
  red: "#E06C6C",
  green: "#7DBF8E",
  yellow: "#C5A059",
  blue: "#6699CC",
  magenta: "#B57BC0",
  cyan: "#5EAAB5",
  white: "#E8E6E0",
  brightBlack: "#555550",
  brightRed: "#FF8A8A",
  brightGreen: "#94D4A3",
  brightYellow: "#E8C07A",
  brightBlue: "#8AB4D4",
  brightMagenta: "#D4A0D4",
  brightCyan: "#80C8D4",
  brightWhite: "#FFFFFF",
};

/** Recursively read all files from the VFS into a flat array. */
async function getAllVFSFiles(
  fs: MemFS,
  dir = "/",
): Promise<Array<{ path: string; content: string }>> {
  const result: Array<{ path: string; content: string }> = [];
  try {
    const entries = (await fs.promises.readdir(dir)) as string[];
    for (const entry of entries) {
      if (entry === ".git") continue; // skip git objects (large + binary)
      const fullPath = dir === "/" ? `/${entry}` : `${dir}/${entry}`;
      try {
        const stat = (await fs.promises.stat(fullPath)) as { isDirectory(): boolean };
        if (stat.isDirectory()) {
          result.push(...(await getAllVFSFiles(fs, fullPath)));
        } else {
          try {
            const content = (await fs.promises.readFile(fullPath, {
              encoding: "utf8",
            })) as string;
            result.push({ path: fullPath, content });
          } catch {
            // skip binary files that can't be decoded as UTF-8
          }
        }
      } catch {}
    }
  } catch {}
  return result;
}

export default function TerminalPanel({ fs, onSessionCreated }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const onSessionCreatedRef = useRef(onSessionCreated);
  onSessionCreatedRef.current = onSessionCreated;

  const sendResize = useCallback((term: Terminal, ws: WebSocket) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
    }
  }, []);

  const destroySession = useCallback(() => {
    const id = sessionIdRef.current;
    if (id) {
      fetch(`/api/shell/${id}`, { method: "DELETE" }).catch(() => {});
      sessionIdRef.current = null;
    }
    const ws = wsRef.current;
    if (ws) {
      ws.onclose = null;
      ws.onerror = null;
      if (ws.readyState < WebSocket.CLOSING) ws.close();
      wsRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!containerRef.current || termRef.current) return;

    // ── Build terminal ───────────────────────────────────────────────────────
    const term = new Terminal({
      theme: THEME,
      fontFamily:
        '"JetBrains Mono", "Fira Code", ui-monospace, "Cascadia Code", monospace',
      fontSize: 13,
      lineHeight: 1.5,
      cursorBlink: true,
      cursorStyle: "bar",
      cursorWidth: 2,
      convertEol: true,
      scrollback: 5000,
      allowProposedApi: true,
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    termRef.current = term;
    fitRef.current = fit;

    requestAnimationFrame(() => {
      fit.fit();
      term.focus();
    });

    term.writeln(
      `\x1b[33m\x1b[1m  ⚡ Forge Terminal\x1b[0m  \x1b[2m— starting real Linux shell…\x1b[0m`,
    );

    // ── Async bootstrap ──────────────────────────────────────────────────────
    let disposed = false;

    (async () => {
      // 1. Auth token (optional for guests — server will reject if unauthed)
      let authToken: string | undefined;
      try {
        const { data } = await supabase.auth.getSession();
        authToken = data.session?.access_token;
      } catch {}

      if (disposed) return;

      if (!authToken) {
        term.writeln(
          `\r\n\x1b[31m  Sign in to use the terminal.\x1b[0m\r\n` +
          `\x1b[2m  The shell runs real Linux processes and requires authentication.\x1b[0m`,
        );
        return;
      }

      // 2. Snapshot VFS files to send to the server
      term.writeln(`\x1b[2m  Syncing workspace files…\x1b[0m`);
      const files = fs ? await getAllVFSFiles(fs) : [];

      if (disposed) return;

      // 3. Create shell session
      let sessionId: string;
      let port: number;
      let wsToken: string;
      try {
        const resp = await fetch("/api/shell/create", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({ files, cwd: "/" }),
        });

        if (!resp.ok) {
          const err = await resp.json().catch(() => ({ error: resp.statusText }));
          term.writeln(
            `\r\n\x1b[31m  Shell error: ${err.error ?? "Failed to start"}\x1b[0m`,
          );
          return;
        }

        const data = await resp.json();
        sessionId = data.sessionId;
        port = data.port;
        wsToken = data.wsToken as string;
      } catch (e: any) {
        term.writeln(`\r\n\x1b[31m  Connection failed: ${e.message}\x1b[0m`);
        return;
      }

      if (disposed) {
        fetch(`/api/shell/${sessionId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${authToken}` },
        }).catch(() => {});
        return;
      }

      sessionIdRef.current = sessionId;
      onSessionCreatedRef.current?.(sessionId, port);

      // 4. Open WebSocket — authenticate via ?token=<wsToken> (single-use)
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(
        `${proto}//${window.location.host}/api/shell/${sessionId}/ws?token=${encodeURIComponent(wsToken)}`,
      );
      wsRef.current = ws;
      ws.binaryType = "arraybuffer";

      ws.onopen = () => {
        if (disposed) { ws.close(); return; }
        term.clear();
        term.writeln(
          `\x1b[33m\x1b[1m  ⚡ Forge Terminal\x1b[0m  ` +
          `\x1b[2m— real Linux shell  •  $PORT=\x1b[0m\x1b[36m${port}\x1b[0m`,
        );
        term.writeln(
          `\x1b[2m  ${files.length} file${files.length !== 1 ? "s" : ""} synced to /  ` +
          `—  run any Linux command (npm, node, python, git, vim…)\x1b[0m\r\n`,
        );
        sendResize(term, ws);
      };

      ws.onmessage = (event) => {
        const chunk =
          typeof event.data === "string"
            ? event.data
            : new TextDecoder().decode(event.data as ArrayBuffer);
        term.write(chunk);
      };

      ws.onclose = () => {
        if (!disposed)
          term.writeln("\r\n\x1b[33m  [shell disconnected]\x1b[0m");
      };

      ws.onerror = () => {
        if (!disposed)
          term.writeln("\r\n\x1b[31m  [WebSocket error — check API server logs]\x1b[0m");
      };

      // 5. xterm → WebSocket input
      const dataSub = term.onData((input) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "input", data: input }));
        }
      });

      // store for cleanup
      (term as any)._dataSub = dataSub;
    })();

    // ── Resize observer ──────────────────────────────────────────────────────
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        fit.fit();
        const ws = wsRef.current;
        const t = termRef.current;
        if (ws && t) sendResize(t, ws);
      });
    });
    ro.observe(containerRef.current);

    return () => {
      disposed = true;
      (term as any)._dataSub?.dispose();
      ro.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      destroySession();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fit + re-focus when panel becomes visible
  useEffect(() => {
    const id = setTimeout(() => {
      const t = termRef.current;
      const ws = wsRef.current;
      if (t) {
        fitRef.current?.fit();
        t.focus();
        if (ws) sendResize(t, ws);
      }
    }, 60);
    return () => clearTimeout(id);
  }, [sendResize]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      onClick={() => termRef.current?.focus()}
      style={{ background: "#0D0D0B", padding: "4px 0 0" }}
    />
  );
}
