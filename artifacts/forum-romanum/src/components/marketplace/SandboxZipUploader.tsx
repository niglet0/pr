import { useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  value: string;
  onChange: (url: string) => void;
  userId?: string;
  pathPrefix?: string;
  label?: string;
  hint?: string;
}

const MAX_SIZE_MB = 50;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;
const BUCKET = "sandbox-zips";

type UploadState =
  | { status: "idle" }
  | { status: "dragging" }
  | { status: "uploading"; progress: number; name: string; sizeMB: string }
  | { status: "done"; name: string; sizeMB: string; url: string }
  | { status: "error"; message: string };

export default function SandboxZipUploader({
  value,
  onChange,
  userId,
  pathPrefix = "uploads",
  label = "⚡ Forge sandbox",
  hint = "Users can run your project live in the browser",
}: Props) {
  const [state, setState] = useState<UploadState>({ status: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = useCallback(
    async (file: File) => {
      if (!file.name.endsWith(".zip")) {
        setState({ status: "error", message: "Only .zip files are accepted." });
        return;
      }
      if (file.size > MAX_SIZE_BYTES) {
        setState({ status: "error", message: `File exceeds ${MAX_SIZE_MB} MB limit.` });
        return;
      }

      const sizeMB = (file.size / 1024 / 1024).toFixed(1);
      setState({ status: "uploading", progress: 0, name: file.name, sizeMB });

      const uid = userId ?? "anon";
      const ts = Date.now();
      const storagePath = `${pathPrefix}/${uid}/${ts}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

      // Simulate progress ticks while upload runs
      const ticker = setInterval(() => {
        setState((prev) =>
          prev.status === "uploading" && prev.progress < 85
            ? { ...prev, progress: prev.progress + 12 }
            : prev
        );
      }, 300);

      try {
        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(storagePath, file, { upsert: true, contentType: "application/zip" });

        clearInterval(ticker);

        if (error) throw new Error(error.message);

        const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
        const publicUrl = urlData.publicUrl;

        setState({ status: "done", name: file.name, sizeMB, url: publicUrl });
        onChange(publicUrl);
      } catch (e: any) {
        clearInterval(ticker);
        setState({ status: "error", message: e.message ?? "Upload failed." });
      }
    },
    [userId, pathPrefix, onChange]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setState({ status: "idle" });
      const file = e.dataTransfer.files[0];
      if (file) upload(file);
    },
    [upload]
  );

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) upload(file);
    e.target.value = "";
  };

  const reset = () => {
    setState({ status: "idle" });
    onChange("");
  };

  const isDragging = state.status === "dragging";
  const isUploading = state.status === "uploading";
  const isDone = state.status === "done";
  const isError = state.status === "error";

  return (
    <div className="flex flex-col gap-1.5">
      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload project ZIP"
        onClick={() => !isUploading && inputRef.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && !isUploading && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setState({ status: "dragging" }); }}
        onDragLeave={() => setState((p) => p.status === "dragging" ? { status: "idle" } : p)}
        onDrop={onDrop}
        className="relative rounded-xl border transition-all select-none outline-none"
        style={{
          borderStyle: isDragging || isUploading ? "solid" : "dashed",
          borderColor: isDragging
            ? "var(--color-primary, #C5A059)"
            : isDone
            ? "#22c55e"
            : isError
            ? "#ef4444"
            : "#d4d0c8",
          background: isDragging
            ? "rgba(197,160,89,0.05)"
            : isDone
            ? "rgba(34,197,94,0.04)"
            : "#faf9f6",
          cursor: isUploading ? "default" : "pointer",
        }}
      >
        <div className="flex items-center gap-3 px-4 py-3.5">
          {/* Icon */}
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-[15px]"
            style={{
              background: isDone
                ? "rgba(34,197,94,0.12)"
                : isError
                ? "rgba(239,68,68,0.12)"
                : "rgba(197,160,89,0.12)",
            }}
          >
            {isDone ? "✓" : isError ? "✕" : isUploading ? "⏳" : "⇪"}
          </div>

          {/* Body */}
          <div className="flex-1 min-w-0">
            {state.status === "idle" && (
              <>
                <p className="text-[12px] font-semibold text-[#202020] leading-tight">
                  Drop .zip here{" "}
                  <span className="font-normal text-[#7A7A7A]">or</span>{" "}
                  <span
                    className="underline underline-offset-2"
                    style={{ color: "#C5A059" }}
                  >
                    browse
                  </span>
                </p>
                <p className="text-[10.5px] text-[#9A9A9A] mt-0.5">
                  Up to {MAX_SIZE_MB} MB · ZIP archive
                </p>
              </>
            )}

            {state.status === "dragging" && (
              <p className="text-[12px] font-semibold" style={{ color: "#C5A059" }}>
                Release to upload
              </p>
            )}

            {state.status === "uploading" && (
              <>
                <p className="text-[11.5px] font-semibold text-[#202020] truncate">
                  {state.name}
                </p>
                <div className="mt-1.5 h-1 rounded-full bg-[#E5E3DB] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${state.progress}%`,
                      background: "#C5A059",
                    }}
                  />
                </div>
                <p className="text-[10px] text-[#9A9A9A] mt-1">{state.progress}% · {state.sizeMB} MB</p>
              </>
            )}

            {state.status === "done" && (
              <>
                <p className="text-[11.5px] font-semibold text-[#202020] truncate">
                  {state.name}
                </p>
                <p className="text-[10px] text-[#9A9A9A] mt-0.5">{state.sizeMB} MB · ready</p>
              </>
            )}

            {state.status === "error" && (
              <>
                <p className="text-[11.5px] font-semibold text-[#ef4444]">Upload failed</p>
                <p className="text-[10px] text-[#9A9A9A] mt-0.5 truncate">{state.message}</p>
              </>
            )}
          </div>

          {/* Actions */}
          {(isDone || isError) && (
            <button
              onClick={(e) => { e.stopPropagation(); reset(); }}
              className="shrink-0 text-[10px] font-semibold text-[#9A9A9A] hover:text-[#202020] transition-colors px-2 py-1 rounded-lg"
              style={{ background: "rgba(0,0,0,0.04)" }}
            >
              {isDone ? "Replace" : "Retry"}
            </button>
          )}
        </div>

        {/* Existing URL indicator */}
        {value && isDone && (
          <div
            className="mx-4 mb-3 px-2.5 py-1.5 rounded-lg flex items-center gap-2"
            style={{ background: "rgba(0,0,0,0.03)", border: "1px solid #E5E3DB" }}
          >
            <span className="text-[10px] text-[#9A9A9A] truncate flex-1 font-mono">{value}</span>
            <button
              onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(value); }}
              className="shrink-0 text-[10px] text-[#B0ADA5] hover:text-[#202020] transition-colors"
              title="Copy URL"
            >
              ⧉
            </button>
          </div>
        )}
      </div>

      {/* Fallback: manual URL input */}
      {(state.status === "idle" || state.status === "error") && (
        <div className="flex items-center gap-2">
          <div className="h-px flex-1 bg-[#E5E3DB]" />
          <span className="text-[9.5px] text-[#B0ADA5] font-medium uppercase tracking-widest">or paste URL</span>
          <div className="h-px flex-1 bg-[#E5E3DB]" />
        </div>
      )}
      {(state.status === "idle" || state.status === "error") && (
        <input
          type="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://cdn.example.com/project.zip"
          className="input text-[12px]"
          style={{ fontFamily: "monospace" }}
        />
      )}

      {hint && (
        <p className="text-[10.5px] text-[#9A9A9A] px-0.5">{hint}</p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept=".zip,application/zip"
        className="hidden"
        onChange={onInputChange}
      />
    </div>
  );
}
