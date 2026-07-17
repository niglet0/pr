import React from "react";
import { Card, Icon } from "./UI";
import SandboxIDE from "./sandbox/SandboxIDE";

type Props = {
  listing: {
    id: string;
    title: string;
    cover_url?: string | null;
    price_cents: number;
    kind?: string | null;
    rating?: number | null;
    reviews_count?: number | null;
    purchases_count?: number | null;
    seller_name?: string | null;
    seller_avatar?: string | null;
    summary?: string | null;
    sandbox_zip_url?: string | null;
  };
  onView?: (id: string) => void;
  compact?: boolean;
};

function ForgeButton({ listing }: { listing: Props["listing"] }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-colors"
        style={{
          color: "#C5A059",
          background: "rgba(197,160,89,0.08)",
          border: "1px solid rgba(197,160,89,0.3)",
        }}
        onMouseEnter={e => (e.currentTarget.style.background = "rgba(197,160,89,0.15)")}
        onMouseLeave={e => (e.currentTarget.style.background = "rgba(197,160,89,0.08)")}
      >
        ⚡ Try in Forge
      </button>
      <React.Suspense fallback={null}>
        <SandboxIDE
          open={open}
          onClose={() => setOpen(false)}
          namespace={`listing-${listing.id}`}
          initialZipUrl={listing.sandbox_zip_url ?? undefined}
          title={listing.title}
        />
      </React.Suspense>
    </>
  );
}

export function ProductCard({ listing: l, onView, compact = false }: Props) {
  if (compact) {
    return (
      <div
        onClick={() => onView?.(l.id)}
        className="flex items-center gap-3 p-2.5 bg-white border border-[#E5E3DB] rounded-2xl cursor-pointer hover:border-[#C5A059]/40 hover:shadow-sm transition-all max-w-[320px]"
      >
        <div className="w-12 h-12 rounded-xl bg-[#F3F1EC] shrink-0 overflow-hidden flex items-center justify-center">
          {l.cover_url
            ? <img src={l.cover_url} alt={l.title} className="w-full h-full object-cover" />
            : <Icon name="Package" size={20} className="text-[#C5A059]/40" />
          }
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-[13px] text-[#202020] truncate">{l.title}</p>
          {l.seller_name && (
            <p className="text-[10px] text-[#7A7A7A] truncate">by {l.seller_name}</p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="font-black text-[#C5A059] text-[14px]">${((l.price_cents || 0) / 100).toFixed(2)}</p>
          {l.kind && (
            <p className="text-[9px] uppercase tracking-wider text-[#7A7A7A]">{l.kind}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <Card
      className="p-0 overflow-hidden rounded-2xl cursor-pointer hover:shadow-md transition-shadow border-[#E5E3DB]"
      onClick={() => onView?.(l.id)}
    >
      {l.cover_url && (
        <div className="w-full h-[160px] bg-[#F3F1EC] overflow-hidden">
          <img src={l.cover_url} alt={l.title} className="w-full h-full object-cover" />
        </div>
      )}
      {!l.cover_url && (
        <div className="w-full h-[80px] bg-gradient-to-br from-[#C5A059]/10 to-[#8B5CF6]/10 flex items-center justify-center">
          <Icon name="Package" size={32} className="text-[#C5A059]/30" />
        </div>
      )}
      <div className="p-3">
        <div className="flex items-start justify-between gap-2 mb-1">
          <p className="font-bold text-[14px] text-[#202020] leading-snug line-clamp-2 flex-1">{l.title}</p>
          {l.kind && (
            <span className="text-[9px] font-bold uppercase tracking-wider bg-[#F3F1EC] text-[#7A7A7A] px-1.5 py-0.5 rounded-full shrink-0">
              {l.kind}
            </span>
          )}
        </div>
        {l.summary && (
          <p className="text-[11px] text-[#7A7A7A] line-clamp-2 mb-2">{l.summary}</p>
        )}
        {l.seller_name && (
          <p className="text-[11px] text-[#7A7A7A] mb-2">by <span className="font-bold text-[#202020]">{l.seller_name}</span></p>
        )}
        <div className="flex items-center justify-between mt-1">
          <p className="text-[18px] font-black text-[#C5A059]">${((l.price_cents || 0) / 100).toFixed(2)}</p>
          <div className="flex items-center gap-3 text-[10px] text-[#7A7A7A]">
            {l.rating && (
              <span className="flex items-center gap-0.5 font-bold">
                <Icon name="Star" size={11} className="text-[#C5A059]" />
                {l.rating.toFixed(1)}
                {l.reviews_count ? ` (${l.reviews_count})` : ""}
              </span>
            )}
            {l.purchases_count != null && (
              <span className="flex items-center gap-0.5">
                <Icon name="Download" size={10} />
                {l.purchases_count}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="px-3 pb-3 flex gap-2">
        <button
          onClick={(e) => { e.stopPropagation(); onView?.(l.id); }}
          className="flex-1 py-2 rounded-xl bg-[#C5A059] text-white text-[11px] font-bold uppercase tracking-wider hover:bg-[#B8923E] transition-colors"
        >
          View Product
        </button>
        {l.sandbox_zip_url && <ForgeButton listing={l} />}
      </div>
    </Card>
  );
}
