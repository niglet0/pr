/**
 * /api/git-proxy — Proxies all HTTP git traffic (clone, fetch, push) from
 * isomorphic-git running in the browser through this server so CORS is never
 * an issue. isomorphic-git cannot hit GitHub directly from browser context.
 *
 * Usage: GET/POST /api/git-proxy?url=<encoded-target-url>
 */

import { Router } from "express";
import express from "express";

const router = Router();

// Block targets that aren't real git hosts (basic SSRF guard)
const ALLOWED_HOSTS = [
  "github.com",
  "gitlab.com",
  "bitbucket.org",
  "gitea.com",
  "codeberg.org",
  "raw.githubusercontent.com",
  "api.github.com",
];

function isAllowedHost(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return ALLOWED_HOSTS.some(
      (h) => hostname === h || hostname.endsWith("." + h)
    );
  } catch {
    return false;
  }
}

// Preflight
router.options("/git-proxy", (_req, res) => {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET, POST, PUT, OPTIONS");
  res.setHeader("access-control-allow-headers", "*");
  res.status(200).end();
});

// All methods — use express.raw so we get the binary body untouched
// (git pack data is binary; express.json/urlencoded would ignore it anyway
// but raw is explicit and prevents any middleware touching the bytes)
router.all(
  "/git-proxy",
  express.raw({ type: "*/*", limit: "100mb" }),
  async (req, res) => {
    const targetUrl = req.query["url"] as string | undefined;

    if (!targetUrl) {
      res.status(400).json({ error: "Missing ?url= parameter" });
      return;
    }

    if (!isAllowedHost(targetUrl)) {
      res.status(403).json({
        error: `Host not allowed. Permitted hosts: ${ALLOWED_HOSTS.join(", ")}`,
      });
      return;
    }

    // Forward a minimal safe set of headers
    const forwardHeaders: Record<string, string> = {
      "user-agent": "isomorphic-git/1.x Hatch-Sandbox/1.0",
      accept: "*/*",
    };

    const ct = req.headers["content-type"];
    if (ct) forwardHeaders["content-type"] = ct;

    // Pass through git auth if the client sent Basic credentials
    const auth = req.headers["authorization"];
    if (auth) forwardHeaders["authorization"] = auth;

    try {
      const method = req.method;
      const hasBody =
        method !== "GET" &&
        method !== "HEAD" &&
        Buffer.isBuffer(req.body) &&
        req.body.length > 0;

      const response = await fetch(targetUrl, {
        method,
        headers: forwardHeaders,
        body: hasBody ? req.body : undefined,
        // @ts-ignore — Node 18+ fetch supports duplex for streaming bodies
        ...(hasBody ? { duplex: "half" } : {}),
      });

      // Copy status
      res.status(response.status);

      // Forward git-relevant response headers
      const FORWARD_HEADERS = [
        "content-type",
        "cache-control",
        "pragma",
        "expires",
        "last-modified",
        "etag",
        "x-frame-options",
      ];
      for (const h of FORWARD_HEADERS) {
        const v = response.headers.get(h);
        if (v) res.setHeader(h, v);
      }

      // Always allow browser access
      res.setHeader("access-control-allow-origin", "*");

      const buf = await response.arrayBuffer();
      res.send(Buffer.from(buf));
    } catch (err: any) {
      res.status(502).json({ error: `Git proxy error: ${err.message}` });
    }
  }
);

export default router;
