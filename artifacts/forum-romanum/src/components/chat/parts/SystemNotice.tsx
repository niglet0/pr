import React from "react";

export function SystemNotice({ text }: { text: string }) {
  return (
    <div className="flex justify-center my-2">
      <span className="text-[10.5px] font-medium tracking-wide text-[#7A7A7A] bg-[#202020]/[0.06] px-3 py-1 rounded-full max-w-[80%] truncate">
        {text}
      </span>
    </div>
  );
}