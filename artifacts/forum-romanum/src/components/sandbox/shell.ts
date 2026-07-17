import * as git from "isomorphic-git";
import type { MemFS } from "./vfs";
import * as vfs from "./vfs";
import {
  createNodeEnvironment,
  extractRequireIds,
  registerModule,
  isModuleRegistered,
  virtualServerHandlers,
} from "./nodePolyfills";

// ─── ANSI helpers ────────────────────────────────────────────────────────────
const A = {
  r: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  gold: "\x1b[33m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  yellow: "\x1b[93m",
};

export type WriteOutput = (text: string) => void;

// ─── Custom HTTP client — routes all git requests through our API server proxy
// so that CORS is never an issue (server-side Node.js has no CORS restrictions).
// Endpoint: /api/git-proxy?url=<encoded-target-url>
const proxyHttp = {
  async request({ url, method = "GET", headers = {}, body }: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: AsyncIterableIterator<Uint8Array>;
  }) {
    // Collect body chunks from the async iterator (git pack data for POSTs)
    let bodyBuffer: Uint8Array | undefined;
    if (body) {
      const chunks: Uint8Array[] = [];
      for await (const chunk of body) chunks.push(chunk);
      const total = chunks.reduce((s, c) => s + c.length, 0);
      bodyBuffer = new Uint8Array(total);
      let off = 0;
      for (const c of chunks) { bodyBuffer.set(c, off); off += c.length; }
    }

    const proxyUrl = `/api/git-proxy?url=${encodeURIComponent(url)}`;
    const res = await fetch(proxyUrl, {
      method,
      headers,
      body: bodyBuffer as unknown as BodyInit,
    });

    const responseHeaders: Record<string, string> = {};
    res.headers.forEach((v, k) => { responseHeaders[k] = v; });

    async function* bodyIter() {
      if (!res.body) return;
      const reader = res.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          yield value;
        }
      } finally {
        reader.releaseLock();
      }
    }

    return {
      url: res.url,
      method,
      statusCode: res.status,
      statusMessage: res.statusText,
      headers: responseHeaders,
      body: bodyIter(),
    };
  },
};

// kept for reference but no longer used — proxy handles CORS
const _UNUSED = [
  "https://cors.isomorphic-git.org",
  "https://cors-proxy.isomorphic-git.org",
];

export class Shell {
  private fs: MemFS;
  private cwd: string = "/";
  write: WriteOutput;
  onRun?: (dir: string) => void;
  /** Called when Tier 3 (real Node.js) session starts: (sessionId, port) */
  onTier3Start?: (sessionId: string, port: number) => void;
  public history: string[] = [];
  public historyIdx: number = -1;
  public tier3SessionId: string | null = null;
  private pyodide: any = null;
  private pyodideLoading = false;
  private tier3Cleanup?: () => void;

  constructor(fs: MemFS, write: WriteOutput) {
    this.fs = fs;
    this.write = write;
  }

  /** Kill any running Tier 3 session */
  killTier3() {
    this.tier3Cleanup?.();
    this.tier3Cleanup = undefined;
    this.tier3SessionId = null;
  }

  getCwd(): string { return this.cwd; }

  prompt(): string {
    return `\r\n${A.gold}${A.bold}forge${A.r}${A.dim}:${A.r}${A.cyan}${this.cwd}${A.r} ${A.gold}$${A.r} `;
  }

  private out(text: string) { this.write(text); }
  private err(text: string) { this.write(`${A.red}${text}${A.r}`); }

  private resolve(p?: string): string {
    if (!p) return this.cwd;
    return vfs.resolvePath(this.cwd, p);
  }

  async execute(rawInput: string): Promise<void> {
    // Normalize unicode/non-breaking whitespace → ASCII space before parsing.
    // Copying commands from web pages commonly produces \u00A0 and similar chars
    // that look like spaces but are not matched by the parser, causing tokens like
    // "clone https://..." to be treated as a single argument.
    const input = rawInput.replace(/[\u00A0\u2000-\u200B\u2028\u2029\u202F\u205F\u3000\uFEFF]/g, " ").trim();

    if (!input) return;
    if (this.history[this.history.length - 1] !== input) {
      this.history.push(input);
    }
    this.historyIdx = this.history.length;

    const parts = parseShell(input);
    if (!parts.length) return;
    const [cmd, ...args] = parts;

    try {
      switch (cmd) {
        case "help":    this.cmdHelp(); break;
        case "clear":   this.write("\x1b[2J\x1b[H"); break;
        case "pwd":     this.out(this.cwd + "\r\n"); break;
        case "ls":
        case "la":
        case "ll":      await this.cmdLs(args, cmd !== "ls"); break;
        case "cd":      await this.cmdCd(args[0]); break;
        case "cat":     await this.cmdCat(args); break;
        case "mkdir":   await this.cmdMkdir(args); break;
        case "touch":   await this.cmdTouch(args[0]); break;
        case "rm":      await this.cmdRm(args); break;
        case "echo":    await this.cmdEcho(args); break;
        case "cp":      await this.cmdCp(args[0], args[1]); break;
        case "mv":      await this.cmdMv(args[0], args[1]); break;
        case "tree":    await this.cmdTree(args[0], this.resolve(args[0] || "."), 0); break;
        case "git":     await this.cmdGit(args); break;
        case "node":
        case "js":      await this.cmdNode(args[0], args.slice(1)); break;
        case "python":
        case "python3":
        case "py":      await this.cmdPython(args[0]); break;
        case "npm":     await this.cmdNpm(args); break;
        case "npx":     await this.cmdNpx(args); break;
        case "run":     await this.cmdRun(args); break;
        default:
          this.err(`command not found: ${cmd}\r\n`);
          this.out(`${A.dim}Type 'help' for available commands${A.r}\r\n`);
      }
    } catch (e: any) {
      this.err(`Error: ${e?.message || String(e)}\r\n`);
    }
  }

  private cmdHelp() {
    this.out(
`${A.gold}${A.bold}╔══════════════════════════════════════╗${A.r}
${A.gold}${A.bold}║  Forge Terminal — Available Commands ║${A.r}
${A.gold}${A.bold}╚══════════════════════════════════════╝${A.r}

${A.bold}Filesystem${A.r}
  ${A.cyan}ls${A.r} [path]              list directory
  ${A.cyan}cd${A.r} <dir>               change directory
  ${A.cyan}pwd${A.r}                    print working directory
  ${A.cyan}cat${A.r} <file>             print file
  ${A.cyan}mkdir${A.r} <dir>            create directory
  ${A.cyan}touch${A.r} <file>           create file
  ${A.cyan}rm${A.r} [-r] <path>         remove file/directory
  ${A.cyan}cp${A.r} <src> <dst>         copy file
  ${A.cyan}mv${A.r} <src> <dst>         move/rename
  ${A.cyan}echo${A.r} ... [>file]       print or write to file
  ${A.cyan}tree${A.r} [dir]             show directory tree
  ${A.cyan}clear${A.r}                  clear terminal

${A.bold}Git${A.r}
  ${A.cyan}git init${A.r}                   init repo
  ${A.cyan}git status${A.r}                 show status
  ${A.cyan}git add${A.r} <file|.>           stage files
  ${A.cyan}git commit${A.r} -m "msg"        commit
  ${A.cyan}git log${A.r}                    show history
  ${A.cyan}git diff${A.r} [file]            show uncommitted diff
  ${A.cyan}git branch${A.r}                 list branches
  ${A.cyan}git branch${A.r} <name>          create branch
  ${A.cyan}git checkout${A.r} <branch>      switch branch
  ${A.cyan}git checkout${A.r} -b <branch>   create + switch branch
  ${A.cyan}git remote${A.r} add <n> <url>   add remote
  ${A.cyan}git remote${A.r} -v              list remotes
  ${A.cyan}git clone${A.r} <url> [dir]      clone repo (via CORS proxy)

${A.bold}Execute${A.r}
  ${A.cyan}node${A.r} <file.js>          run JS (path, fs, http, events, crypto… all built-in)
  ${A.cyan}python${A.r} <file.py>        run Python (Pyodide WASM)
  ${A.cyan}run${A.r} [script]            auto-detect & run project (reads package.json)

${A.bold}npm / packages${A.r}
  ${A.cyan}npm install${A.r} [pkg...]    install from esm.sh CDN (or from package.json)
  ${A.cyan}npm run${A.r} <script>        run a package.json script
  ${A.cyan}npm list${A.r}                show installed packages
  ${A.cyan}npx${A.r} <pkg>              run a package directly

`.replace(/\n/g, "\r\n")
    );
  }

  private async cmdLs(args: string[], showAll = false) {
    const dir = this.resolve(args[0] || ".");
    try {
      let entries = await vfs.readdir(this.fs, dir);
      if (!showAll) entries = entries.filter(n => !n.startsWith("."));
      if (!entries.length) { this.out("(empty)\r\n"); return; }
      const items: string[] = [];
      for (const name of entries) {
        const p = dir === "/" ? `/${name}` : `${dir}/${name}`;
        try {
          const s = await vfs.stat(this.fs, p);
          if (s.isDirectory()) {
            items.push(`${A.blue}${A.bold}${name}/${A.r}`);
          } else {
            const size = (s as any).size ?? 0;
            const sizeStr = showAll ? ` ${A.dim}(${formatBytes(size)})${A.r}` : "";
            items.push(`${name}${sizeStr}`);
          }
        } catch {
          items.push(name);
        }
      }
      if (showAll) {
        this.out(items.map(i => "  " + i).join("\r\n") + "\r\n");
      } else {
        this.out(items.join("  ") + "\r\n");
      }
    } catch {
      this.err(`ls: ${args[0] || "."}: No such directory\r\n`);
    }
  }

  private async cmdCd(dir?: string) {
    if (!dir || dir === "~") { this.cwd = "/"; return; }
    const target = this.resolve(dir);
    try {
      const s = await vfs.stat(this.fs, target);
      if (!s.isDirectory()) { this.err(`cd: ${dir}: Not a directory\r\n`); return; }
      this.cwd = target;
      // package.json hint (plan requirement)
      try {
        await vfs.stat(this.fs, `${target}/package.json`);
        this.out(`${A.yellow}📦 package.json found — run ${A.bold}npm install${A.r}${A.yellow} to set up dependencies${A.r}\r\n`);
      } catch {}
    } catch {
      this.err(`cd: ${dir}: No such directory\r\n`);
    }
  }

  private async cmdCat(args: string[]) {
    if (!args.length) { this.err("cat: missing operand\r\n"); return; }
    for (const f of args) {
      try {
        const content = await vfs.readFile(this.fs, this.resolve(f));
        this.out(content.replace(/\n/g, "\r\n"));
        if (!content.endsWith("\n")) this.out("\r\n");
      } catch {
        this.err(`cat: ${f}: No such file\r\n`);
      }
    }
  }

  private async cmdMkdir(args: string[]) {
    if (!args.length) { this.err("mkdir: missing operand\r\n"); return; }
    for (const d of args) {
      try {
        await vfs.ensureDir(this.fs, this.resolve(d));
        this.out(`${A.green}mkdir: created '${d}'${A.r}\r\n`);
      } catch (e: any) {
        this.err(`mkdir: ${e.message}\r\n`);
      }
    }
  }

  private async cmdTouch(file?: string) {
    if (!file) { this.err("touch: missing operand\r\n"); return; }
    const path = this.resolve(file);
    if (!(await vfs.exists(this.fs, path))) {
      await vfs.writeFile(this.fs, path, "");
    }
  }

  private async cmdRm(args: string[]) {
    let recursive = false;
    const targets: string[] = [];
    for (const a of args) {
      if (a === "-r" || a === "-rf" || a === "-fr" || a === "-f") recursive = true;
      else targets.push(a);
    }
    for (const t of targets) {
      const path = this.resolve(t);
      try {
        const s = await vfs.stat(this.fs, path);
        if (s.isDirectory() && !recursive) {
          this.err(`rm: ${t}: is a directory (use -r)\r\n`);
          continue;
        }
        await vfs.unlink(this.fs, path);
      } catch {
        this.err(`rm: ${t}: No such file\r\n`);
      }
    }
  }

  private async cmdEcho(args: string[]) {
    const arrow = args.indexOf(">");
    const dbl = args.indexOf(">>");
    const redir = arrow !== -1 ? arrow : dbl !== -1 ? dbl : -1;
    if (redir === -1) {
      this.out(args.join(" ") + "\r\n");
    } else {
      const text = args.slice(0, redir).join(" ");
      const file = args[redir + 1];
      if (!file) { this.err("echo: missing filename after >\r\n"); return; }
      const path = this.resolve(file);
      if (redir === dbl) {
        const existing = await vfs.readFile(this.fs, path).catch(() => "");
        await vfs.writeFile(this.fs, path, existing + text + "\n");
      } else {
        await vfs.writeFile(this.fs, path, text + "\n");
      }
    }
  }

  private async cmdCp(src?: string, dst?: string) {
    if (!src || !dst) { this.err("cp: missing operand\r\n"); return; }
    try {
      const content = await vfs.readFile(this.fs, this.resolve(src));
      await vfs.writeFile(this.fs, this.resolve(dst), content);
    } catch (e: any) { this.err(`cp: ${e.message}\r\n`); }
  }

  private async cmdMv(src?: string, dst?: string) {
    if (!src || !dst) { this.err("mv: missing operand\r\n"); return; }
    try {
      const content = await vfs.readFile(this.fs, this.resolve(src));
      await vfs.writeFile(this.fs, this.resolve(dst), content);
      await vfs.unlink(this.fs, this.resolve(src));
    } catch (e: any) { this.err(`mv: ${e.message}\r\n`); }
  }

  private async cmdTree(userArg: string | undefined, dir: string, depth: number) {
    if (depth === 0) this.out(dir + "\r\n");
    const prefix = "  ".repeat(depth);
    try {
      const entries = await vfs.readdir(this.fs, dir);
      for (let i = 0; i < entries.length; i++) {
        const name = entries[i];
        if (name === ".git") continue;
        const path = dir === "/" ? `/${name}` : `${dir}/${name}`;
        const branch = i < entries.length - 1 ? "├── " : "└── ";
        try {
          const s = await vfs.stat(this.fs, path);
          this.out(prefix + branch + (s.isDirectory() ? `${A.blue}${A.bold}${name}/${A.r}` : name) + "\r\n");
          if (s.isDirectory() && depth < 4) await this.cmdTree(undefined, path, depth + 1);
        } catch {}
      }
    } catch {}
  }

  // ─── git ─────────────────────────────────────────────────────────────────────

  private async cmdGit(args: string[]) {
    const subcmd = args[0];

    if (!subcmd) {
      this.out(`${A.gold}usage: git <command>${A.r}\r\n`);
      this.out(`${A.dim}Type 'help' to see available git commands${A.r}\r\n`);
      return;
    }

    const dir = this.cwd;

    switch (subcmd) {
      // ── init ────────────────────────────────────────────────────────────────
      case "init": {
        await git.init({ fs: this.fs, dir });
        this.out(`${A.green}Initialized empty Git repository in ${dir}/.git${A.r}\r\n`);
        break;
      }

      // ── status ──────────────────────────────────────────────────────────────
      case "status": {
        try {
          const matrix = await git.statusMatrix({ fs: this.fs, dir });
          let clean = true;
          for (const [filepath, head, workdir, stage] of matrix) {
            if (head === 1 && workdir === 1 && stage === 1) continue;
            clean = false;
            if (head === 0 && workdir === 2 && stage === 0)
              this.out(`${A.yellow}?? ${filepath}${A.r}\r\n`);
            else if (head === 0 && stage === 2)
              this.out(`${A.green}A  ${filepath}${A.r}\r\n`);
            else if (head === 1 && workdir !== 1)
              this.out(`${A.gold}M  ${filepath}${A.r}\r\n`);
            else if (head === 1 && workdir === 0)
              this.out(`${A.red}D  ${filepath}${A.r}\r\n`);
          }
          if (clean) this.out(`${A.green}nothing to commit, working tree clean${A.r}\r\n`);
        } catch { this.err("fatal: not a git repository\r\n"); }
        break;
      }

      // ── add ─────────────────────────────────────────────────────────────────
      case "add": {
        try {
          const files = args.slice(1);
          if (!files.length || files[0] === ".") {
            const matrix = await git.statusMatrix({ fs: this.fs, dir });
            for (const [filepath, , workdir] of matrix) {
              if (workdir === 0) {
                await git.remove({ fs: this.fs, dir, filepath });
              } else {
                await git.add({ fs: this.fs, dir, filepath });
              }
            }
            this.out(`${A.green}staged all changes${A.r}\r\n`);
          } else {
            for (const f of files) {
              await git.add({ fs: this.fs, dir, filepath: f });
              this.out(`${A.green}staged: ${f}${A.r}\r\n`);
            }
          }
        } catch (e: any) { this.err(`git add: ${e.message}\r\n`); }
        break;
      }

      // ── commit ──────────────────────────────────────────────────────────────
      case "commit": {
        try {
          const mIdx = args.indexOf("-m");
          const msg = mIdx !== -1 ? args[mIdx + 1] ?? "update" : "update";
          const sha = await git.commit({
            fs: this.fs, dir,
            author: { name: "Forge", email: "forge@hatch.dev" },
            message: msg,
          });
          this.out(`${A.green}[${sha.slice(0, 7)}] ${msg}${A.r}\r\n`);
        } catch (e: any) { this.err(`git commit: ${e.message}\r\n`); }
        break;
      }

      // ── log ─────────────────────────────────────────────────────────────────
      case "log": {
        try {
          const commits = await git.log({ fs: this.fs, dir, depth: 10 });
          if (!commits.length) {
            this.out(`${A.dim}No commits yet${A.r}\r\n`);
            break;
          }
          for (const c of commits) {
            this.out(`${A.gold}commit ${c.oid}${A.r}\r\n`);
            this.out(`Author: ${c.commit.author.name} <${c.commit.author.email}>\r\n`);
            this.out(`Date:   ${new Date(c.commit.author.timestamp * 1000).toLocaleString()}\r\n`);
            this.out(`\r\n    ${c.commit.message.trim()}\r\n\r\n`);
          }
        } catch { this.err("fatal: not a git repository\r\n"); }
        break;
      }

      // ── diff ────────────────────────────────────────────────────────────────
      case "diff": {
        try {
          const matrix = await git.statusMatrix({ fs: this.fs, dir });
          let found = false;
          const filterFile = args[1];
          for (const [filepath, head, workdir, stage] of matrix) {
            if (filterFile && filepath !== filterFile) continue;
            if (head === 1 && workdir === 1 && stage === 1) continue;
            found = true;
            if (workdir === 0) {
              this.out(`${A.red}deleted: ${filepath}${A.r}\r\n`);
            } else if (head === 0) {
              this.out(`${A.green}new file: ${filepath}${A.r}\r\n`);
              try {
                const content = await vfs.readFile(this.fs, vfs.resolvePath(dir, filepath));
                for (const line of content.split("\n")) {
                  this.out(`${A.green}+ ${line}${A.r}\r\n`);
                }
              } catch {}
            } else {
              this.out(`${A.gold}modified: ${filepath}${A.r}\r\n`);
            }
          }
          if (!found) this.out(`${A.dim}No changes${A.r}\r\n`);
        } catch { this.err("fatal: not a git repository\r\n"); }
        break;
      }

      // ── branch ──────────────────────────────────────────────────────────────
      case "branch": {
        try {
          const newBranch = args[1];
          if (newBranch && !newBranch.startsWith("-")) {
            await git.branch({ fs: this.fs, dir, ref: newBranch });
            this.out(`${A.green}Created branch '${newBranch}'${A.r}\r\n`);
          } else {
            const branches = await git.listBranches({ fs: this.fs, dir });
            const current = await git.currentBranch({ fs: this.fs, dir }).catch(() => null);
            if (!branches.length) {
              this.out(`${A.dim}No branches yet (make a commit first)${A.r}\r\n`);
            } else {
              for (const b of branches) {
                if (b === current) this.out(`${A.green}* ${b}${A.r}\r\n`);
                else this.out(`  ${b}\r\n`);
              }
            }
          }
        } catch (e: any) { this.err(`git branch: ${e.message}\r\n`); }
        break;
      }

      // ── checkout ────────────────────────────────────────────────────────────
      case "checkout": {
        try {
          const createFlag = args[1] === "-b";
          const branchName = createFlag ? args[2] : args[1];
          if (!branchName) { this.err("git checkout: missing branch name\r\n"); break; }
          if (createFlag) {
            await git.branch({ fs: this.fs, dir, ref: branchName, checkout: true });
            this.out(`${A.green}Switched to a new branch '${branchName}'${A.r}\r\n`);
          } else {
            await git.checkout({ fs: this.fs, dir, ref: branchName });
            this.out(`${A.green}Switched to branch '${branchName}'${A.r}\r\n`);
          }
        } catch (e: any) { this.err(`git checkout: ${e.message}\r\n`); }
        break;
      }

      // ── remote ──────────────────────────────────────────────────────────────
      case "remote": {
        try {
          const sub = args[1];
          if (sub === "add") {
            const name = args[2];
            const url = args[3];
            if (!name || !url) { this.err("usage: git remote add <name> <url>\r\n"); break; }
            await git.addRemote({ fs: this.fs, dir, remote: name, url });
            this.out(`${A.green}Added remote '${name}' → ${url}${A.r}\r\n`);
          } else if (sub === "remove" || sub === "rm") {
            const name = args[2];
            if (!name) { this.err("usage: git remote remove <name>\r\n"); break; }
            await git.deleteRemote({ fs: this.fs, dir, remote: name });
            this.out(`${A.green}Removed remote '${name}'${A.r}\r\n`);
          } else {
            const remotes = await git.listRemotes({ fs: this.fs, dir });
            if (!remotes.length) {
              this.out(`${A.dim}No remotes configured${A.r}\r\n`);
            } else {
              for (const r of remotes) {
                this.out(`${A.cyan}${r.remote}${A.r}\t${r.url}\r\n`);
              }
            }
          }
        } catch (e: any) { this.err(`git remote: ${e.message}\r\n`); }
        break;
      }

      // ── clone ───────────────────────────────────────────────────────────────
      case "clone": {
        const url = args[1];
        if (!url) { this.err("usage: git clone <url> [directory]\r\n"); break; }

        // Derive target directory name from URL (last path segment, strip .git)
        const urlBasename = url.split("/").pop()?.replace(/\.git$/, "") ?? "repo";
        const targetDir = args[2]
          ? this.resolve(args[2])
          : vfs.resolvePath(this.cwd, urlBasename);

        this.out(`${A.dim}Cloning into '${vfs.basenameOf(targetDir)}'...${A.r}\r\n`);

        try {
          await vfs.ensureDir(this.fs, targetDir);

          let lastPhase = "";
          await git.clone({
            fs: this.fs,
            http: proxyHttp,
            dir: targetDir,
            url,
            singleBranch: true,
            depth: 1,
            onProgress: (p: any) => {
              if (p.phase !== lastPhase) {
                lastPhase = p.phase;
                this.write(`\r\n${A.dim}${p.phase}${A.r}   `);
              } else {
                const total = p.total ? `/${p.total}` : "";
                this.write(`\r${A.dim}${p.phase}: ${p.loaded}${total}${A.r}   `);
              }
            },
          });

          this.out(`\r\n${A.green}Cloned into '${vfs.basenameOf(targetDir)}'.${A.r}\r\n`);
          this.out(`${A.dim}Tip: cd ${vfs.basenameOf(targetDir)}${A.r}\r\n`);
        } catch (e: any) {
          this.err(`\r\ngit clone failed: ${e.message}\r\n`);
        }
        break;
      }

      // ── push / pull — unsupported in browser sandbox ────────────────────────
      case "push":
      case "pull":
        this.err(`git ${subcmd}: push/pull to remote servers is not supported in the browser sandbox.\r\n`);
        this.out(`${A.dim}Use 'git clone' to fetch a repo, or export your work via the UI.${A.r}\r\n`);
        break;

      default:
        this.err(`git: '${subcmd}' is not a git command. See 'help'.\r\n`);
        this.out(`${A.dim}Supported: init, status, add, commit, log, diff, branch, checkout, remote, clone${A.r}\r\n`);
    }
  }

  // ─── node / js ───────────────────────────────────────────────────────────────

  private async cmdNode(file?: string, extraArgs: string[] = []) {
    if (!file) { this.err("node: missing file argument\r\n"); return; }
    const filepath = this.resolve(file);
    try {
      const code = await vfs.readFile(this.fs, filepath);

      // Pre-fetch any npm packages referenced by require()
      const reqIds = extractRequireIds(code);
      const toFetch = reqIds.filter(id => !isBuiltin(id) && !isModuleRegistered(id));
      if (toFetch.length) {
        this.out(`${A.dim}Loading: ${toFetch.join(", ")}…${A.r}\r\n`);
        await Promise.allSettled(toFetch.map(id => this.fetchNpmPackage(id)));
      }

      const env = createNodeEnvironment({
        cwd: vfs.dirnameOf(filepath),
        filename: filepath,
        vfs: this.fs,
        write: (s) => this.write(s),
      });
      env.process.argv = ["node", filepath, ...extraArgs];

      const fakeConsole = {
        log:   (...a: any[]) => this.out(a.map(stringifyArg).join(" ") + "\r\n"),
        error: (...a: any[]) => this.out(`${A.red}${a.map(stringifyArg).join(" ")}${A.r}\r\n`),
        warn:  (...a: any[]) => this.out(`${A.gold}${a.map(stringifyArg).join(" ")}${A.r}\r\n`),
        info:  (...a: any[]) => this.out(a.map(stringifyArg).join(" ") + "\r\n"),
        dir:   (o: any) => this.out(stringifyArg(o) + "\r\n"),
        table: (o: any) => this.out(stringifyArg(o) + "\r\n"),
        trace: (...a: any[]) => this.out(a.map(stringifyArg).join(" ") + "\r\n"),
        debug: (...a: any[]) => this.out(`${A.dim}${a.map(stringifyArg).join(" ")}${A.r}\r\n`),
        assert: (v: any, msg?: string) => { if (!v) this.out(`${A.red}AssertionError: ${msg ?? "false"}${A.r}\r\n`); },
        group: () => {}, groupEnd: () => {}, time: () => {}, timeEnd: () => {},
      };

      // CJS module wrapper — same as Node.js internally
      const wrapped = `(async function(require, module, exports, __dirname, __filename, console, process, Buffer, setTimeout, setInterval, clearTimeout, clearInterval, setImmediate) {\n${code}\n})`;
      const fn = eval(wrapped); // eslint-disable-line no-eval

      await fn(
        env.require, env.module, env.exports,
        env.__dirname, env.__filename,
        fakeConsole, env.process,
        globalThis.Buffer,
        setTimeout, setInterval, clearTimeout, clearInterval,
        (fn: Function) => queueMicrotask(() => fn()),
      );

      // If user called http.createServer().listen(), open the virtual server in preview
      if (virtualServerHandlers.size > 0) {
        const port = [...virtualServerHandlers.keys()][0];
        this.out(`${A.green}Server listening on virtual port ${port} — opening Preview…${A.r}\r\n`);
        this.onRun?.(`server:${port}`);
      }
    } catch (e: any) {
      if (e?.message?.startsWith("process.exit")) {
        this.out(`${A.dim}${e.message}${A.r}\r\n`);
      } else {
        this.err(`${e.message ?? String(e)}\r\n`);
      }
    }
  }

  // ─── npm ─────────────────────────────────────────────────────────────────────

  private async cmdNpm(args: string[]) {
    const [sub, ...rest] = args;
    switch (sub) {
      case "install": case "i": case "add": {
        const pkgs = rest.filter(a => !a.startsWith("-"));
        if (!pkgs.length) await this.npmInstallFromPkg();
        else for (const p of pkgs) await this.npmInstallPkg(p);
        break;
      }
      case "run": {
        if (!rest[0]) { this.err("npm run: script name required\r\n"); return; }
        await this.npmRunScript(rest[0]);
        break;
      }
      case "list": case "ls": await this.npmList(); break;
      case "uninstall": case "remove": case "rm": {
        for (const p of rest.filter(a => !a.startsWith("-"))) {
          // Mark removed in memory — VFS node_modules untouched for now
          this.out(`${A.dim}Removed ${p} from module cache.${A.r}\r\n`);
        }
        break;
      }
      case "start": await this.npmRunScript("start"); break;
      default:
        this.err(`npm ${sub ?? ""}: not supported in sandbox.\r\nAvailable: install, run, list, start\r\n`);
    }
  }

  private async npmInstallFromPkg() {
    const pkgPath = vfs.resolvePath(this.cwd, "package.json");
    if (!(await vfs.exists(this.fs, pkgPath))) {
      this.err("No package.json found in current directory.\r\n"); return;
    }
    const raw = await vfs.readFile(this.fs, pkgPath);
    let pkg: any;
    try { pkg = JSON.parse(raw); } catch { this.err("Invalid package.json\r\n"); return; }
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const names = Object.keys(deps);
    if (!names.length) { this.out("No dependencies to install.\r\n"); return; }
    this.out(`${A.dim}Installing ${names.length} package(s) via esm.sh…${A.r}\r\n`);
    const results = await Promise.allSettled(names.map(n => this.fetchNpmPackage(n)));
    let ok = 0, fail = 0;
    results.forEach((r, i) => {
      if (r.status === "fulfilled") { this.out(`${A.green}+ ${names[i]}${A.r}\r\n`); ok++; }
      else { this.out(`${A.red}✗ ${names[i]}: ${(r as any).reason?.message}${A.r}\r\n`); fail++; }
    });
    this.out(`\r\n${A.green}${ok} installed${fail ? `, ${A.red}${fail} failed${A.r}` : ""}${A.r}\r\n`);
  }

  private async npmInstallPkg(pkg: string) {
    // Strip version specifier for the import URL
    const id = pkg.replace(/@[^@/]+$/, "");
    this.out(`${A.dim}Installing ${pkg}…${A.r}\r\n`);
    try {
      await this.fetchNpmPackage(id);
      await this.updatePackageJson(id, pkg.includes("@") ? pkg.split("@").pop()! : "*");
      this.out(`${A.green}+ ${pkg}${A.r}\r\n`);
    } catch (e: any) {
      this.err(`npm install ${pkg}: ${e.message}\r\n`);
    }
  }

  private async fetchNpmPackage(id: string): Promise<void> {
    if (isModuleRegistered(id)) return;

    // @types/* are TypeScript declaration packages — no runtime JS, skip silently.
    if (id.startsWith("@types/")) {
      this.out(`${A.dim}  skipped ${id} (type declarations, not needed at runtime)${A.r}\r\n`);
      // Register as empty so it counts as "installed" and doesn't block later runs
      registerModule(id, {});
      return;
    }

    // Dynamic import from esm.sh — returns proper ESM
    const url = `https://esm.sh/${id}`;
    let mod: any;
    try {
      mod = await import(/* @vite-ignore */ url);
    } catch (err: any) {
      const msg: string = err?.message ?? String(err);
      // CJS-only packages (vite, webpack, etc.) use require() which the browser doesn't have.
      if (msg.includes("module.require") || msg.includes("require is not") || msg.includes("[unenv]")) {
        throw new Error(
          `${id} is a Node.js-only build tool and cannot load in the browser.\r\n` +
          `  It will still work when you run 'run' — the Tier 3 server handles it.`
        );
      }
      throw err;
    }

    // Merge default + named exports so require('pkg') behaves like CJS interop
    let exports = mod.default ?? mod;
    if (exports && typeof exports === "object") {
      for (const [k, v] of Object.entries(mod)) {
        if (k !== "default" && !(k in exports)) {
          try { exports[k] = v; } catch {}
        }
      }
    }
    registerModule(id, exports);
  }

  private async npmRunScript(script: string) {
    const pkgPath = vfs.resolvePath(this.cwd, "package.json");
    if (!(await vfs.exists(this.fs, pkgPath))) {
      this.err("No package.json found.\r\n"); return;
    }
    const raw = await vfs.readFile(this.fs, pkgPath);
    let pkg: any;
    try { pkg = JSON.parse(raw); } catch { this.err("Invalid package.json\r\n"); return; }
    const scriptCmd: string | undefined = pkg.scripts?.[script];
    if (!scriptCmd) {
      this.err(`npm run: script '${script}' not found in package.json\r\n`);
      const available = Object.keys(pkg.scripts ?? {});
      if (available.length) this.out(`${A.dim}Available: ${available.join(", ")}${A.r}\r\n`);
      return;
    }
    this.out(`${A.dim}> ${scriptCmd}${A.r}\r\n`);
    // Check if this can run in browser (simple node invocation) or needs Tier 3
    const needsTier3 = /\b(webpack|vite|rollup|parcel|tsc|esbuild|next|nuxt|remix|astro)\b/.test(scriptCmd);
    if (needsTier3 && this.onTier3Start) {
      await this.cmdTier3(scriptCmd);
    } else if (/^node\s+/.test(scriptCmd)) {
      const nodeFile = scriptCmd.replace(/^node\s+/, "").trim();
      await this.cmdNode(nodeFile);
    } else {
      // Try Tier 3 if available, else warn
      if (this.onTier3Start) {
        await this.cmdTier3(scriptCmd);
      } else {
        this.err(`Cannot run '${scriptCmd}' in browser sandbox.\r\nUse 'node <file.js>' directly.\r\n`);
      }
    }
  }

  private async npmList() {
    const nmPath = vfs.resolvePath(this.cwd, "node_modules");
    const cached = Array.from({ length: 0 }); // module registry isn't iterable publicly
    this.out(`${A.bold}Cached packages (loaded via esm.sh):${A.r}\r\n`);
    // Show from package.json if available
    const pkgPath = vfs.resolvePath(this.cwd, "package.json");
    if (await vfs.exists(this.fs, pkgPath)) {
      const raw = await vfs.readFile(this.fs, pkgPath);
      try {
        const pkg = JSON.parse(raw);
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        for (const [name, ver] of Object.entries(deps)) {
          const loaded = isModuleRegistered(name);
          this.out(`  ${loaded ? A.green + "●" : A.dim + "○"}${A.r} ${name}@${ver}\r\n`);
        }
      } catch {}
    } else {
      this.out(`${A.dim}(no package.json — run npm install <pkg> to load packages)${A.r}\r\n`);
    }
  }

  private async updatePackageJson(name: string, version: string) {
    const pkgPath = vfs.resolvePath(this.cwd, "package.json");
    let pkg: any = { name: "sandbox", version: "1.0.0", dependencies: {} };
    if (await vfs.exists(this.fs, pkgPath)) {
      try { pkg = JSON.parse(await vfs.readFile(this.fs, pkgPath)); } catch {}
    }
    pkg.dependencies ??= {};
    pkg.dependencies[name] = version;
    await vfs.writeFile(this.fs, pkgPath, JSON.stringify(pkg, null, 2));
  }

  // ─── npx ─────────────────────────────────────────────────────────────────────

  private async cmdNpx(args: string[]) {
    const [pkg, ...rest] = args;
    if (!pkg) { this.err("npx: package name required\r\n"); return; }
    this.out(`${A.dim}Fetching ${pkg} via esm.sh…${A.r}\r\n`);
    try {
      await this.fetchNpmPackage(pkg);
      // Most CLI packages export a default function or have a bin entry
      // For simplicity, escalate to Tier 3 if available
      if (this.onTier3Start) {
        await this.cmdTier3(`npx ${[pkg, ...rest].join(" ")}`);
      } else {
        this.err(`npx in browser mode only loads the package — use node <file> to run it.\r\n`);
      }
    } catch (e: any) {
      this.err(`npx ${pkg}: ${e.message}\r\n`);
    }
  }

  // ─── Tier 3 — real Node.js via API server ─────────────────────────────────

  private async cmdTier3(command: string) {
    this.out(`${A.dim}Starting server-side Node.js runtime…${A.r}\r\n`);
    this.out(`${A.dim}Uploading workspace files…${A.r}\r\n`);

    try {
      const files = await this.collectVFSFiles();
      const res = await fetch("/api/sandbox/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ files, command, cwd: this.cwd }),
      });

      // Guard against HTML error pages (404, 502, etc.) before calling .json()
      const ct = res.headers.get("content-type") ?? "";
      if (!ct.includes("application/json")) {
        const text = await res.text();
        throw new Error(
          `Server returned ${res.status} (not JSON).\r\n` +
          `${A.dim}${text.slice(0, 200)}${A.r}`
        );
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Server error ${res.status}`);

      const { sessionId, port } = data;
      this.tier3SessionId = sessionId;
      this.out(`${A.green}✓ Session ${sessionId} — listening on port ${port}${A.r}\r\n`);
      this.out(`${A.dim}Streaming output… press Ctrl+C to stop${A.r}\r\n\r\n`);

      // Stream stdout/stderr via SSE
      const source = new EventSource(`/api/sandbox/${sessionId}/stream`);
      this.tier3Cleanup = () => {
        source.close();
        fetch(`/api/sandbox/${sessionId}`, { method: "DELETE" }).catch(() => {});
        this.tier3SessionId = null;
      };

      source.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === "output") {
          this.write(msg.data.replace(/(?<!\r)\n/g, "\r\n"));
        }
        if (msg.type === "exit") {
          source.close();
          this.tier3Cleanup = undefined;
          this.tier3SessionId = null;
          this.out(`\r\n${A.dim}[Process exited with code ${msg.code ?? "?"}]${A.r}\r\n`);
        }
      };
      source.onerror = () => {
        // Don't crash on SSE reconnect attempts; just close if session is gone
        if (!this.tier3SessionId) source.close();
      };

      // Notify SandboxIDE so preview switches to proxy mode
      this.onTier3Start?.(sessionId, port);
    } catch (e: any) {
      this.err(`Tier 3 failed: ${e.message}\r\n`);
      this.out(
        `${A.dim}Tip: 'run' sends your files to the API server and starts a real Node.js process.\r\n` +
        `Make sure the API server is running and /api/sandbox/start is reachable.${A.r}\r\n`
      );
    }
  }

  private async collectVFSFiles(): Promise<Array<{ path: string; content: string }>> {
    const files: Array<{ path: string; content: string }> = [];
    const walk = async (dir: string) => {
      let entries: string[] = [];
      try { entries = await vfs.readdir(this.fs, dir); } catch { return; }
      for (const name of entries) {
        if (name === ".git") continue; // skip git objects — too large
        const full = dir === "/" ? `/${name}` : `${dir}/${name}`;
        try {
          const st = await this.fs.promises.stat(full);
          if (st.isDirectory()) {
            await walk(full);
          } else {
            const content = await vfs.readFile(this.fs, full);
            files.push({ path: full.replace(/^\//, ""), content });
          }
        } catch {}
      }
    };
    await walk("/");
    return files;
  }

  // ─── python / pyodide ────────────────────────────────────────────────────────

  private async cmdPython(file?: string) {
    if (!this.pyodide) {
      this.out(`${A.dim}Loading Python 3.11 (Pyodide/WASM)...${A.r}\r\n`);
    }
    try {
      if (!this.pyodide && !this.pyodideLoading) {
        this.pyodideLoading = true;
        this.out(`${A.dim}Fetching runtime from CDN (~10MB, one-time)...${A.r}\r\n`);
        // @ts-ignore
        const { loadPyodide } = await import(/* @vite-ignore */ "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.mjs");
        this.pyodide = await loadPyodide({
          indexURL: "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/",
          stdout: (msg: string) => this.out(msg + "\r\n"),
          stderr: (msg: string) => this.out(`${A.red}${msg}${A.r}\r\n`),
        });
        this.pyodideLoading = false;
        this.out(`${A.green}Python 3.11 ready${A.r}\r\n`);
      }
      if (file) {
        const code = await vfs.readFile(this.fs, this.resolve(file));
        await this.pyodide.runPythonAsync(code);
      }
    } catch (e: any) {
      this.pyodideLoading = false;
      this.err(`python: ${e.message}\r\n`);
    }
  }

  // ─── run — smart project entry-point detection ───────────────────────────────

  private async cmdRun(args: string[] = []) {
    let files: string[] = [];
    try { files = await vfs.readdir(this.fs, this.cwd); } catch {}

    // 1. package.json — check scripts first
    if (files.includes("package.json")) {
      try {
        const raw = await vfs.readFile(this.fs, vfs.resolvePath(this.cwd, "package.json"));
        const pkg = JSON.parse(raw);
        const scriptName = args[0] || (pkg.scripts?.dev ? "dev" : pkg.scripts?.start ? "start" : null);
        if (scriptName && pkg.scripts?.[scriptName]) {
          await this.npmRunScript(scriptName);
          return;
        }
        // Fallback to main field
        if (pkg.main && files.includes(pkg.main.replace(/^\.\//, ""))) {
          await this.cmdNode(pkg.main);
          return;
        }
      } catch {}
    }

    // 2. Static HTML
    const hasHtml = (list: string[]) => list.some(f => f === "index.html" || f === "index.htm");
    if (hasHtml(files)) {
      this.out(`${A.green}Found index.html — opening Preview tab…${A.r}\r\n`);
      this.onRun?.(this.cwd);
      return;
    }

    // 3. Check common subdirs for index.html (e.g. web/, public/, src/, dist/)
    const htmlDirs: string[] = ["public", "web", "dist", "build", "out", "www", "static", "site"];
    for (const sub of htmlDirs) {
      if (files.includes(sub)) {
        const subFiles = await vfs.readdir(this.fs, vfs.resolvePath(this.cwd, sub)).catch(() => [] as string[]);
        if (hasHtml(subFiles)) {
          const subDir = vfs.resolvePath(this.cwd, sub);
          this.out(`${A.green}Found index.html in ${sub}/ — opening Preview tab…${A.r}\r\n`);
          this.onRun?.(subDir);
          return;
        }
      }
    }

    // 4. JS entry points
    const jsEntry = ["index.js", "main.js", "app.js", "server.js", "index.mjs", "main.mjs"].find(f => files.includes(f));
    if (jsEntry) { await this.cmdNode(jsEntry); return; }

    // 5. Python entry points
    const pyEntry = ["main.py", "app.py", "index.py", "run.py"].find(f => files.includes(f));
    if (pyEntry) { await this.cmdPython(pyEntry); return; }

    this.out(`${A.gold}No entry point detected.\r\n`);
    this.out(`Try one of:\r\n`);
    this.out(`  ${A.cyan}node server.js${A.r}    — run a JS file\r\n`);
    this.out(`  ${A.cyan}npm install${A.r}       — install dependencies\r\n`);
    this.out(`  ${A.cyan}npm run dev${A.r}       — run dev script from package.json\r\n`);
    this.out(`  ${A.cyan}python main.py${A.r}    — run a Python file${A.r}\r\n`);
  }
}

// ─── Built-in module check ────────────────────────────────────────────────────

const NODE_BUILTINS = new Set([
  "path","url","events","stream","util","os","assert","querystring","crypto",
  "buffer","http","https","net","fs","fs/promises","timers","child_process",
  "cluster","dns","readline","zlib","vm","tty","constants","perf_hooks",
  "worker_threads","v8","inspector","module","node:path","node:url",
  "node:events","node:stream","node:util","node:os","node:assert",
  "node:querystring","node:crypto","node:buffer","node:http","node:https",
  "node:net","node:fs","node:fs/promises","node:timers","node:worker_threads",
]);

function isBuiltin(id: string): boolean {
  return NODE_BUILTINS.has(id);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function stringifyArg(a: any): string {
  if (typeof a === "string") return a;
  try { return JSON.stringify(a, null, 2); } catch { return String(a); }
}

/**
 * Shell-like argument parser with quote support.
 * Normalizes all Unicode whitespace variants (non-breaking spaces, etc.)
 * to ASCII space before splitting so copy-pasted commands work correctly.
 */
function parseShell(input: string): string[] {
  // Replace any non-ASCII-space whitespace lookalikes with a plain space.
  // This fixes copy-paste from web pages that embed \u00A0 (non-breaking space)
  // and similar Unicode characters between tokens.
  const normalized = input.replace(
    /[\u00A0\u1680\u2000-\u200B\u2028\u2029\u202F\u205F\u3000\uFEFF]/g,
    " "
  );

  const args: string[] = [];
  let cur = "";
  let quote: string | null = null;

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === " " || ch === "\t") {
      if (cur) { args.push(cur); cur = ""; }
    } else {
      cur += ch;
    }
  }
  if (cur) args.push(cur);
  return args;
}
