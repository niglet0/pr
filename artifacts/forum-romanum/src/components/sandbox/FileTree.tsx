import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { VFile, MemFS } from "./vfs";
import { listTree, writeFile, unlink, stat, mkdir } from "./vfs";

interface Props {
  fs: MemFS;
  activeFile: string | null;
  onOpenFile: (path: string, content: string) => void;
  refreshTick: number;
  blockedPaths?: string[];
  readonlyPaths?: string[];
}

function langIcon(name: string, isDir: boolean): string {
  if (isDir) return "▸";
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    js: "JS", ts: "TS", jsx: "JSX", tsx: "TSX",
    py: "PY", html: "HT", css: "CS", scss: "SC",
    json: "{}",  md: "MD", txt: "TXT", sh: "SH",
    rs: "RS", go: "GO", java: "JA", rb: "RB",
    sql: "SQL", yaml: "YML", yml: "YML", toml: "TML",
    env: "ENV", svg: "SVG",
  };
  return map[ext] ?? "··";
}

type TreeNode = { file: VFile; depth: number; children?: TreeNode[] };

function buildTree(files: VFile[]): TreeNode[] {
  const getChildren = (parentPath: string, depth: number): TreeNode[] =>
    files
      .filter((f) => {
        const pParts = parentPath.split("/").filter(Boolean);
        const fParts = f.path.split("/").filter(Boolean);
        return (
          fParts.length === pParts.length + 1 &&
          f.path.startsWith(parentPath === "/" ? "/" : parentPath + "/")
        );
      })
      .map((f) => ({
        file: f,
        depth,
        children: f.isDir ? getChildren(f.path, depth + 1) : undefined,
      }));

  return files
    .filter((f) => f.path.split("/").filter(Boolean).length === 1)
    .map((f) => ({ file: f, depth: 0, children: f.isDir ? getChildren(f.path, 1) : undefined }));
}

function matchesBlock(filePath: string, patterns: string[]): boolean {
  for (const p of patterns) {
    if (filePath === p) return true;
    if (filePath.startsWith(p + '/')) return true;
    if (p.includes('*')) {
      const esc = p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*');
      try {
        if (new RegExp('^' + esc + '$').test(filePath)) return true;
        const bn = filePath.split('/').pop() ?? '';
        if (new RegExp('^' + esc.replace(/^\//, '') + '$').test(bn)) return true;
      } catch {}
    }
  }
  return false;
}

export default function FileTree({ fs, activeFile, onOpenFile, refreshTick, blockedPaths = [], readonlyPaths = [] }: Props) {
  const [files, setFiles] = useState<VFile[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["/" ]));
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const [newEntry, setNewEntry] = useState<{ parent: string; type: "file" | "dir" } | null>(null);
  const [newName, setNewName] = useState("");

  const refresh = useCallback(async () => {
    const tree = await listTree(fs, "/").catch(() => []);
    // Hide blocked paths from the tree
    const visible = blockedPaths.length
      ? tree.filter((f) => !matchesBlock(f.path, blockedPaths))
      : tree;
    setFiles(visible);
  }, [fs, blockedPaths]);

  useEffect(() => { refresh(); }, [refresh, refreshTick]);

  const openFile = async (path: string, isDir: boolean) => {
    if (isDir) {
      setExpanded((e) => {
        const n = new Set(e);
        n.has(path) ? n.delete(path) : n.add(path);
        return n;
      });
      return;
    }
    // Blocked files are already filtered from the tree, but guard here too
    if (matchesBlock(path, blockedPaths)) return;
    try {
      const content = (await fs.promises.readFile(path, { encoding: "utf8" })) as string;
      onOpenFile(path, content);
    } catch {}
  };

  const isRO = (path: string) => matchesBlock(path, readonlyPaths);

  const doDelete = async (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isRO(path)) {
      alert("This file is protected by .HatchBlock — editing is disabled.");
      return;
    }
    if (!confirm(`Delete "${path.split("/").pop()}"?`)) return;
    await unlink(fs, path);
    refresh();
  };

  const doRename = async (oldPath: string) => {
    const val = renameVal.trim();
    setRenaming(null);
    if (!val || val === oldPath.split("/").pop()) return;
    if (isRO(oldPath)) {
      alert("This file is protected by .HatchBlock — editing is disabled.");
      return;
    }
    const dir = oldPath.split("/").slice(0, -1).join("/") || "/";
    const newPath = dir === "/" ? `/${val}` : `${dir}/${val}`;
    try {
      const content = (await fs.promises.readFile(oldPath, { encoding: "utf8" })) as string;
      await writeFile(fs, newPath, content);
      await unlink(fs, oldPath);
    } catch {}
    refresh();
  };

  const doCreate = async () => {
    const val = newName.trim();
    setNewEntry(null);
    setNewName("");
    if (!val || !newEntry) return;
    const parent = newEntry.parent;
    const path = parent === "/" ? `/${val}` : `${parent}/${val}`;
    if (newEntry.type === "file") {
      await writeFile(fs, path, "");
      try {
        onOpenFile(path, "");
      } catch {}
    } else {
      await mkdir(fs, path);
    }
    refresh();
  };

  const nodes = buildTree(files);

  const renderNode = (node: TreeNode): React.ReactNode => {
    const { file, children } = node;
    const depth = file.path.split("/").filter(Boolean).length - 1;
    const isExpanded = expanded.has(file.path);
    const isActive = activeFile === file.path;
    const icon = file.isDir ? (isExpanded ? "▾" : "▸") : null;
    const badge = langIcon(file.name, file.isDir);
    const readonly = !file.isDir && isRO(file.path);

    return (
      <div key={file.path}>
        <div
          className="group flex items-center gap-1.5 cursor-pointer transition-colors rounded-sm mx-1"
          style={{
            paddingLeft: `${6 + depth * 12}px`,
            paddingRight: "6px",
            paddingTop: "3px",
            paddingBottom: "3px",
            background: isActive ? "#C5A05918" : "transparent",
            color: isActive ? "#E8E6E0" : "#6A6A68",
            userSelect: "none",
          }}
          onClick={() => openFile(file.path, file.isDir)}
          onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = "#B0ADA5"; }}
          onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = "#6A6A68"; }}
        >
          {/* Expand arrow (dirs only) */}
          <span className="text-[9px] w-2.5 shrink-0 text-center" style={{ color: "#3A3A38" }}>
            {icon}
          </span>

          {/* Language badge */}
          {!file.isDir && (
            <span
              className="text-[7.5px] font-black shrink-0 w-6 text-center leading-none py-0.5 rounded"
              style={{ background: "#1A1A18", color: "#555550" }}
            >
              {badge}
            </span>
          )}

          {/* Name / rename input */}
          {renaming === file.path ? (
            <input
              autoFocus
              value={renameVal}
              onChange={(e) => setRenameVal(e.target.value)}
              onBlur={() => doRename(file.path)}
              onKeyDown={(e) => {
                if (e.key === "Enter") doRename(file.path);
                if (e.key === "Escape") setRenaming(null);
              }}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 bg-transparent border-b text-[11px] font-mono outline-none"
              style={{ borderColor: "#C5A059", color: "#E8E6E0" }}
            />
          ) : (
            <span className="flex-1 truncate text-[11px] font-mono" style={{ color: readonly ? "#7A7068" : undefined }}>
              {file.name}
            </span>
          )}

          {/* Readonly lock badge */}
          {readonly && (
            <span className="text-[8px] shrink-0" style={{ color: "#C5A05980" }} title="Protected by .HatchBlock">
              🔒
            </span>
          )}

          {/* Action buttons — hidden for readonly files */}
          {!readonly && (
            <div
              className="hidden group-hover:flex items-center gap-0.5 shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              {file.isDir && (
                <button
                  onClick={() => {
                    setNewEntry({ parent: file.path, type: "file" });
                    setExpanded((e) => { const n = new Set(e); n.add(file.path); return n; });
                  }}
                  className="w-4 h-4 flex items-center justify-center rounded text-[10px] transition-colors"
                  style={{ color: "#555550" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#C5A059")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "#555550")}
                  title="New file"
                >
                  +
                </button>
              )}
              <button
                onClick={() => { setRenaming(file.path); setRenameVal(file.name); }}
                className="w-4 h-4 flex items-center justify-center rounded text-[9px] transition-colors"
                style={{ color: "#555550" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#C5A059")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "#555550")}
                title="Rename"
              >
                ✎
              </button>
              <button
                onClick={(e) => doDelete(file.path, e)}
                className="w-4 h-4 flex items-center justify-center rounded text-[9px] transition-colors"
                style={{ color: "#555550" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#E06C6C")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "#555550")}
                title="Delete"
              >
                ✕
              </button>
            </div>
          )}
        </div>

        {/* Inline new-file input inside dir */}
        {newEntry?.parent === file.path && file.isDir && (
          <div style={{ paddingLeft: `${6 + (depth + 1) * 12 + 10 + 6}px`, paddingRight: "8px", marginBottom: "2px" }}>
            <input
              autoFocus
              placeholder={newEntry.type === "file" ? "filename.js" : "folder-name"}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onBlur={doCreate}
              onKeyDown={(e) => {
                if (e.key === "Enter") doCreate();
                if (e.key === "Escape") { setNewEntry(null); setNewName(""); }
              }}
              className="w-full text-[11px] font-mono border-b outline-none py-0.5"
              style={{ background: "transparent", borderColor: "#C5A059", color: "#E8E6E0" }}
            />
          </div>
        )}

        {/* Children */}
        <AnimatePresence>
          {file.isDir && isExpanded && children && children.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="overflow-hidden"
            >
              {children.map(renderNode)}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col" style={{ background: "#0D0D0B" }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-2.5 shrink-0 border-b"
        style={{ height: 30, borderColor: "#1A1A18" }}
      >
        <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: "#333330" }}>
          Files
        </span>
        <div className="flex gap-1">
          <button
            onClick={() => setNewEntry({ parent: "/", type: "file" })}
            className="w-5 h-5 flex items-center justify-center rounded text-[12px] transition-colors"
            style={{ color: "#555550" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#C5A059")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#555550")}
            title="New file"
          >
            +
          </button>
          <button
            onClick={refresh}
            className="w-5 h-5 flex items-center justify-center rounded text-[10px] transition-colors"
            style={{ color: "#555550" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#C5A059")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#555550")}
            title="Refresh"
          >
            ↺
          </button>
        </div>
      </div>

      {/* Root new file input */}
      {newEntry?.parent === "/" && (
        <div className="px-3 py-1 border-b" style={{ borderColor: "#1A1A18" }}>
          <input
            autoFocus
            placeholder={newEntry.type === "file" ? "filename.js" : "folder"}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onBlur={doCreate}
            onKeyDown={(e) => {
              if (e.key === "Enter") doCreate();
              if (e.key === "Escape") { setNewEntry(null); setNewName(""); }
            }}
            className="w-full text-[11px] font-mono border-b outline-none py-0.5"
            style={{ background: "transparent", borderColor: "#C5A059", color: "#E8E6E0" }}
          />
        </div>
      )}

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1" style={{ scrollbarWidth: "none" }}>
        {files.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <p className="text-[10px] leading-relaxed" style={{ color: "#333330" }}>
              No files yet.
              <br />Upload a ZIP or press <span style={{ color: "#C5A059" }}>+</span> to create one.
            </p>
          </div>
        ) : (
          nodes.map(renderNode)
        )}
      </div>
    </div>
  );
}
