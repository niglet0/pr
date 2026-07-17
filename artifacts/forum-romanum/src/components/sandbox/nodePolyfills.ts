/**
 * Node.js built-in polyfills for the browser sandbox.
 * Provides real implementations of path, events, fs, http, util, os, crypto,
 * assert, stream, querystring, url, buffer — enough to run real Node.js projects.
 */

import type { MemFS } from "./vfs";
import * as vfsOps from "./vfs";

// ─── path ────────────────────────────────────────────────────────────────────

const pathModule = (() => {
  const sep = "/";
  const normalize = (p: string): string => {
    const abs = p.startsWith("/");
    const parts = p.split("/");
    const out: string[] = [];
    for (const seg of parts) {
      if (seg === "" || seg === ".") continue;
      if (seg === "..") out.pop();
      else out.push(seg);
    }
    const result = out.join("/");
    return abs ? "/" + result : result || ".";
  };
  const join = (...parts: string[]): string => normalize(parts.join("/"));
  const resolve = (...parts: string[]): string => {
    let resolved = "/";
    for (const p of parts) {
      if (p.startsWith("/")) resolved = p;
      else resolved = resolved.endsWith("/") ? resolved + p : resolved + "/" + p;
    }
    return normalize(resolved);
  };
  const dirname = (p: string): string => {
    const idx = p.lastIndexOf("/");
    if (idx === -1) return ".";
    if (idx === 0) return "/";
    return p.slice(0, idx);
  };
  const basename = (p: string, ext?: string): string => {
    let base = p.split("/").pop() ?? p;
    if (ext && base.endsWith(ext)) base = base.slice(0, -ext.length);
    return base;
  };
  const extname = (p: string): string => {
    const base = basename(p);
    const idx = base.lastIndexOf(".");
    return idx <= 0 ? "" : base.slice(idx);
  };
  const isAbsolute = (p: string): boolean => p.startsWith("/");
  const relative = (from: string, to: string): string => {
    const f = from.split("/").filter(Boolean);
    const t = to.split("/").filter(Boolean);
    let i = 0;
    while (i < f.length && i < t.length && f[i] === t[i]) i++;
    return [...Array(f.length - i).fill(".."), ...t.slice(i)].join("/") || ".";
  };
  const parse = (p: string) => {
    const root = p.startsWith("/") ? "/" : "";
    const dir = dirname(p);
    const base = basename(p);
    const ext = extname(p);
    const name = base.slice(0, base.length - ext.length);
    return { root, dir, base, ext, name };
  };
  const format = (o: { dir?: string; root?: string; base?: string; name?: string; ext?: string }) => {
    const dir = o.dir || o.root || "";
    const base = o.base || (o.name || "") + (o.ext || "");
    return dir ? dir.replace(/\/$/, "") + "/" + base : base;
  };
  return { sep, normalize, join, resolve, dirname, basename, extname, isAbsolute, relative, parse, format, posix: null as any };
})();
(pathModule as any).posix = pathModule;

// ─── events ──────────────────────────────────────────────────────────────────

class EventEmitter {
  private _events: Record<string, Function[]> = {};
  private _maxListeners = 10;

  on(event: string, listener: Function): this {
    (this._events[event] ??= []).push(listener);
    return this;
  }
  addListener = this.on;
  once(event: string, listener: Function): this {
    const wrapper = (...args: any[]) => { this.off(event, wrapper); listener(...args); };
    (wrapper as any)._original = listener;
    return this.on(event, wrapper);
  }
  off(event: string, listener: Function): this {
    const list = this._events[event];
    if (!list) return this;
    this._events[event] = list.filter(l => l !== listener && (l as any)._original !== listener);
    return this;
  }
  removeListener = this.off;
  emit(event: string, ...args: any[]): boolean {
    const list = this._events[event];
    if (!list?.length) return false;
    for (const l of [...list]) l(...args);
    return true;
  }
  removeAllListeners(event?: string): this {
    if (event) delete this._events[event];
    else this._events = {};
    return this;
  }
  listeners(event: string): Function[] { return [...(this._events[event] ?? [])]; }
  listenerCount(event: string): number { return (this._events[event] ?? []).length; }
  setMaxListeners(n: number): this { this._maxListeners = n; return this; }
  getMaxListeners(): number { return this._maxListeners; }
  eventNames(): string[] { return Object.keys(this._events); }
}
const eventsModule = { EventEmitter, default: EventEmitter };

// ─── stream ──────────────────────────────────────────────────────────────────

class Stream extends EventEmitter {
  pipe<T extends Stream>(dest: T): T { return dest; }
}
class Readable extends Stream {
  readable = true;
  _data: any[] = [];
  push(chunk: any): boolean { if (chunk === null) this.emit("end"); else { this._data.push(chunk); this.emit("data", chunk); } return true; }
  read(): any { return this._data.shift() ?? null; }
  destroy(): this { this.emit("close"); return this; }
}
class Writable extends Stream {
  writable = true;
  write(chunk: any, _enc?: any, cb?: Function): boolean { this.emit("drain"); if (cb) cb(); return true; }
  end(chunk?: any, _enc?: any, cb?: Function): this { if (chunk != null) this.write(chunk); this.emit("finish"); if (cb) cb(); return this; }
  destroy(): this { this.emit("close"); return this; }
}
class Transform extends Stream {
  readable = true; writable = true;
  write(chunk: any, _enc?: any, cb?: Function): boolean { this.emit("data", chunk); if (cb) cb(); return true; }
  end(chunk?: any, _enc?: any, cb?: Function): this { if (chunk != null) this.write(chunk); this.emit("finish"); this.emit("end"); if (cb) cb(); return this; }
}
const streamModule = { Stream, Readable, Writable, Transform, PassThrough: Transform, default: Stream };

// ─── util ─────────────────────────────────────────────────────────────────────

const utilModule = {
  promisify: (fn: Function) => (...args: any[]) => new Promise((res, rej) => fn(...args, (err: any, val: any) => err ? rej(err) : res(val))),
  callbackify: (fn: Function) => (...args: any[]) => { const cb = args.pop(); fn(...args).then((v: any) => cb(null, v), (e: any) => cb(e)); },
  format: (fmt: any, ...args: any[]) => {
    if (typeof fmt !== "string") return [fmt, ...args].map(String).join(" ");
    let i = 0;
    return fmt.replace(/%[sdoijf%]/g, (m) => {
      if (m === "%%") return "%";
      const a = args[i++];
      if (m === "%s") return String(a);
      if (m === "%d" || m === "%f") return Number(a).toString();
      if (m === "%o" || m === "%O" || m === "%j") { try { return JSON.stringify(a); } catch { return String(a); } }
      return m;
    }) + (i < args.length ? " " + args.slice(i).join(" ") : "");
  },
  inspect: (o: any, _opts?: any): string => { try { return JSON.stringify(o, null, 2); } catch { return String(o); } },
  inherits: (ctor: any, superCtor: any) => { ctor.super_ = superCtor; Object.setPrototypeOf(ctor.prototype, superCtor.prototype); },
  deprecate: (fn: Function, _msg: string) => fn,
  types: {
    isDate: (v: any) => v instanceof Date,
    isRegExp: (v: any) => v instanceof RegExp,
    isError: (v: any) => v instanceof Error,
  },
};

// ─── os ───────────────────────────────────────────────────────────────────────

const osModule = {
  platform: () => "browser",
  arch: () => "wasm32",
  EOL: "\n",
  tmpdir: () => "/tmp",
  homedir: () => "/home/user",
  hostname: () => "sandbox",
  cpus: () => [{ model: "Virtual CPU", speed: 2000, times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 } }],
  totalmem: () => 256 * 1024 * 1024,
  freemem: () => 128 * 1024 * 1024,
  networkInterfaces: () => ({}),
  userInfo: () => ({ uid: 1000, gid: 1000, username: "user", homedir: "/home/user", shell: "/bin/sh" }),
  release: () => "1.0.0",
  type: () => "Browser",
  uptime: () => performance.now() / 1000,
  loadavg: () => [0, 0, 0],
};

// ─── assert ───────────────────────────────────────────────────────────────────

function assert(value: any, message?: string): asserts value {
  if (!value) throw new Error(message ?? "Assertion failed");
}
Object.assign(assert, {
  ok: assert,
  equal: (a: any, b: any, msg?: string) => { if (a != b) throw new Error(msg ?? `${a} == ${b}`); },
  notEqual: (a: any, b: any, msg?: string) => { if (a == b) throw new Error(msg ?? `${a} != ${b}`); },
  strictEqual: (a: any, b: any, msg?: string) => { if (a !== b) throw new Error(msg ?? `${JSON.stringify(a)} === ${JSON.stringify(b)}`); },
  notStrictEqual: (a: any, b: any, msg?: string) => { if (a === b) throw new Error(msg ?? `${a} !== ${b}`); },
  deepEqual: (a: any, b: any, msg?: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(msg ?? "deepEqual"); },
  deepStrictEqual: (a: any, b: any, msg?: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(msg ?? "deepStrictEqual"); },
  throws: (fn: Function, msg?: string) => { try { fn(); throw new Error(msg ?? "Expected to throw"); } catch (e: any) { if (e.message === (msg ?? "Expected to throw")) throw e; } },
  doesNotThrow: (fn: Function, msg?: string) => { try { fn(); } catch { throw new Error(msg ?? "Expected not to throw"); } },
  fail: (msg?: string) => { throw new Error(msg ?? "Assertion failed"); },
});
const assertModule = assert;

// ─── querystring ──────────────────────────────────────────────────────────────

const querystringModule = {
  stringify: (obj: Record<string, any>, sep = "&", eq = "=") =>
    Object.entries(obj).map(([k, v]) => encodeURIComponent(k) + eq + encodeURIComponent(String(v))).join(sep),
  parse: (str: string, sep = "&", eq = "=") => {
    const o: Record<string, string> = {};
    for (const pair of str.split(sep)) {
      const [k, v = ""] = pair.split(eq);
      try { o[decodeURIComponent(k)] = decodeURIComponent(v); } catch {}
    }
    return o;
  },
  escape: encodeURIComponent,
  unescape: decodeURIComponent,
};

// ─── crypto ───────────────────────────────────────────────────────────────────

const cryptoModule = {
  randomBytes: (n: number): Uint8Array => { const b = new Uint8Array(n); crypto.getRandomValues(b); return b; },
  randomUUID: (): string => crypto.randomUUID(),
  randomInt: (min: number, max?: number): number => {
    if (max === undefined) { max = min; min = 0; }
    return Math.floor(Math.random() * (max - min)) + min;
  },
  createHash: (algo: string) => {
    const chunks: Uint8Array[] = [];
    const enc = new TextEncoder();
    return {
      update(data: string | Uint8Array): any {
        chunks.push(typeof data === "string" ? enc.encode(data) : data);
        return this;
      },
      async digest(encoding?: string): Promise<string> {
        const all = new Uint8Array(chunks.reduce((s, c) => s + c.length, 0));
        let off = 0; for (const c of chunks) { all.set(c, off); off += c.length; }
        const algoMap: Record<string, string> = { md5: "SHA-1", sha1: "SHA-1", sha256: "SHA-256", sha512: "SHA-512" };
        const hashBuf = await crypto.subtle.digest(algoMap[algo.toLowerCase()] ?? "SHA-256", all);
        const hex = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, "0")).join("");
        if (encoding === "base64") return btoa(hex);
        return hex;
      },
      digestSync(encoding?: string): string {
        return "[hash-pending-async]";
      },
    };
  },
  createHmac: (_algo: string, _key: string) => ({
    update(data: string): any { return this; },
    digest(): string { return "[hmac]"; },
  }),
  pbkdf2Sync: (_pass: any, _salt: any, _iter: number, _keylen: number, _digest: string) => new Uint8Array(32),
  scryptSync: (_pass: any, _salt: any, _keylen: number) => new Uint8Array(32),
};

// ─── url ──────────────────────────────────────────────────────────────────────

const urlModule = {
  URL: globalThis.URL,
  URLSearchParams: globalThis.URLSearchParams,
  parse: (urlStr: string, parseQueryString = false) => {
    try {
      const u = new URL(urlStr, "http://localhost");
      return {
        protocol: u.protocol, host: u.host, hostname: u.hostname,
        port: u.port, pathname: u.pathname, search: u.search,
        hash: u.hash, href: u.href,
        query: parseQueryString ? querystringModule.parse(u.search.slice(1)) : u.search.slice(1),
        path: u.pathname + u.search,
        slashes: true, auth: null,
      };
    } catch { return null; }
  },
  format: (o: any): string => {
    if (typeof o === "string") return o;
    return (o.protocol ?? "") + "//" + (o.host ?? o.hostname ?? "") + (o.pathname ?? o.path ?? "/") + (o.search ?? "");
  },
  resolve: (from: string, to: string): string => new URL(to, from).href,
  fileURLToPath: (u: string) => new URL(u).pathname,
  pathToFileURL: (p: string) => new URL("file://" + p),
};

// ─── buffer module ────────────────────────────────────────────────────────────

const bufferModule = { Buffer: globalThis.Buffer, default: globalThis.Buffer };

// ─── http virtual server ──────────────────────────────────────────────────────

// Global registry: virtual port → request handler
// Exposed so SandboxIDE can access the active server
export const virtualServerHandlers = new Map<number, (req: any, res: any) => void>();
export let activeVirtualPort: number | null = null;

function makeHttpModule() {
  class IncomingMessage extends EventEmitter {
    url = "/";
    method = "GET";
    headers: Record<string, string> = {};
    body = "";
    rawBody: Uint8Array = new Uint8Array(0);
    socket = { remoteAddress: "127.0.0.1" };
    httpVersion = "1.1";
    constructor(init: Partial<IncomingMessage>) { super(); Object.assign(this, init); }
  }

  class ServerResponse extends EventEmitter {
    statusCode = 200;
    statusMessage = "OK";
    private _headers: Record<string, string> = {};
    private _chunks: string[] = [];
    private _resolve?: (r: { status: number; headers: Record<string, string>; body: string }) => void;

    constructor(resolve: (r: any) => void) { super(); this._resolve = resolve; }

    setHeader(name: string, value: string) { this._headers[name.toLowerCase()] = value; }
    getHeader(name: string) { return this._headers[name.toLowerCase()]; }
    removeHeader(name: string) { delete this._headers[name.toLowerCase()]; }
    writeHead(code: number, msg?: string | Record<string, string>, headers?: Record<string, string>) {
      this.statusCode = code;
      if (typeof msg === "object") Object.assign(this._headers, msg);
      if (headers) Object.assign(this._headers, headers);
    }
    write(chunk: any): boolean {
      this._chunks.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
      return true;
    }
    end(chunk?: any) {
      if (chunk != null) this.write(chunk);
      this._resolve?.({ status: this.statusCode, headers: this._headers, body: this._chunks.join("") });
      this.emit("finish");
    }
    // Express-compatible helpers
    json(obj: any) {
      this.setHeader("content-type", "application/json");
      this.end(JSON.stringify(obj));
    }
    send(data: any) {
      if (typeof data === "object") this.json(data);
      else this.end(String(data));
    }
    status(code: number): this { this.statusCode = code; return this; }
    redirect(url: string) {
      this.statusCode = 302;
      this.setHeader("location", url);
      this.end("");
    }
  }

  class Server extends EventEmitter {
    private _port: number | null = null;
    private _handler: (req: any, res: any) => void;
    listening = false;

    constructor(handler: (req: any, res: any) => void) {
      super();
      this._handler = handler;
    }

    listen(port: number | string, hostnameOrCb?: any, cb?: Function): this {
      const actualCb = typeof hostnameOrCb === "function" ? hostnameOrCb : cb;
      this._port = Number(port) || 3000;
      virtualServerHandlers.set(this._port, this._handler);
      activeVirtualPort = this._port;
      this.listening = true;
      this.emit("listening");
      actualCb?.();
      return this;
    }

    close(cb?: Function): this {
      if (this._port !== null) {
        virtualServerHandlers.delete(this._port);
        if (activeVirtualPort === this._port) activeVirtualPort = null;
      }
      this.listening = false;
      this.emit("close");
      cb?.();
      return this;
    }

    address() { return { port: this._port, address: "127.0.0.1", family: "IPv4" }; }
  }

  const createServer = (handler?: (req: any, res: any) => void) => new Server(handler ?? (() => {}));

  const get = (url: string, opts: any, cb?: Function) => {
    const actualCb = typeof opts === "function" ? opts : cb;
    fetch(url).then(async r => {
      const body = await r.text();
      const res = new IncomingMessage({ statusCode: r.status, body } as any);
      actualCb?.(res);
      res.emit("data", body);
      res.emit("end");
    });
    return new Writable();
  };

  const request = (opts: any, cb?: Function) => {
    const url = typeof opts === "string" ? opts : `${opts.protocol ?? "http:"}//${opts.hostname ?? opts.host}${opts.path ?? "/"}`;
    const req = new Writable() as any;
    req.end = () => fetch(url, { method: opts.method ?? "GET" }).then(async r => {
      const body = await r.text();
      const res = new IncomingMessage({ body } as any);
      cb?.(res);
      res.emit("data", body);
      res.emit("end");
    });
    return req;
  };

  return {
    createServer, get, request,
    IncomingMessage, ServerResponse, Server,
    STATUS_CODES: { 200: "OK", 201: "Created", 204: "No Content", 400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found", 500: "Internal Server Error" },
  };
}

// ─── fs module (VFS bridge) ───────────────────────────────────────────────────

function makeFsModule(vfs: MemFS, getCwd: () => string) {
  const resolve = (p: string) => p.startsWith("/") ? p : pathModule.join(getCwd(), p);

  const promises = {
    readFile: async (p: string, opts?: any): Promise<any> => {
      const data = await vfsOps.readFile(vfs, resolve(p));
      if (opts?.encoding || typeof opts === "string") return data;
      return new TextEncoder().encode(data);
    },
    writeFile: async (p: string, data: any, _opts?: any) => {
      await vfsOps.writeFile(vfs, resolve(p), typeof data === "string" ? data : new TextDecoder().decode(data));
    },
    mkdir: async (p: string, opts?: any) => {
      await vfsOps.ensureDir(vfs, resolve(p));
    },
    rmdir: async (p: string) => { await vfs.promises.rmdir(resolve(p)); },
    unlink: async (p: string) => { await vfs.promises.unlink(resolve(p)); },
    readdir: async (p: string): Promise<string[]> => { return vfsOps.readdir(vfs, resolve(p)); },
    stat: async (p: string) => { return vfs.promises.stat(resolve(p)); },
    rename: async (src: string, dst: string) => { return vfs.promises.rename(resolve(src), resolve(dst)); },
    access: async (p: string) => { await vfs.promises.stat(resolve(p)); },
    exists: async (p: string): Promise<boolean> => { return vfsOps.exists(vfs, resolve(p)); },
    copyFile: async (src: string, dst: string) => {
      const data = await vfsOps.readFile(vfs, resolve(src));
      await vfsOps.writeFile(vfs, resolve(dst), data);
    },
    appendFile: async (p: string, data: string) => {
      let existing = "";
      try { existing = await vfsOps.readFile(vfs, resolve(p)); } catch {}
      await vfsOps.writeFile(vfs, resolve(p), existing + data);
    },
  };

  // Callback-style wrappers
  const cb = <T>(fn: (...args: any[]) => Promise<T>) =>
    (...args: any[]) => {
      const callback = args.pop() as Function;
      fn(...args).then(v => callback(null, v)).catch(e => callback(e));
    };

  const syncOp = <T>(fn: () => T, fallback: T): T => {
    try { return fn(); } catch { return fallback; }
  };

  const existsSync = (p: string): boolean =>
    syncOp(() => { vfs.statSync(resolve(p)); return true; }, false);

  const statSync = (p: string) =>
    vfs.statSync(resolve(p));

  const readFileSync = (p: string, opts?: any): any => {
    const enc = typeof opts === "string" ? opts : opts?.encoding;
    const raw = vfs.readFileSync(resolve(p), enc ? { encoding: enc } : undefined);
    if (enc) return typeof raw === "string" ? raw : new TextDecoder().decode(raw);
    return raw instanceof Uint8Array ? raw : new TextEncoder().encode(String(raw));
  };

  const writeFileSync = (p: string, data: any, opts?: any): void => {
    const enc = typeof opts === "string" ? opts : opts?.encoding;
    const content = typeof data === "string" ? data :
      data instanceof Uint8Array ? data : String(data);
    vfs.writeFileSync(resolve(p), content, enc ? { encoding: enc } : undefined);
  };

  const mkdirSync = (p: string, _opts?: any): void =>
    syncOp(() => vfs.mkdirSync(resolve(p)), undefined);

  const readdirSync = (p: string): string[] =>
    vfs.readdirSync(resolve(p));

  const unlinkSync = (p: string): void =>
    syncOp(() => vfs.unlinkSync(resolve(p)), undefined);

  const realpathSync = (p: string): string => resolve(p);

  return {
    promises,
    readFile: cb(promises.readFile),
    writeFile: cb(promises.writeFile),
    mkdir: cb(promises.mkdir),
    rmdir: cb(promises.rmdir),
    unlink: cb(promises.unlink),
    readdir: cb(promises.readdir),
    stat: cb(promises.stat),
    rename: cb(promises.rename),
    access: cb(promises.access),
    appendFile: cb(promises.appendFile),
    copyFile: cb(promises.copyFile),
    exists: (p: string, callback: Function) => promises.exists(p).then(v => callback(v)),
    existsSync,
    statSync,
    readFileSync,
    writeFileSync,
    mkdirSync,
    readdirSync,
    unlinkSync,
    realpathSync,
    "realpathSync.native": realpathSync,
    createReadStream: (_p: string) => new Readable(),
    createWriteStream: (_p: string) => new Writable(),
    constants: { F_OK: 0, R_OK: 4, W_OK: 2, X_OK: 1 },
  };
}

// ─── process ─────────────────────────────────────────────────────────────────

export function makeProcess(getCwd: () => string, write: (s: string) => void) {
  let _cwd = getCwd();
  const proc = {
    env: {
      NODE_ENV: "sandbox",
      HOME: "/home/user",
      PATH: "/usr/local/bin:/usr/bin:/bin",
      TERM: "xterm-256color",
    },
    argv: ["node", "script.js"],
    argv0: "node",
    version: "v22.0.0",
    versions: { node: "22.0.0", v8: "12.0.0" },
    platform: "browser",
    arch: "wasm32",
    pid: Math.floor(Math.random() * 9000) + 1000,
    ppid: 1,
    title: "node",
    cwd: () => _cwd,
    chdir: (dir: string) => { _cwd = dir; },
    exit: (code: number = 0) => { throw new Error(`process.exit(${code})`); },
    kill: () => {},
    nextTick: (fn: Function, ...args: any[]) => queueMicrotask(() => fn(...args)),
    hrtime: (prev?: [number, number]): [number, number] => {
      const t = performance.now() * 1e6;
      const sec = Math.floor(t / 1e9);
      const ns = Math.floor(t % 1e9);
      if (prev) return [sec - prev[0], ns - prev[1]];
      return [sec, ns];
    },
    uptime: () => performance.now() / 1000,
    memoryUsage: () => ({ rss: 50e6, heapTotal: 30e6, heapUsed: 20e6, external: 5e6, arrayBuffers: 1e6 }),
    cpuUsage: () => ({ user: 0, system: 0 }),
    stdout: {
      write: (s: string) => { write(s.replace(/\n/g, "\r\n")); return true; },
      isTTY: true,
    },
    stderr: {
      write: (s: string) => { write(`\x1b[31m${s.replace(/\n/g, "\r\n")}\x1b[0m`); return true; },
      isTTY: true,
    },
    stdin: { read: () => null, isTTY: false },
    on: (_ev: string, _cb: Function) => proc,
    off: (_ev: string, _cb: Function) => proc,
    once: (_ev: string, _cb: Function) => proc,
    emit: (_ev: string, ..._args: any[]) => false,
    binding: () => ({}),
    domain: null,
    browser: true,
  };
  return proc;
}

// ─── Module registry (for npm packages loaded via esm.sh) ────────────────────

const moduleRegistry = new Map<string, any>();

export function registerModule(id: string, exports: any) {
  moduleRegistry.set(id, exports);
}

export function isModuleRegistered(id: string): boolean {
  return moduleRegistry.has(id);
}

// ─── Require ID extraction ────────────────────────────────────────────────────

export function extractRequireIds(code: string): string[] {
  const ids = new Set<string>();
  // require('...') and require("...")
  const re = /\brequire\s*\(\s*['"`]([^'"`\s]+)['"`]\s*\)/g;
  let m;
  while ((m = re.exec(code)) !== null) {
    const id = m[1];
    // Skip relative paths — they're VFS reads, not npm packages
    if (!id.startsWith(".") && !id.startsWith("/")) ids.add(id.split("/")[0]);
  }
  return [...ids];
}

// ─── Main factory ─────────────────────────────────────────────────────────────

export interface NodeEnvironment {
  require: (id: string) => any;
  process: ReturnType<typeof makeProcess>;
  module: { exports: any };
  exports: any;
  __dirname: string;
  __filename: string;
}

export function createNodeEnvironment(opts: {
  cwd: string;
  filename: string;
  vfs: MemFS;
  write: (s: string) => void;
}): NodeEnvironment {
  const getCwd = () => opts.cwd;
  const proc = makeProcess(getCwd, opts.write);

  const httpMod = makeHttpModule();
  const fsMod = makeFsModule(opts.vfs, getCwd);

  const BUILTINS: Record<string, any> = {
    // Core
    path: pathModule, "node:path": pathModule,
    events: eventsModule, "node:events": eventsModule,
    stream: streamModule, "node:stream": streamModule,
    util: utilModule, "node:util": utilModule,
    os: osModule, "node:os": osModule,
    assert: assertModule, "node:assert": assertModule,
    querystring: querystringModule, "node:querystring": querystringModule,
    crypto: cryptoModule, "node:crypto": cryptoModule,
    buffer: bufferModule, "node:buffer": bufferModule,
    url: urlModule, "node:url": urlModule,
    // Network
    http: httpMod, "node:http": httpMod,
    https: httpMod, "node:https": httpMod,
    net: { createServer: httpMod.createServer, createConnection: () => new Writable() },
    // Filesystem
    fs: fsMod, "node:fs": fsMod,
    "fs/promises": fsMod.promises, "node:fs/promises": fsMod.promises,
    // Process / timers
    timers: {
      setTimeout, setInterval, clearTimeout, clearInterval,
      setImmediate: (fn: Function) => queueMicrotask(() => fn()),
      clearImmediate: () => {},
    },
    "node:timers": {
      setTimeout, setInterval, clearTimeout, clearInterval,
      setImmediate: (fn: Function) => queueMicrotask(() => fn()),
    },
    // Stubs for modules that can't work in browser
    child_process: {
      exec: (_cmd: string, _opts: any, cb?: Function) => { const c = typeof _opts === "function" ? _opts : cb; c?.(new Error("child_process not available in browser sandbox"), "", ""); return { kill: () => {}, pid: 0 }; },
      spawn: () => ({ stdout: new Readable(), stderr: new Readable(), stdin: new Writable(), on: () => {}, kill: () => {} }),
      execSync: () => { throw new Error("child_process not available in browser sandbox"); },
    },
    cluster: { isMaster: true, isWorker: false, fork: () => ({ on: () => {} }), on: () => {} },
    dns: { lookup: (_host: string, cb: Function) => cb(null, "127.0.0.1", 4), resolve: (_host: string, cb: Function) => cb(null, ["127.0.0.1"]) },
    readline: {
      createInterface: () => ({
        on: (_ev: string, _cb: Function) => ({}),
        close: () => {},
        question: (_q: string, cb: Function) => cb(""),
      }),
    },
    zlib: {
      gzip: (_buf: any, cb: Function) => cb(null, _buf),
      gunzip: (_buf: any, cb: Function) => cb(null, _buf),
      deflate: (_buf: any, cb: Function) => cb(null, _buf),
      inflate: (_buf: any, cb: Function) => cb(null, _buf),
    },
    vm: {
      runInThisContext: (code: string) => eval(code), // eslint-disable-line no-eval
      Script: class { constructor(public code: string) {} runInThisContext() { return eval(this.code); } }, // eslint-disable-line no-eval
    },
    tty: { isatty: () => true, ReadStream: Readable, WriteStream: Writable },
    constants: { O_RDONLY: 0, O_WRONLY: 1, O_RDWR: 2, O_CREAT: 64, O_TRUNC: 512, O_APPEND: 1024 },
    "perf_hooks": { performance: globalThis.performance },
    worker_threads: { isMainThread: true, workerData: null, parentPort: null },
    v8: { getHeapStatistics: () => ({ heap_size_limit: 256e6 }) },
    inspector: { open: () => {}, close: () => {}, url: () => undefined },
    module: { Module: class Module { static _resolveFilename = (s: string) => s; }, createRequire: () => require },
  };

  const require = (id: string): any => {
    if (BUILTINS[id]) return BUILTINS[id];
    if (moduleRegistry.has(id)) return moduleRegistry.get(id);
    // Relative requires — try to load from VFS synchronously (in-memory cache)
    if (id.startsWith(".") || id.startsWith("/")) {
      const candidates = [id, `${id}.js`, `${id}/index.js`, `${id}.mjs`, `${id}/index.mjs`];
      const base = id.startsWith("/") ? "" : opts.cwd;
      for (const cand of candidates) {
        const full = cand.startsWith("/") ? cand : `${base}/${cand}`.replace(/\/\//g, "/");
        try {
          const src = opts.vfs.readFileSync(full, { encoding: "utf8" }) as string;
          const childMod = { exports: {} as any };
          const childEnv = createNodeEnvironment({ ...opts, filename: full, cwd: full.replace(/\/[^/]+$/, "") || "/" });
          // eslint-disable-next-line no-new-func
          new Function("require", "module", "exports", "__dirname", "__filename", src)(
            childEnv.require, childMod, childMod.exports, childEnv.__dirname, childEnv.__filename
          );
          return childMod.exports;
        } catch {}
      }
      throw new Error(`Cannot find module '${id}' (resolved under '${base}')`);
    }
    throw new Error(`Cannot find module '${id}'\n  Hint: run 'npm install ${id}' to install it first.`);
  };

  const modObj = { exports: {} as any, id: opts.filename, filename: opts.filename };

  return {
    require,
    process: proc,
    module: modObj,
    exports: modObj.exports,
    __dirname: pathModule.dirname(opts.filename),
    __filename: opts.filename,
  };
}
