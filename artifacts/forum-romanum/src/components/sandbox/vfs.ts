// VFS backed by lightning-fs (IndexedDB) — replaces the old in-memory MemFS.
// Handles large ZIPs and binary Git objects without the ~4MB localStorage cap.
// Compatible with isomorphic-git's fs interface.
//
// CRITICAL NOTE — isomorphic-git compat:
//   isomorphic-git's FileSystem constructor does:
//     const desc = Object.getOwnPropertyDescriptor(fs, 'promises');
//     if (desc && desc.enumerable) { bindFs(this, fs.promises); }
//     else { bindFs(this, fs); }          ← crashes: fs.readFile undefined
//   A class `get promises()` lives on the PROTOTYPE, not the instance, so
//   getOwnPropertyDescriptor returns undefined → wrong branch → CRASH.
//   Fix: assign `this.promises` in the constructor so it is an OWN,
//   enumerable property. isomorphic-git then correctly uses fs.promises.

import LightningFS from "@isomorphic-git/lightning-fs";

export type VFile = { name: string; path: string; isDir: boolean };

// ─── Wrapper adds onChange() event hook on top of LightningFS ────────────────

class LightningFSWrapper {
  private _lfs: LightningFS;
  private _name: string;
  private _listeners: Array<() => void> = [];

  // Declared as a field so it is an OWN enumerable property on each instance.
  // isomorphic-git relies on Object.getOwnPropertyDescriptor(fs, 'promises')
  // returning { enumerable: true } to detect the promise-based fs interface.
  promises: LightningFS["promises"];

  constructor(name: string) {
    this._name = name;
    this._lfs = new LightningFS(name);
    this.promises = this._buildPromises();
  }

  private _buildPromises(): LightningFS["promises"] {
    const lfs = this._lfs;
    const p = lfs.promises;
    const notify = () => this._notify();

    // Spread all methods from the underlying LightningFS promise object first,
    // then override the mutating ones to fire the onChange listeners.
    // We also provide no-op stubs for symlink/readlink since some git internal
    // paths (e.g. clone's packfile writing) call bindFs on every command in
    // ['stat','lstat','readFile','writeFile','mkdir','rmdir','readdir','readlink','symlink']
    // and a missing method → undefined.bind() → crash.
    const enotsup = async (_a?: any, _b?: any): Promise<never> => {
      const e: any = new Error("operation not supported");
      e.code = "ENOSYS";
      throw e;
    };

    return {
      // ── Pass-through all base methods ──────────────────────────────────────
      readFile:  p.readFile.bind(p),
      writeFile: async (...args: Parameters<typeof p.writeFile>) => {
        const r = await (p.writeFile as any)(...args);
        notify();
        return r;
      },
      mkdir: async (...args: Parameters<typeof p.mkdir>) => {
        const r = await p.mkdir(...args);
        notify();
        return r;
      },
      rmdir: async (...args: Parameters<typeof p.rmdir>) => {
        const r = await p.rmdir(...args);
        notify();
        return r;
      },
      unlink: async (...args: Parameters<typeof p.unlink>) => {
        const r = await p.unlink(...args);
        notify();
        return r;
      },
      rename: async (...args: Parameters<typeof p.rename>) => {
        const r = await p.rename(...args);
        notify();
        return r;
      },
      readdir:  p.readdir.bind(p),
      stat:     p.stat.bind(p),
      // lstat — LightningFS may or may not expose this; fall back to stat
      lstat:    (p.lstat ? p.lstat.bind(p) : p.stat.bind(p)) as typeof p.stat,
      // symlink / readlink — not meaningful in an IndexedDB FS; return ENOSYS
      // so isomorphic-git can fall back gracefully rather than crashing on bind
      symlink:  (p as any).symlink ? (p as any).symlink.bind(p) : enotsup,
      readlink: (p as any).readlink ? (p as any).readlink.bind(p) : enotsup,
    } as unknown as LightningFS["promises"];
  }

  private _notify() {
    this._listeners.forEach((l) => l());
  }

  onChange(cb: () => void): () => void {
    this._listeners.push(cb);
    return () => {
      this._listeners = this._listeners.filter((l) => l !== cb);
    };
  }

  // ── Synchronous methods ─────────────────────────────────────────────────────
  // LightningFS ^4.6.0 does NOT reliably expose statSync / readFileSync etc. in
  // all browser environments. Calling them naively produces
  // "this._lfs.statSync is not a function" at runtime.
  // Gate every sync call behind a capability check and throw a clear ENOSYS
  // error instead of crashing unpredictably. Callers (node polyfills) must
  // handle ENOSYS and fall back to the async promises API.

  statSync(path: string): any {
    if (typeof (this._lfs as any).statSync !== 'function') {
      throw Object.assign(
        new Error(`statSync not available in this browser environment: ${path}`),
        { code: 'ENOSYS' }
      );
    }
    return (this._lfs as any).statSync(path);
  }

  readFileSync(path: string, opts?: any): any {
    if (typeof (this._lfs as any).readFileSync !== 'function') {
      throw Object.assign(
        new Error(`readFileSync not available in this browser environment: ${path}`),
        { code: 'ENOSYS' }
      );
    }
    return (this._lfs as any).readFileSync(path, opts);
  }

  writeFileSync(path: string, data: any, opts?: any): void {
    if (typeof (this._lfs as any).writeFileSync !== 'function') {
      throw Object.assign(
        new Error(`writeFileSync not available in this browser environment: ${path}`),
        { code: 'ENOSYS' }
      );
    }
    (this._lfs as any).writeFileSync(path, data, opts);
    this._notify();
  }

  readdirSync(path: string): string[] {
    if (typeof (this._lfs as any).readdirSync !== 'function') {
      throw Object.assign(
        new Error(`readdirSync not available in this browser environment: ${path}`),
        { code: 'ENOSYS' }
      );
    }
    return (this._lfs as any).readdirSync(path);
  }

  mkdirSync(path: string): void {
    if (typeof (this._lfs as any).mkdirSync !== 'function') {
      throw Object.assign(
        new Error(`mkdirSync not available in this browser environment: ${path}`),
        { code: 'ENOSYS' }
      );
    }
    (this._lfs as any).mkdirSync(path);
    this._notify();
  }

  unlinkSync(path: string): void {
    if (typeof (this._lfs as any).unlinkSync !== 'function') {
      throw Object.assign(
        new Error(`unlinkSync not available in this browser environment: ${path}`),
        { code: 'ENOSYS' }
      );
    }
    (this._lfs as any).unlinkSync(path);
    this._notify();
  }

  /** Wipe the IndexedDB store and start fresh */
  clear(): void {
    this._lfs.init(this._name, { wipe: true });
    this.promises = this._buildPromises(); // rebuild after wipe
    this._notify();
  }
}

// ─── Singleton instances per namespace ───────────────────────────────────────

const instances: Record<string, LightningFSWrapper> = {};

export function getFS(namespace: string): LightningFSWrapper {
  if (!instances[namespace]) {
    instances[namespace] = new LightningFSWrapper(namespace);
  }
  return instances[namespace];
}

// LightningFS auto-persists to IndexedDB — persistFS is a no-op kept for
// backward compat with callers in SandboxIDE.
export async function persistFS(_namespace: string): Promise<void> {}

export function clearFSStorage(namespace: string): void {
  if (instances[namespace]) {
    instances[namespace].clear();
  } else {
    new LightningFS(namespace, { wipe: true });
  }
}

// ─── Utility helpers ─────────────────────────────────────────────────────────

export function dirnameOf(path: string): string {
  const parts = path.split("/");
  parts.pop();
  return parts.join("/") || "/";
}

export function basenameOf(path: string): string {
  return path.split("/").pop() || path;
}

export function resolvePath(cwd: string, rel: string): string {
  if (!rel) return cwd;
  if (rel.startsWith("/")) return normPath(rel);
  const parts = [...cwd.split("/").filter(Boolean)];
  for (const seg of rel.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return "/" + parts.join("/");
}

function normPath(p: string): string {
  const parts = p.split("/").filter(Boolean);
  const out: string[] = [];
  for (const seg of parts) {
    if (seg === "..") out.pop();
    else if (seg !== ".") out.push(seg);
  }
  return "/" + out.join("/");
}

// ─── Convenience wrappers (work with any fs that has .promises) ──────────────

export async function readFile(fs: LightningFSWrapper, path: string): Promise<string> {
  return fs.promises.readFile(path, { encoding: "utf8" }) as Promise<string>;
}

export async function writeFile(
  fs: LightningFSWrapper,
  path: string,
  content: string
): Promise<void> {
  await ensureDir(fs, dirnameOf(path));
  await fs.promises.writeFile(path, content, "utf8");
}

export async function writeBinary(
  fs: LightningFSWrapper,
  path: string,
  data: Uint8Array
): Promise<void> {
  await ensureDir(fs, dirnameOf(path));
  await fs.promises.writeFile(path, data);
}

export async function readdir(fs: LightningFSWrapper, path: string): Promise<string[]> {
  const entries = await fs.promises.readdir(path);
  return [...entries].sort();
}

export async function mkdir(fs: LightningFSWrapper, path: string): Promise<void> {
  try {
    await fs.promises.mkdir(path);
  } catch (e: any) {
    if (e.code !== "EEXIST") throw e;
  }
}

export async function ensureDir(fs: LightningFSWrapper, path: string): Promise<void> {
  if (path === "/" || path === "") return;
  try {
    const s = await fs.promises.stat(path);
    if (!s.isDirectory()) throw new Error(`${path} is not a directory`);
    return;
  } catch (e: any) {
    if (e.code !== "ENOENT") throw e;
  }
  await ensureDir(fs, dirnameOf(path));
  try {
    await fs.promises.mkdir(path);
  } catch (e: any) {
    if (e.code !== "EEXIST") throw e;
  }
}

export async function stat(fs: LightningFSWrapper, path: string) {
  return fs.promises.stat(path);
}

export async function exists(fs: LightningFSWrapper, path: string): Promise<boolean> {
  try {
    await fs.promises.stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function unlink(fs: LightningFSWrapper, path: string): Promise<void> {
  let s: Awaited<ReturnType<typeof fs.promises.stat>>;
  try {
    s = await stat(fs, path);
  } catch {
    return;
  }
  if (s.isDirectory()) {
    const children = await readdir(fs, path).catch(() => []);
    for (const child of children) {
      const childPath = path === "/" ? `/${child}` : `${path}/${child}`;
      await unlink(fs, childPath);
    }
    await fs.promises.rmdir(path);
  } else {
    await fs.promises.unlink(path);
  }
}

export async function listTree(
  fs: LightningFSWrapper,
  dir: string,
  maxDepth = 8,
  depth = 0
): Promise<VFile[]> {
  if (depth > maxDepth) return [];
  let entries: string[] = [];
  try {
    entries = await readdir(fs, dir);
  } catch {
    return [];
  }
  const result: VFile[] = [];
  for (const name of entries) {
    if (name === ".git") continue;
    const path = dir === "/" ? `/${name}` : `${dir}/${name}`;
    try {
      const s = await stat(fs, path);
      const isDir = s.isDirectory();
      result.push({ name, path, isDir });
      if (isDir) {
        const children = await listTree(fs, path, maxDepth, depth + 1);
        result.push(...children);
      }
    } catch {}
  }
  return result;
}

// ─── Type alias kept for backward compat ─────────────────────────────────────
export type MemFS = LightningFSWrapper;
