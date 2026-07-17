import React, { useEffect, useState } from "react";
import { supabase } from "../../integrations/supabase/client";
import { Button, Icon, cn } from "../UI";
import { toast } from "sonner";

type Package = {
  id: string;
  listing_id: string;
  name: string;
  description?: string;
  price_cents: number;
  delivery_days: number;
  revisions: number;
  features?: string[];
  sort_order: number;
};

type Props = {
  listingId: string;
  sellerId: string;
  currentUser?: any;
  onSelect?: (pkg: Package) => void;
};

const fmtCents = (c: number) => {
  if (c === 0) return "Free";
  const v = c / 100;
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}k`;
  return `$${v.toFixed(0)}`;
};

const TIER_COLORS = ["#0A84FF", "#34C759", "#FF9F0A"];
const TIER_BG = ["#EAF3FF", "#EDFAF3", "#FFF5E6"];

export function ServicePackages({ listingId, sellerId, currentUser, onSelect }: Props) {
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    name: "",
    description: "",
    price: "",
    delivery_days: "7",
    revisions: "2",
    features: "",
  });

  const isSeller = currentUser?.id === sellerId;

  const fetchPackages = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("service_packages")
      .select("*")
      .eq("listing_id", listingId)
      .order("sort_order");
    setPackages(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchPackages();
  }, [listingId]);

  const addPackage = async () => {
    if (!form.name.trim()) return void toast.error("Package name required");
    setSubmitting(true);
    const { error } = await supabase.from("service_packages").insert({
      listing_id: listingId,
      name: form.name.trim(),
      description: form.description.trim() || null,
      price_cents: Math.round((parseFloat(form.price) || 0) * 100),
      delivery_days: parseInt(form.delivery_days) || 7,
      revisions: parseInt(form.revisions) || 1,
      features: form.features
        ? form.features.split("\n").map((f) => f.trim()).filter(Boolean)
        : [],
      sort_order: packages.length,
    });
    setSubmitting(false);
    if (error) toast.error(error.message);
    else {
      setAdding(false);
      setForm({ name: "", description: "", price: "", delivery_days: "7", revisions: "2", features: "" });
      fetchPackages();
      toast.success("Package added");
    }
  };

  const deletePackage = async (id: string) => {
    await supabase.from("service_packages").delete().eq("id", id);
    fetchPackages();
    toast.success("Package removed");
  };

  if (loading) {
    return (
      <div className="flex gap-3 overflow-x-auto -mx-1 px-1 pb-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="w-52 shrink-0 h-52 rounded-2xl bg-[#F5F5F7] animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Package cards */}
      {packages.length > 0 && (
        <div className="flex gap-3 overflow-x-auto -mx-1 px-1 pb-1 no-scrollbar">
          {packages.map((pkg, idx) => {
            const color = TIER_COLORS[idx % TIER_COLORS.length];
            const bg = TIER_BG[idx % TIER_BG.length];
            const isSelected = selected === pkg.id;

            return (
              <div
                key={pkg.id}
                onClick={() => {
                  setSelected(pkg.id);
                  onSelect?.(pkg);
                }}
                className={cn(
                  "w-52 shrink-0 rounded-2xl border-2 p-4 cursor-pointer transition-all tap-scale",
                  isSelected ? "border-current shadow-lg" : "border-transparent bg-white border-black/[0.05]",
                )}
                style={isSelected ? { borderColor: color } : {}}
              >
                {/* Tier badge */}
                <div
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold tracking-tight mb-3"
                  style={{ color, background: bg }}
                >
                  <Icon
                    name={idx === 0 ? "Layers" : idx === 1 ? "Zap" : "Crown"}
                    size={10}
                    color={color}
                  />
                  {pkg.name}
                </div>

                {/* Price */}
                <div className="text-[28px] font-bold tracking-tight text-[#1D1D1F] leading-none">
                  {fmtCents(pkg.price_cents)}
                </div>

                {pkg.description && (
                  <p className="text-[12px] text-[#86868B] tracking-tight mt-2 leading-snug line-clamp-2">
                    {pkg.description}
                  </p>
                )}

                {/* Meta */}
                <div className="flex gap-3 mt-3">
                  <div className="flex items-center gap-1 text-[11px] text-[#86868B] font-medium">
                    <Icon name="Clock" size={11} />
                    {pkg.delivery_days}d
                  </div>
                  <div className="flex items-center gap-1 text-[11px] text-[#86868B] font-medium">
                    <Icon name="RefreshCw" size={11} />
                    {pkg.revisions}x
                  </div>
                </div>

                {/* Features */}
                {pkg.features && pkg.features.length > 0 && (
                  <ul className="mt-3 space-y-1.5">
                    {pkg.features.map((f, fi) => (
                      <li key={fi} className="flex items-start gap-1.5 text-[12px] text-[#1D1D1F] tracking-tight">
                        <Icon name="Check" size={11} color={color} className="mt-0.5 shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                )}

                {/* Select indicator */}
                {isSelected && (
                  <div
                    className="mt-4 py-1.5 rounded-xl text-center text-[12px] font-bold tracking-tight text-white"
                    style={{ background: color }}
                  >
                    Selected
                  </div>
                )}

                {/* Seller delete */}
                {isSeller && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deletePackage(pkg.id);
                    }}
                    className="mt-2 w-full flex items-center justify-center gap-1 text-[11px] text-[#FF3B30] font-medium"
                  >
                    <Icon name="Trash2" size={10} />
                    Remove
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Seller add form */}
      {isSeller && (
        <div>
          {!adding ? (
            <Button size="sm" variant="outline" onClick={() => setAdding(true)} className="w-full">
              <Icon name="Plus" size={13} />
              Add package
            </Button>
          ) : (
            <div className="p-3.5 rounded-2xl bg-white border border-black/[0.05] space-y-2.5">
              <p className="text-[13px] font-semibold text-[#1D1D1F] tracking-tight">New package</p>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Basic, Standard, Premium"
                className="w-full text-[13px] bg-[#F5F5F7] rounded-xl px-3 py-2 outline-none focus:ring-1 focus:ring-black/10 tracking-tight"
              />
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
                placeholder="Short description"
                className="w-full text-[13px] bg-[#F5F5F7] rounded-xl px-3 py-2 outline-none focus:ring-1 focus:ring-black/10 tracking-tight resize-none"
              />
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10.5px] font-medium text-[#86868B] tracking-tight block mb-1">
                    Price ($)
                  </label>
                  <input
                    type="number"
                    value={form.price}
                    onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                    placeholder="99"
                    className="w-full text-[12px] bg-[#F5F5F7] rounded-xl px-2.5 py-2 outline-none tracking-tight"
                  />
                </div>
                <div>
                  <label className="text-[10.5px] font-medium text-[#86868B] tracking-tight block mb-1">
                    Days
                  </label>
                  <input
                    type="number"
                    value={form.delivery_days}
                    onChange={(e) => setForm((f) => ({ ...f, delivery_days: e.target.value }))}
                    className="w-full text-[12px] bg-[#F5F5F7] rounded-xl px-2.5 py-2 outline-none tracking-tight"
                  />
                </div>
                <div>
                  <label className="text-[10.5px] font-medium text-[#86868B] tracking-tight block mb-1">
                    Revisions
                  </label>
                  <input
                    type="number"
                    value={form.revisions}
                    onChange={(e) => setForm((f) => ({ ...f, revisions: e.target.value }))}
                    className="w-full text-[12px] bg-[#F5F5F7] rounded-xl px-2.5 py-2 outline-none tracking-tight"
                  />
                </div>
              </div>
              <textarea
                value={form.features}
                onChange={(e) => setForm((f) => ({ ...f, features: e.target.value }))}
                rows={3}
                placeholder={"One feature per line:\nCustom design\nSource files\nPriority support"}
                className="w-full text-[13px] bg-[#F5F5F7] rounded-xl px-3 py-2 outline-none focus:ring-1 focus:ring-black/10 tracking-tight resize-none"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={addPackage} disabled={submitting}>
                  {submitting ? "Adding…" : "Save package"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setAdding(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {packages.length === 0 && !isSeller && (
        <p className="text-[13px] text-[#86868B] text-center py-4 tracking-tight">
          No packages configured yet.
        </p>
      )}
    </div>
  );
}
