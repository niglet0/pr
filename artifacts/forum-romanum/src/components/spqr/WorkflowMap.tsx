/**
 * WorkflowMap — animated step-by-step agent activity display.
 * Shows each tool the Oracle is using in real time with smooth transitions.
 */
import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import * as Lucide from "lucide-react";

export interface WorkflowStep {
  id: string;
  toolName: string;
  icon: string;
  label: string;
  status: "pending" | "active" | "done";
  startedAt: number;
}

interface Props {
  steps: WorkflowStep[];
  phase: "thinking" | "working" | "composing" | "idle";
  currentLabel?: string;
}

function ToolIcon({ name, size = 14 }: { name: string; size?: number }) {
  const LucideIcon = (Lucide as any)[name] as React.FC<any> | undefined;
  if (!LucideIcon) return <Lucide.Zap size={size} />;
  return <LucideIcon size={size} strokeWidth={2} />;
}

const PHASE_CONFIG = {
  thinking: { label: "Deliberating…", icon: "Brain", color: "#C5A059" },
  working: { label: "Working…", icon: "Zap", color: "#C5A059" },
  composing: { label: "Composing…", icon: "PenLine", color: "#10B981" },
  idle: { label: "", icon: "Circle", color: "#7A7A7A" },
};

export function WorkflowMap({ steps, phase, currentLabel }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ left: scrollRef.current.scrollWidth, behavior: "smooth" });
  }, [steps.length]);

  const cfg = PHASE_CONFIG[phase];
  const hasSteps = steps.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.96 }}
      transition={{ duration: 0.2 }}
      className="bg-[#FAF9F6] border border-[#E5E3DB] rounded-2xl rounded-tl-sm px-3.5 py-2.5 max-w-[92%] shadow-sm"
    >
      {/* Phase header */}
      <div className="flex items-center gap-2 mb-2">
        <motion.div
          animate={{
            boxShadow: [
              `0 0 0 0px ${cfg.color}30`,
              `0 0 0 4px ${cfg.color}20`,
              `0 0 0 0px ${cfg.color}30`,
            ],
          }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
          className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${cfg.color}15` }}
        >
          <span style={{ color: cfg.color }}>
            <ToolIcon name={cfg.icon} size={11} />
          </span>
        </motion.div>
        <AnimatePresence mode="wait">
          <motion.span
            key={currentLabel || cfg.label}
            initial={{ opacity: 0, x: 6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -6 }}
            transition={{ duration: 0.18 }}
            className="text-[11px] font-bold text-[#7A7A7A] uppercase tracking-widest"
          >
            {currentLabel || cfg.label}
          </motion.span>
        </AnimatePresence>

        {/* Animated dots */}
        <div className="flex gap-0.5 ml-auto">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              animate={{ opacity: [0.3, 1, 0.3], scaleY: [0.6, 1.2, 0.6] }}
              transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
              className="w-1 h-2.5 rounded-full"
              style={{ backgroundColor: cfg.color }}
            />
          ))}
        </div>
      </div>

      {/* Step pills */}
      {hasSteps && (
        <div ref={scrollRef} className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
          <AnimatePresence>
            {steps.map((step, idx) => (
              <motion.div
                key={step.id}
                initial={{ opacity: 0, scale: 0.8, x: 10 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                transition={{ duration: 0.2, delay: idx * 0.03 }}
                className="flex items-center gap-1.5 shrink-0 rounded-full px-2.5 py-1 border"
                style={{
                  backgroundColor:
                    step.status === "done"
                      ? "#10B98110"
                      : step.status === "active"
                      ? "#C5A05910"
                      : "#F3F1EC",
                  borderColor:
                    step.status === "done"
                      ? "#10B98140"
                      : step.status === "active"
                      ? "#C5A05940"
                      : "#E5E3DB",
                }}
              >
                {step.status === "done" ? (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 400, damping: 15 }}
                  >
                    <Lucide.Check size={10} strokeWidth={3} color="#10B981" />
                  </motion.div>
                ) : step.status === "active" ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
                  >
                    <Lucide.Loader size={10} color="#C5A059" strokeWidth={2.5} />
                  </motion.div>
                ) : (
                  <span style={{ color: "#7A7A7A", opacity: 0.5 }}>
                    <ToolIcon name={step.icon} size={10} />
                  </span>
                )}
                <span
                  className="text-[9px] font-bold uppercase tracking-wider whitespace-nowrap"
                  style={{
                    color:
                      step.status === "done"
                        ? "#10B981"
                        : step.status === "active"
                        ? "#C5A059"
                        : "#9A9A9A",
                  }}
                >
                  {step.label}
                </span>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Composing step — appears at end when composing */}
          {phase === "composing" && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8, x: 10 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              className="flex items-center gap-1.5 shrink-0 rounded-full px-2.5 py-1 border border-[#10B98140] bg-[#10B98110]"
            >
              <motion.div
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 0.8, repeat: Infinity }}
              >
                <Lucide.PenLine size={10} color="#10B981" />
              </motion.div>
              <span className="text-[9px] font-bold uppercase tracking-wider text-[#10B981]">Composing</span>
            </motion.div>
          )}
        </div>
      )}
    </motion.div>
  );
}
