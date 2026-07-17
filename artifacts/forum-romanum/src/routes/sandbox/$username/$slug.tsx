import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { z } from "zod";
import SandboxIDE from "../../../components/sandbox/SandboxIDE";
import { supabase } from "../../../integrations/supabase/client";

const searchSchema = z.object({
  zip: z.string().optional(),
});

export const Route = createFileRoute("/sandbox/$username/$slug")({
  ssr: false,
  validateSearch: searchSchema,
  component: SandboxPage,
});

interface Product {
  title: string | null;
  zip_url: string;
  listing_url: string | null;
  description: string | null;
}

function SandboxPage() {
  const { username, slug } = Route.useParams();
  const { zip: zipOverride } = Route.useSearch();
  const [open, setOpen] = useState(true);
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Strip leading @ from username if present
  const cleanUsername = username.startsWith("@") ? username.slice(1) : username;
  const namespace = `sandbox-${cleanUsername}-${slug}`;

  useEffect(() => {
    if (zipOverride) {
      // Query-param override — no DB lookup needed
      setProduct({
        title: slug,
        zip_url: zipOverride,
        listing_url: null,
        description: null,
      });
      setLoading(false);
      return;
    }

    // Look up product in Supabase sandbox_products table
    (async () => {
      const { data, error } = await supabase
        .from("sandbox_products")
        .select("title, zip_url, listing_url, description")
        .eq("seller_username", cleanUsername)
        .eq("slug", slug)
        .maybeSingle();

      if (error || !data) {
        setNotFound(true);
      } else {
        setProduct(data as Product);
      }
      setLoading(false);
    })();
  }, [cleanUsername, slug, zipOverride]);

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: "#0D0D0B" }}>
        <span className="text-[#555550] text-[11px] font-mono animate-pulse">Loading sandbox…</span>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-4" style={{ background: "#0D0D0B" }}>
        <div className="text-[#C5A059] font-mono font-black text-[18px]">⚡ Hatch Sandbox</div>
        <p className="text-[#555550] text-[12px] font-mono">
          No sandbox found for <span style={{ color: "#E8E6E0" }}>@{cleanUsername}/{slug}</span>
        </p>
        <a
          href="/"
          className="text-[10px] font-mono px-3 py-1.5 rounded-lg transition-colors"
          style={{ background: "#1A1A18", color: "#C5A059" }}
        >
          ← Back to Hatch
        </a>
      </div>
    );
  }

  return (
    <div className="fixed inset-0" style={{ background: "#0D0D0B" }}>
      <SandboxIDE
        open={open}
        onClose={() => {
          // Navigate back rather than closing into a blank screen
          if (window.history.length > 1) {
            window.history.back();
          } else {
            window.location.href = "/";
          }
          setOpen(false);
        }}
        namespace={namespace}
        title={product?.title ?? slug}
        sellerUsername={cleanUsername}
        projectSlug={slug}
        listingUrl={product?.listing_url ?? undefined}
        initialZipUrl={product?.zip_url}
      />
      {!open && (
        <div className="flex min-h-screen items-center justify-center" style={{ background: "#0D0D0B" }}>
          <a href="/" className="text-[11px] font-mono" style={{ color: "#C5A059" }}>
            ← Back to Hatch
          </a>
        </div>
      )}
    </div>
  );
}
