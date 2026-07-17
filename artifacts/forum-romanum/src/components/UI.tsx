import React from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { motion } from "motion/react";
import * as Lucide from "lucide-react";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const C = {
  bg: "#FAF9F6",
  s1: "#FFFFFF",
  s2: "#F3F1EC",
  border: "#E5E3DB",
  accent: "#C5A059",
  gold: "#D4AF37",
  dark: "#8C6A32",
  text: "#202020",
  muted: "#7A7A7A",
  dim: "rgba(0,0,0,0.03)",
  green: "#10B981",
  red: "#EF4444",
  blue: "#3B82F6",
  purple: "#8B5CF6",
};

export const Icon = ({
  name,
  size = 24,
  className,
  color = "currentColor",
}: {
  name: keyof typeof Lucide;
  size?: number;
  className?: string;
  color?: string;
}) => {
  const LucideIcon = Lucide[name] as React.FC<any>;
  if (!LucideIcon) return null;
  return <LucideIcon size={size} className={className} color={color} strokeWidth={2} />;
};

export const Avatar = ({
  src,
  seed,
  size = 42,
  online,
  ring,
  className,
}: {
  src?: string;
  seed?: string | number;
  size?: number;
  online?: boolean;
  ring?: boolean;
  className?: string;
}) => (
  <div className={cn("relative flex-shrink-0", className)} style={{ width: size, height: size }}>
    <img
      src={src || `https://picsum.photos/seed/spqr${seed || "avatar"}/${size * 2}/${size * 2}`}
      alt="avatar"
      className={cn(
        "rounded-full object-cover",
        ring ? "border-2 border-[#C5A059]" : "border border-[#E5E3DB]"
      )}
      style={{ width: size, height: size }}
    />
    {online && (
      <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-[#10B981] border-2 border-white" />
    )}
  </div>
);

export const Button = ({
  children,
  onClick,
  variant = "gold",
  size = "md",
  className,
  type = "button",
  disabled,
}: {
  children: React.ReactNode;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  variant?: "gold" | "outline" | "ghost" | "purple" | "danger";
  size?: "sm" | "md" | "lg";
  className?: string;
  type?: "button" | "submit";
  disabled?: boolean;
}) => {
  const base =
    "inline-flex items-center justify-center gap-2 font-bold transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100 uppercase tracking-wider rounded-full";
  const variants = {
    gold: "bg-[#C5A059] text-white shadow-sm hover:brightness-110",
    outline: "bg-transparent text-[#C5A059] border border-[#C5A059]/30 hover:bg-[#C5A059] hover:text-white",
    ghost: "bg-[#F3F1EC] text-[#202020] border border-[#E5E3DB] hover:bg-[#E5E3DB]",
    purple: "bg-[#8B5CF6] text-white shadow-sm",
    danger: "bg-[#EF4444] text-white shadow-sm",
  };
  const sizes = {
    sm: "px-3 py-1.5 text-[10px]",
    md: "px-5 py-2.5 text-[12px]",
    lg: "px-8 py-3.5 text-base",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(base, variants[variant], sizes[size], className)}
    >
      {children}
    </button>
  );
};

export const Skeleton = ({
  className,
  width,
  height,
  rounded = 8,
}: {
  className?: string;
  width?: string | number;
  height?: string | number;
  rounded?: number;
}) => (
  <div
    className={cn(
      "bg-gradient-to-r from-[#F3F1EC] via-[#E5E3DB] to-[#F3F1EC] bg-[length:400px_100%] animate-[shimmer_1.5s_infinite]",
      className
    )}
    style={{ width, height, borderRadius: rounded }}
  />
);

export const Card = ({
  children,
  className,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: (e?: any) => void;
}) => (
  <motion.div
    whileHover={onClick ? { y: -2, boxShadow: "0 8px 24px rgba(0,0,0,0.06)" } : undefined}
    whileTap={onClick ? { scale: 0.98 } : undefined}
    onClick={onClick}
    className={cn(
      "bg-white border border-[#C5A059]/10 rounded-xl shadow-sm transition-colors duration-200",
      onClick && "cursor-pointer",
      className
    )}
  >
    {children}
  </motion.div>
);

export const ProgressBar = ({
  current,
  goal,
  color = "#C5A059",
}: {
  current: number;
  goal: number;
  color?: string;
}) => {
  const pct = Math.min(100, Math.round((current / goal) * 100));
  return (
    <div className="w-full">
      <div className="flex justify-between text-xs font-bold mb-1.5">
        <span className="text-[#202020]">${current.toLocaleString()} raised</span>
        <span className="text-[#7A7A7A]">${goal.toLocaleString()} goal · {pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-[#F3F1EC] overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
        />
      </div>
    </div>
  );
};

export const Chip = ({
  label,
  active,
  onClick,
  className,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}) => (
  <button
    onClick={onClick}
    className={cn(
      "px-5 py-2 rounded-full text-xs font-bold transition-all shrink-0 active:scale-95",
      active ? "bg-[#C5A059] text-white shadow-sm" : "bg-[#F3F1EC] text-[#7A7A7A] hover:bg-[#E5E3DB]",
      className
    )}
  >
    {label}
  </button>
);

export const Badge = ({ count, color = "#C5A059" }: { count: number; color?: string }) => {
  if (count <= 0) return null;
  return (
    <span
      className="inline-flex items-center justify-center min-w-[22px] px-1.5 py-0.5 text-[11px] font-bold text-white rounded-full"
      style={{ backgroundColor: color }}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
};
