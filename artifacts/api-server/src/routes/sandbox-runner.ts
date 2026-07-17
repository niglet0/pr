/**
 * Tier 3 Sandbox — spawns real Node.js processes for "run" actions.
 *
 * POST   /api/sandbox/start          — write VFS files to temp, run command, return { sessionId, port }
 * GET    /api/sandbox/:id/stream     — SSE stream of stdout/stderr
 * POST   /api/sandbox/:id/stdin      — send stdin data to running process
 * DELETE /api/sandbox/:id            — kill process + cleanup temp dir
 * GET    /api/sandbox/:id/proxy/*    — HTTP reverse-proxy to the running process
 *
 * Security hardened:
 * - Path containment: all file paths are resolved and checked against tmpDir
 * - Env stripping: secrets and credentials are never passed to child processes
 * - Input validation: command must not be empty
 */

import { Router, type Request, type Response } from "express";
import { spawn, type ChildProcess } from "child_process";
import { writeFile, mkdir, rm } from "fs/promises";
import { tmpdir } from "os";
import { join, dirname, resolve as resolvePath } from "path";
import { randomUUID } from "crypto";
import * as http from "http";
import * as net from "net";

const router = Router();

// ─── Sensitive env vars stripped from child process env ──────────────────────

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

// ─── Path containment ─────────────────────────────────────────────────────────

function containPath(base: string, userPath: string): string | null {
  const stripped = userPath.replace(/^\/+/, "");
  const candidate = resolvePath(base, stripped);
  if (candidate !== base && !candidate.startsWith(base + "/")) return null;
  return candidate;
}

// ─── Session registry ─────────────────────────────────────────────────────────

interface Session {
  proc: ChildProcess;
  port: number;
  tmpDir: string;
  log: string[];
  clients: Set<Response>;
  ready: boolean;
}

const sessions = new Map<string, Session>();

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function broadcast(session: Session, data: string) {
  session.log.push(data);
  if (session.log.length > 500) session.log.shift();
  const msg = `data: ${JSON.stringify({ type: "output", data })}\n\n`;
  for (const client of session.clients) {
    try { client.write(msg); } catch {}
  }
}

function broadcastExit(session: Session, code: number | null) {
  const msg = `data: ${JSON.stringify({ type: "exit", code })}\n\n`;
  for (const client of session.clients) {
    try { client.write(msg); client.end(); } catch {}
  }
}

// ─── POST /api/sandbox/start ──────────────────────────────────────────────────

router.post("/sandbox/start", async (req: Request, res: Response) => {
  const { files = [], command = "", cwd = "/" } = req.body as {
    files: Array<{ path: string; content: string }>;
    command: string;
    cwd: string;
  };

  if (!command.trim()) {
    res.status(400).json({ error: "command is required" });
    return;
  }

  const sessionId = randomUUID().slice(0, 8);
  const tmpDir = join(tmpdir(), `hatch-sb-${sessionId}`);

  try {
    await mkdir(tmpDir, { recursive: true });

    // Write files with path containment — reject traversal attempts
    for (const file of files) {
      const abs = containPath(tmpDir, file.path);
      if (!abs) continue;
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, typeof file.content === "string" ? file.content : "", "utf8");
    }

    // Resolve cwd safely
    const workDir = cwd === "/" ? tmpDir : (containPath(tmpDir, cwd) ?? tmpDir);
    const port = await findFreePort();

    const proc = spawn("sh", ["-c", command], {
      cwd: workDir,
      env: { ...safeEnv(), PORT: String(port), HOST: "0.0.0.0" },
      stdio: ["pipe", "pipe", "pipe"],
    });

    const session: Session = { proc, port, tmpDir, log: [], clients: new Set(), ready: false };
    sessions.set(sessionId, session);

    proc.stdout?.on("data", (d: Buffer) => {
      const text = d.toString();
      broadcast(session, text);
      if (!session.ready && /localhost|127\.0\.0\.1|0\.0\.0\.0|port/i.test(text)) {
        session.ready = true;
      }
    });
    proc.stderr?.on("data", (d: Buffer) => broadcast(session, d.toString()));

    proc.on("exit", (code) => {
      broadcastExit(session, code);
      sessions.delete(sessionId);
      rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    });

    res.json({ sessionId, port });
  } catch (err: any) {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/sandbox/:id/stream — SSE output ────────────────────────────────

router.get("/sandbox/:id/stream", (req: Request, res: Response) => {
  const session = sessions.get(String(req.params.id));
  if (!session) { res.status(404).json({ error: "Session not found" }); return; }

  res.setHeader("content-type", "text/event-stream");
  res.setHeader("cache-control", "no-cache");
  res.setHeader("connection", "keep-alive");
  res.flushHeaders();

  for (const line of session.log) {
    res.write(`data: ${JSON.stringify({ type: "output", data: line })}\n\n`);
  }

  session.clients.add(res);
  req.on("close", () => session.clients.delete(res));
});

// ─── POST /api/sandbox/:id/stdin — send stdin to process ──────────────────────

router.post("/sandbox/:id/stdin", (req: Request, res: Response) => {
  const session = sessions.get(String(req.params.id));
  if (!session) { res.status(404).json({ error: "Session not found" }); return; }
  const { data } = req.body as { data?: string };
  if (typeof data === "string" && session.proc.stdin) {
    session.proc.stdin.write(data);
  }
  res.json({ ok: true });
});

// ─── DELETE /api/sandbox/:id — kill + cleanup ────────────────────────────────

router.delete("/sandbox/:id", async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const session = sessions.get(id);
  if (!session) { res.status(404).json({ error: "Session not found" }); return; }

  session.proc.kill("SIGTERM");
  sessions.delete(id);
  await rm(session.tmpDir, { recursive: true, force: true }).catch(() => {});
  res.json({ ok: true });
});

// ─── GET /api/sandbox/:id/proxy/* — reverse proxy ────────────────────────────

router.all("/sandbox/:id/proxy/*subpath", (req: Request, res: Response) => {
  const session = sessions.get(String(req.params.id));
  if (!session) { res.status(404).send("Sandbox session not found"); return; }

  const proxyPrefix = `/api/sandbox/${String(req.params.id)}/proxy`;
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

export default router;
