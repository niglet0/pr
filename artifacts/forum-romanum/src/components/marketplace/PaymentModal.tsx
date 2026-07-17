import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { supabase } from "../../integrations/supabase/client";
import { Avatar, Button, Icon } from "../UI";
import { toast } from "sonner";

type Props = {
  listing: any;
  seller: any;
  overrideAmountCents?: number;
  overrideLabel?: string;
  currentUser: any;
  onClose: () => void;
  onSuccess: () => void;
};

export function PaymentModal({
  listing,
  seller,
  overrideAmountCents,
  overrideLabel,
  currentUser,
  onClose,
  onSuccess,
}: Props) {
  const [processing, setProcessing] = useState(false);
  const [done, setDone] = useState(false);

  const amtCents =
    overrideAmountCents ??
    (listing.pricing_model === "rent"
      ? listing.rent_price_cents || 0
      : listing.pricing_model === "subscription"
        ? listing.subscription_price_cents || 0
        : listing.price_cents || 0);

  const isFree = amtCents === 0 || listing.pricing_model === "free" || listing.pricing_model === "open_source";

  const fmtCents = (c: number) => {
    if (c === 0) return "Free";
    const v = c / 100;
    if (v >= 1000) return `$${(v / 1000).toFixed(1)}k`;
    return `$${v.toFixed(2)}`;
  };

  const confirm = async () => {
    setProcessing(true);
    const { error } = await supabase.from("listing_orders").insert({
      listing_id: listing.id,
      buyer_id: currentUser.id,
      seller_id: listing.seller_id,
      amount_cents: amtCents,
      currency: listing.currency || "USD",
      order_type: listing.pricing_model,
      status: isFree ? "completed" : "pending",
    });
    setProcessing(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setDone(true);
    setTimeout(() => {
      onSuccess();
      onClose();
    }, 1800);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-[200] flex items-end justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full bg-[#F5F5F7] rounded-t-3xl p-6 pb-10 space-y-5"
      >
        <AnimatePresence mode="wait">
          {done ? (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center py-4 gap-3"
            >
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
                <Icon name="CheckCircle2" size={32} color="#16a34a" />
              </div>
              <p className="text-[18px] font-bold tracking-tight text-[#1D1D1F] text-center">
                {isFree ? "Acquired!" : "Order Placed!"}
              </p>
              <p className="text-[13px] text-[#86868B] text-center tracking-tight">
                {isFree
                  ? "You can now access the files."
                  : "The seller will be notified and will fulfill your order."}
              </p>
            </motion.div>
          ) : (
            <motion.div key="form" className="space-y-5">
              {/* Header */}
              <div className="flex items-center justify-between">
                <h2 className="text-[18px] font-bold tracking-tight text-[#1D1D1F]">
                  {isFree ? "Confirm Download" : "Confirm Order"}
                </h2>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-full bg-[#E8E8ED] flex items-center justify-center"
                >
                  <Icon name="X" size={15} />
                </button>
              </div>

              {/* Listing summary */}
              <div className="flex gap-3 p-3 rounded-2xl bg-white border border-black/[0.05]">
                <div className="w-14 h-14 rounded-xl bg-[#F5F5F7] overflow-hidden shrink-0">
                  {listing.cover_url ? (
                    <img src={listing.cover_url} alt={listing.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[#86868B]">
                      <Icon name="Package" size={20} />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold tracking-tight text-[#1D1D1F] truncate">{listing.title}</p>
                  {seller && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <Avatar src={seller.avatar_url} seed={seller.id} size={16} />
                      <p className="text-[12px] text-[#86868B] tracking-tight">
                        {seller.display_name || seller.handle || "Seller"}
                      </p>
                    </div>
                  )}
                  {overrideLabel && (
                    <p className="text-[11px] font-medium text-[#0A84FF] tracking-tight mt-0.5">{overrideLabel} package</p>
                  )}
                </div>
              </div>

              {/* Price breakdown */}
              <div className="space-y-2">
                <div className="flex justify-between items-center px-1">
                  <span className="text-[14px] text-[#86868B] tracking-tight">Total</span>
                  <span className="text-[18px] font-bold tracking-tight text-[#1D1D1F]">{fmtCents(amtCents)}</span>
                </div>
                {!isFree && (
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200/60 flex gap-2 items-start">
                    <Icon name="Info" size={13} color="#92400e" className="mt-0.5 shrink-0" />
                    <p className="text-[12px] text-amber-900 tracking-tight leading-snug">
                      Payment is handled directly between buyer and seller. Your order will be marked <strong>pending</strong> until the seller confirms receipt.
                    </p>
                  </div>
                )}
              </div>

              {/* CTA */}
              <Button onClick={confirm} disabled={processing} className="w-full">
                <Icon name={isFree ? "Download" : "ShoppingCart"} size={14} />
                {processing ? "Processing…" : isFree ? "Download for free" : `Place order · ${fmtCents(amtCents)}`}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
