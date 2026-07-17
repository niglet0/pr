import { useEffect, useRef } from "react";
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection } from "@codemirror/view";
import { EditorState, Compartment } from "@codemirror/state";
import { defaultKeymap, historyKeymap, history, indentWithTab } from "@codemirror/commands";
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching, foldGutter, indentOnInput } from "@codemirror/language";
import { oneDark } from "@codemirror/theme-one-dark";
import { javascript } from "@codemirror/lang-javascript";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { python } from "@codemirror/lang-python";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";

interface Props {
  path: string;
  content: string;
  onChange: (newContent: string) => void;
  readOnly?: boolean;
}

const langComp = new Compartment();
const readOnlyComp = new Compartment();

function langForPath(path: string) {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "js":
    case "jsx":
    case "ts":
    case "tsx":
    case "mjs":
    case "cjs":
      return javascript({ jsx: true, typescript: ext === "ts" || ext === "tsx" });
    case "html":
    case "htm":
      return html();
    case "css":
    case "scss":
    case "less":
      return css();
    case "py":
      return python();
    case "json":
      return json();
    case "md":
    case "mdx":
      return markdown();
    default:
      return javascript();
  }
}

// Custom theme overrides to blend with Hatch palette
const forgeTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "13px",
    background: "#111110",
  },
  ".cm-scroller": {
    fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", "Courier New", monospace',
    lineHeight: "1.6",
    overflow: "auto",
  },
  ".cm-content": {
    caretColor: "#C5A059",
    padding: "12px 0",
  },
  ".cm-cursor": {
    borderLeftColor: "#C5A059",
    borderLeftWidth: "2px",
  },
  ".cm-focused .cm-cursor": {
    borderLeftColor: "#C5A059",
  },
  ".cm-activeLine": {
    backgroundColor: "#C5A05908",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "#C5A05912",
    color: "#C5A059",
  },
  ".cm-gutters": {
    background: "#0E0E0C",
    color: "#555550",
    borderRight: "1px solid #2A2A28",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    padding: "0 8px 0 6px",
    minWidth: "36px",
  },
  ".cm-selectionBackground": {
    background: "#C5A05930 !important",
  },
  "&.cm-focused .cm-selectionBackground": {
    background: "#C5A05940 !important",
  },
  ".cm-foldGutter": {
    width: "16px",
  },
}, { dark: true });

const readOnlyTheme = EditorView.theme({
  "&": { opacity: "0.85" },
  ".cm-content": { cursor: "default" },
});

export default function EditorPanel({ path, content, onChange, readOnly = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const pathRef = useRef(path);

  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: content,
      extensions: [
        history(),
        lineNumbers(),
        foldGutter(),
        drawSelection(),
        indentOnInput(),
        bracketMatching(),
        highlightActiveLine(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        langComp.of(langForPath(path)),
        readOnlyComp.of([
          EditorState.readOnly.of(readOnly),
          ...(readOnly ? [readOnlyTheme] : []),
        ]),
        oneDark,
        forgeTheme,
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
        EditorView.theme({
          ".cm-editor": { outline: "none" },
        }),
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update language when path changes
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: langComp.reconfigure(langForPath(path)) });
  }, [path]);

  // Update readOnly when it changes
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: readOnlyComp.reconfigure([
        EditorState.readOnly.of(readOnly),
        ...(readOnly ? [readOnlyTheme] : []),
      ]),
    });
  }, [readOnly]);

  // Update content when file changes (path change or external update)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const pathChanged = pathRef.current !== path;
    pathRef.current = path;

    if (pathChanged) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: content },
        effects: langComp.reconfigure(langForPath(path)),
      });
    } else {
      const currentDoc = view.state.doc.toString();
      if (currentDoc !== content) {
        const sel = view.state.selection;
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: content },
          selection: sel,
        });
      }
    }
  }, [path, content]);

  return (
    <div className="relative w-full h-full overflow-hidden">
      {readOnly && (
        <div
          className="absolute top-0 left-0 right-0 z-10 flex items-center gap-1.5 px-3 py-1 text-[10px] font-mono"
          style={{ background: "#1A1510", color: "#C5A059", borderBottom: "1px solid #2A2015" }}
        >
          <span>🔒</span>
          <span>Read-only — protected by .HatchBlock</span>
        </div>
      )}
      <div ref={containerRef} className="w-full h-full overflow-hidden" style={readOnly ? { paddingTop: 24 } : {}} />
    </div>
  );
}
