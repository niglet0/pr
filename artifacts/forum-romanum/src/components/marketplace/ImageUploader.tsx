import React, { useRef, useState, useEffect } from "react";
import { supabase } from "../../integrations/supabase/client";
import { Icon, cn } from "../UI";
import { toast } from "sonner";

type Aspect = "square" | "wide" | "banner" | "free";

type Props = {
  bucket?: string;
  pathPrefix?: string;
  existingUrl?: string | null;
  onUploaded: (publicUrl: string) => void;
  onClear?: () => void;
  aspect?: Aspect;
  label?: string;
  maxMB?: number;
  className?: string;
};

const ASPECT_CLASS: Record<Aspect, string> = {
  square: "aspect-square",
  wide:   "aspect-video",
  banner: "aspect-[3/1]",
  free:   "h-32",
};

export function ImageUploader({
  bucket = "forum-media",
  pathPrefix = "uploads",
  existingUrl,
  onUploaded,
  onClear,
  aspect = "free",
  label = "Upload image",
  maxMB = 10,
  className,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(existingUrl || null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    setPreview(existingUrl || null);
  }, [existingUrl]);

  const uploadFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Only image files are supported");
      return;
    }
    if (file.size > maxMB * 1024 * 1024) {
      toast.error(`Image must be under ${maxMB} MB`);
      return;
    }
    const local = URL.createObjectURL(file);
    setPreview(local);
    setUploading(true);
    setProgress(25);

    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${pathPrefix}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;

    setProgress(50);
    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, file, { contentType: file.type, upsert: false });

    setProgress(85);
    if (error) {
      setUploading(false);
      setProgress(0);
      setPreview(existingUrl || null);
      toast.error(error.message);
      return;
    }

    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);
    setProgress(100);
    setTimeout(() => {
      setUploading(false);
      setProgress(0);
    }, 300);

    if (urlData?.publicUrl) {
      onUploaded(urlData.publicUrl);
      toast.success("Uploaded");
    } else {
      toast.error("Upload succeeded but URL generation failed");
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  };

  const clear = () => {
    setPreview(null);
    onClear?.();
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className={cn("relative", className)}>
      <div
        className={cn(
          "relative rounded-2xl overflow-hidden border-2 transition-all",
          ASPECT_CLASS[aspect],
          dragging
            ? "border-[#0A84FF] bg-[#0A84FF]/5"
            : preview
            ? "border-transparent"
            : "border-dashed border-black/10 bg-[#F5F5F7]",
        )}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        {preview ? (
          <>
            <img
              src={preview}
              alt=""
              className="w-full h-full object-cover"
            />
            {!uploading && (
              <>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="absolute bottom-2 right-2 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-sm text-[11.5px] font-semibold text-white hover:bg-black/70 transition-colors"
                >
                  <Icon name="Camera" size={11} />
                  Change
                </button>
                {onClear && (
                  <button
                    type="button"
                    onClick={clear}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/70 transition-colors"
                  >
                    <Icon name="X" size={13} />
                  </button>
                )}
              </>
            )}
          </>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full h-full flex flex-col items-center justify-center gap-2 p-4"
          >
            <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm">
              <Icon name="ImagePlus" size={18} color="#0A84FF" />
            </div>
            <div className="text-center">
              <p className="text-[13px] font-semibold text-[#1D1D1F] tracking-tight">
                {label}
              </p>
              <p className="text-[11px] text-[#86868B] tracking-tight mt-0.5">
                Drag & drop or tap · JPG PNG WEBP · Max {maxMB} MB
              </p>
            </div>
          </button>
        )}

        {uploading && (
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex flex-col items-center justify-center gap-2">
            <div className="w-3/4 h-1.5 rounded-full bg-white/20 overflow-hidden">
              <div
                className="h-full bg-white rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-[11.5px] text-white font-semibold tracking-tight">
              Uploading… {progress}%
            </p>
          </div>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );
}
