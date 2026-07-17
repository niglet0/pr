import React from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { motion } from "motion/react";
import * as Lucide from "lucide-react";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

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
  const LucideIcon = Lucide[name] as React.FC<{ size?: number; className?: string; color?: string; strokeWidth?: number }>;
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
      alt=""
      className={cn(
        "rounded-full object-cover",
        ring ? "border-2 border-accent" : "border border-border-soft"
      )}
      style={{ width: size, height: size }}
    />
    {online && (
      <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-success border-2 border-surface" />
    )}
  </div>
);

type ButtonVariant = "gold" | "outline" | "ghost" | "purple" | "danger" | "dark";
type ButtonSize = "sm" | "md" | "lg";

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
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  type?: "button" | "submit";
  disabled?: boolean;
}) => {
  const base =
    "inline-flex items-center justify-center gap-2 font-bold transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100 uppercase tracking-wider rounded-full";
  const variants: Record<ButtonVariant, string> = {
    gold: "bg-accent text-white shadow-sm hover:brightness-110",
    outline: "bg-transparent text-accent border border-accent/40 hover:bg-accent hover:text-white",
    ghost: "bg-surface-2 text-ink border border-border-soft hover:bg-border-soft",
    purple: "bg-purple text-white shadow-sm",
    danger: "bg-danger text-white shadow-sm",
    dark: "bg-ink text-accent shadow-sm hover:bg-ink/90",
  };
  const sizes: Record<ButtonSize, string> = {
    sm: "px-3 py-1.5 text-[10px]",
    md: "px-5 py-2.5 text-[12px]",
    lg: "px-8 py-3.5 text-[13px]",
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={cn(base, variants[variant], sizes[size], className)}>
      {children}
    </button>
  );
};

export const Card = ({
  children,
  className,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) => (
  <motion.div
    whileHover={onClick ? { y: -2, boxShadow: "0 8px 24px rgba(0,0,0,0.06)" } : undefined}
    whileTap={onClick ? { scale: 0.98 } : undefined}
    onClick={onClick}
    className={cn(
      "bg-surface border border-accent/10 rounded-xl shadow-sm transition-colors duration-200",
      onClick && "cursor-pointer",
      className
    )}
  >
    {children}
  </motion.div>
);

export const Chip = ({
  label,
  active,
  onClick,
  icon,
  className,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
  icon?: keyof typeof Lucide;
  className?: string;
}) => (
  <button
    onClick={onClick}
    className={cn(
      "px-4 py-2 rounded-full text-[11px] font-bold uppercase tracking-widest transition-all shrink-0 active:scale-95 inline-flex items-center gap-1.5",
      active ? "bg-accent text-white shadow-sm" : "bg-surface-2 text-muted hover:bg-border-soft",
      className
    )}
  >
    {icon && <Icon name={icon} size={13} />}
    {label}
  </button>
);

export const Badge = ({ count, color = "var(--accent)" }: { count: number; color?: string }) => {
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

export const ProgressBar = ({
  current,
  goal,
  color = "var(--accent)",
}: {
  current: number;
  goal: number;
  color?: string;
}) => {
  const pct = Math.min(100, Math.round((current / goal) * 100));
  return (
    <div className="w-full">
      <div className="flex justify-between text-xs font-bold mb-1.5">
        <span className="text-ink">${current.toLocaleString()} raised</span>
        <span className="text-muted">${goal.toLocaleString()} · {pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
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
      "bg-gradient-to-r from-surface-2 via-border-soft to-surface-2 bg-[length:400px_100%] animate-[shimmer_1.5s_infinite]",
      className
    )}
    style={{ width, height, borderRadius: rounded }}
  />
);
