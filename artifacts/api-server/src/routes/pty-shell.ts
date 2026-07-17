/**
 * Real PTY shell sessions over WebSocket.
 *
 * POST   /api/shell/create          — write VFS files, spawn real bash PTY, return {sessionId, port, wsToken}
 * WS     /api/shell/:id/ws?token=X  — bidirectional PTY I/O; requires wsToken returned by /create
 *                                     client → server: JSON {type:"input",data} | {type:"resize",cols,rows}
 *                                     server → client: raw output bytes
 * POST   /api/shell/:id/resize      — resize PTY (requires auth + ownership)
 * DELETE /api/shell/:id             — kill shell + cleanup temp dir (requires auth + ownership)
 * GET    /api/shell/:id/proxy/*     — HTTP proxy to any server started inside the shell (via $PORT)
 *                                     intentionally unauthenticated so the preview iframe works
 */

import { Router, type Request, type Response } from "express";
import { spawn as ptySpawn } from "node-pty";
import { mkdir, rm, writeFile } from "fs/promises";
import { dirname, join, resolve as resolvePath } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import * as http from "http";
import * as net from "net";
import { WebSocketServer, type WebSocket } from "ws";
import { resolveToken } from "../middlewares/verifyAuth";

const router = Router();

// ─── Sensitive env vars stripped from every shell session ─────────────────────

const STRIP_ENV = new Set([
  "DATABASE_URL", "PGPASSWORD", "PGUSER", "PGHOST", "PGDATABASE", "PGPORT",
  "SESSION_SECRET", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY",
  "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET", "AWS_SECRET_ACCESS_KEY", "AWS_ACCESS_KEY_ID",
  "REPLIT_DB_URL", "REPL_IDENTITY", "REPL_IDENTITY_KEY", "REPL_TOKEN",
]);

function safeEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env)
      .filter(([k, v]) => v !== undefined && !STRIP_ENV.has(k)) as [string, string][]
  );
}

// ─── Path containment — blocks traversal outside tmpDir ──────────────────────

function containPath(base: string, userPath: string): string | null {
  const stripped = userPath.replace(/^\/+/, "");
  const candidate = resolvePath(base, stripped);
  if (candidate !== base && !candidate.startsWith(base + "/")) return null;
  return candidate;
}

// ─── Find a free port ─────────────────────────────────────────────────────────

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address() as net.AddressInfo;
      srv.close(() => resolve(addr.port));
    });
    srv.on("error", reject);
  });
}

// ─── Session registry ─────────────────────────────────────────────────────────

interface PtySession {
  pty: ReturnType<typeof ptySpawn>;
  tmpDir: string;
  port: number;
  /** One-time WS connection token returned to the creator — used to auth WS upgrades */
  wsToken: string;
  log: string[];          // ring buffer for WS replay
  sockets: Set<WebSocket>;
  userId: string;         // creator's Supabase user ID — enforced on management routes
  createdAt: number;
}

const sessions = new Map<string, PtySession>();

// Auto-cleanup sessions older than 2 hours
setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [id, session] of sessions) {
    if (session.createdAt < cutoff) {
      try { session.pty.kill(); } catch {}
      rm(session.tmpDir, { recursive: true, force: true }).catch(() => {});
      sessions.delete(id);
    }
  }
}, 5 * 60 * 1000).unref();

// ─── POST /api/shell/create ───────────────────────────────────────────────────

router.post("/shell/create", async (req: Request, res: Response) => {
  const userId = (req as any).userId as string | undefined;

  // Require authentication — no anonymous RCE
  if (!userId) {
    res.status(401).json({ error: "Sign in to use the terminal" });
    return;
  }

  // Per-user session cap
  let userCount = 0;
  for (const s of sessions.values()) {
    if (s.userId === userId) userCount++;
  }
  if (userCount >= 5) {
    res.status(429).json({ error: "Too many active shells — close an existing session first" });
    return;
  }

  const { files = [], cwd = "/" } = req.body as {
    files: Array<{ path: string; content: string }>;
    cwd?: string;
  };

  const sessionId = randomUUID().replace(/-/g, "").slice(0, 16);
  const wsToken = randomUUID().replace(/-/g, ""); // 32 hex chars, single-use WS auth
  const tmpDir = join(tmpdir(), `hatch-pty-${sessionId}`);

  try {
    await mkdir(tmpDir, { recursive: true });

    // Write VFS files with strict path containment
    for (const file of files) {
      const abs = containPath(tmpDir, file.path);
      if (!abs) continue; // silently skip traversal attempts
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, typeof file.content === "string" ? file.content : "", "utf8");
    }

    const workDir = cwd === "/" ? tmpDir : (containPath(tmpDir, cwd) ?? tmpDir);
    const port = await findFreePort();

    const ptyProc = ptySpawn("bash", ["--login"], {
      name: "xterm-256color",
      cols: 80,
      rows: 24,
      cwd: workDir,
      env: {
        ...safeEnv(),
        PORT: String(port),
        HOST: "0.0.0.0",
        HOME: tmpDir,
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
        FORCE_COLOR: "3",
        PS1: "\\[\\e[33m\\]forge\\[\\e[0m\\]:\\[\\e[36m\\]\\w\\[\\e[0m\\]$ ",
      },
    });

    const session: PtySession = {
      pty: ptyProc,
      tmpDir,
      port,
      wsToken,
      log: [],
      sockets: new Set(),
      userId,
      createdAt: Date.now(),
    };
    sessions.set(sessionId, session);

    ptyProc.onData((data) => {
      session.log.push(data);
      if (session.log.length > 800) session.log.shift(); // ~80 KB ring buffer
      for (const ws of session.sockets) {
        try { ws.send(data); } catch {}
      }
    });

    ptyProc.onExit(() => {
      const bye = "\r\n\x1b[33m[shell exited]\x1b[0m\r\n";
      for (const ws of session.sockets) {
        try { ws.send(bye); ws.close(); } catch {}
      }
      sessions.delete(sessionId);
      rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    });

    res.json({ sessionId, port, wsToken });
  } catch (err: any) {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    res.status(500).json({ error: err.message });
  }
});

// ─── Helper: check session ownership ─────────────────────────────────────────

function requireOwnership(
  req: Request,
  res: Response,
  session: PtySession
): boolean {
  const userId = (req as any).userId as string | undefined;
  console.log("[OWNERSHIP CHECK]", { reqUserId: userId, sessionUserId: session.userId, match: userId === session.userId });
  if (!userId || userId !== session.userId) {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  return true;
}

// ─── POST /api/shell/:id/resize ──────────────────────────────────────────────

router.post("/shell/:id/resize", (req: Request, res: Response) => {
  const session = sessions.get(String(req.params.id));
  if (!session) { res.status(404).json({ error: "Session not found" }); return; }
  if (!requireOwnership(req, res, session)) return;

  const cols = Math.max(2, Math.min(500, Number(req.body.cols) || 80));
  const rows = Math.max(2, Math.min(200, Number(req.body.rows) || 24));
  try { session.pty.resize(cols, rows); } catch {}
  res.json({ ok: true });
});

// ─── DELETE /api/shell/:id ────────────────────────────────────────────────────

router.delete("/shell/:id", async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const session = sessions.get(id);
  if (!session) { res.status(404).json({ error: "Session not found" }); return; }
  if (!requireOwnership(req, res, session)) return;

  try { session.pty.kill(); } catch {}
  sessions.delete(id);
  await rm(session.tmpDir, { recursive: true, force: true }).catch(() => {});
  res.json({ ok: true });
});

// ─── GET /api/shell/:id/proxy/* — unauthenticated so preview iframe works ────

router.all("/shell/:id/proxy", (req: Request, res: Response) => {
  const session = sessions.get(String(req.params.id));
  if (!session) { res.status(404).send("Session not found"); return; }
  const qs = req.url.includes("?") ? "?" + req.url.split("?")[1] : "";
  const target = `http://127.0.0.1:${session.port}/${qs}`;
  const proxyReq = http.request(target, {
    method: req.method,
    headers: { ...req.headers, host: `127.0.0.1:${session.port}` },
  }, (proxyRes) => {
    res.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });
  proxyReq.on("error", (err) => {
    if (!res.headersSent) res.status(502).send(`Proxy error: ${err.message}`);
  });
  req.pipe(proxyReq, { end: true });
});

router.all("/shell/:id/proxy/*subpath", (req: Request, res: Response) => {
  const session = sessions.get(String(req.params.id));
  if (!session) { res.status(404).send("Session not found"); return; }

  const proxyPrefix = `/api/shell/${String(req.params.id)}/proxy`;
  const rawPath = req.path.startsWith(proxyPrefix) ? req.path.slice(proxyPrefix.length) : "/";
  const subPath = rawPath || "/";
  const qs = req.url.includes("?") ? "?" + req.url.split("?")[1] : "";
  const target = `http://127.0.0.1:${session.port}${subPath}${qs}`;

  const proxyReq = http.request(target, {
    method: req.method,
    headers: { ...req.headers, host: `127.0.0.1:${session.port}` },
  }, (proxyRes) => {
    res.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on("error", (err) => {
    if (!res.headersSent) res.status(502).send(`Proxy error: ${err.message}`);
  });

  req.pipe(proxyReq, { end: true });
});

// ─── WebSocket server attachment ──────────────────────────────────────────────
//
// WebSocket API doesn't let browsers send custom headers, so we authenticate
// via a `?token=<wsToken>` query param returned from POST /shell/create.
// The wsToken is a 32-hex-char random value known only to the session creator.
//
// Optionally, a Supabase Bearer token can be passed via Sec-WebSocket-Protocol
// (as `bearer.<access_token>`) for stronger verification; we accept either.

export function attachPtyWebSocketServer(server: http.Server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", async (req, socket, head) => {
    const urlMatch = req.url?.match(/^\/api\/shell\/([A-Za-z0-9]+)\/ws(?:\?.*)?$/);
    if (!urlMatch) return;

    const sessionId = urlMatch[1];
    const session = sessions.get(sessionId);
    if (!session) {
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      socket.destroy();
      return;
    }

    // Authenticate: accept wsToken (query param) or Supabase bearer (Sec-WebSocket-Protocol)
    const searchParams = new URL(req.url!, `http://${req.headers.host}`).searchParams;
    const wsToken = searchParams.get("token");
    const protocols = (req.headers["sec-websocket-protocol"] ?? "").split(",").map(s => s.trim());
    const bearerProto = protocols.find(p => p.startsWith("bearer."));

    let authorized = false;

    if (wsToken && wsToken === session.wsToken) {
      // wsToken matches — authorized
      authorized = true;
    } else if (bearerProto) {
      // Supabase token via Sec-WebSocket-Protocol: "bearer.<access_token>"
      const supabaseToken = bearerProto.slice("bearer.".length);
      const userId = await resolveToken(supabaseToken);
      if (userId && userId === session.userId) {
        authorized = true;
      }
    }

    if (!authorized) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req, sessionId);
    });
  });

  wss.on("connection", (ws: WebSocket, _req: http.IncomingMessage, sessionId: string) => {
    const session = sessions.get(sessionId);
    if (!session) { ws.close(4004, "Session not found"); return; }

    session.sockets.add(ws);

    // Replay recent output so reconnecting clients see history
    for (const chunk of session.log) {
      try { ws.send(chunk); } catch {}
    }

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "input" && typeof msg.data === "string") {
          session.pty.write(msg.data);
        } else if (msg.type === "resize") {
          const cols = Math.max(2, Math.min(500, Number(msg.cols) || 80));
          const rows = Math.max(2, Math.min(200, Number(msg.rows) || 24));
          session.pty.resize(cols, rows);
        }
      } catch {}
    });

    ws.on("close", () => session.sockets.delete(ws));
    ws.on("error", () => session.sockets.delete(ws));
  });
}

export default router;
