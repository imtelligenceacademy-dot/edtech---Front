"use client";

import { ArrowUp, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { AiQuotaNote } from "@/components/teacher/AiQuotaNote";
import type { AIQuota } from "@/types";

/**
 * Where the teacher types. The send button becomes a stop button while a reply
 * is streaming, and the line underneath tells them the conversation is kept —
 * which they should read here rather than discover later.
 */
export function ChatComposer({
  value,
  onChange,
  onSend,
  onStop,
  busy,
  inputRef,
  light,
  quota,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  /** A reply is thinking or streaming: offer to stop it instead of to send. */
  busy: boolean;
  inputRef: React.RefObject<HTMLTextAreaElement>;
  light: boolean;
  /** The teacher's remaining allowance, shown before it runs out rather than
   *  announced by a refusal once it has. Null while unknown or unlimited. */
  quota?: AIQuota | null;
}) {
  return (
    <div
      className={cn(
        "border-t px-4 py-4 backdrop-blur-xl sm:px-8",
        light ? "border-slate-200/60 bg-white/40" : "border-white/5 bg-slate-950/40"
      )}
    >
      <div className="mx-auto max-w-3xl">
        <div
          className={cn(
            "group relative flex items-end gap-2 rounded-2xl border p-2 shadow-lg transition focus-within:border-brand/60",
            light
              ? "border-slate-200 bg-white shadow-slate-900/5 focus-within:shadow-brand/20"
              : "border-white/10 bg-white/5 shadow-black/30 focus-within:shadow-brand/20"
          )}
        >
          <textarea
            ref={inputRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            rows={1}
            placeholder="Message IM-Telligence AI…"
            className={cn(
              // text-base below sm, not text-sm: iOS Safari zooms the whole
              // page in when a focused field is under 16px and never zooms back
              // out, which leaves a teacher pinching to find the send button
              // after every question. Unchanged from sm up.
              "max-h-[180px] flex-1 resize-none bg-transparent px-3 py-2.5 text-base focus:outline-none disabled:cursor-not-allowed sm:text-sm",
              light
                ? "text-slate-900 placeholder:text-slate-400"
                : "text-white placeholder:text-slate-500"
            )}
          />
          {busy ? (
            <button
              onClick={onStop}
              // The pseudo-element widens the touch target to 48px without
              // moving or resizing the button itself; 36px is below what a
              // thumb reliably hits. Same for Send below.
              className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white transition after:absolute after:-inset-1.5 after:content-[''] hover:bg-slate-700"
              aria-label="Stop the reply"
              title="Stop"
            >
              <Square size={13} fill="currentColor" />
            </button>
          ) : (
            <button
              onClick={onSend}
              disabled={!value.trim()}
              className={cn(
                "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition after:absolute after:-inset-1.5 after:content-['']",
                value.trim()
                  ? "bg-gradient-to-br from-brand to-brand-700 text-white shadow-lg shadow-brand/40 hover:brightness-110"
                  : light
                  ? "bg-slate-100 text-slate-400"
                  : "bg-white/5 text-slate-500"
              )}
              aria-label="Send"
            >
              <ArrowUp size={16} />
            </button>
          )}
        </div>
        <p
          className={cn(
            "mt-2 text-center text-[11px]",
            light ? "text-slate-500" : "text-slate-500"
          )}
        >
          Press{" "}
          <kbd
            className={cn("rounded px-1 py-0.5", light ? "bg-slate-200/60" : "bg-white/5")}
          >
            Enter
          </kbd>{" "}
          to send ·{" "}
          <kbd
            className={cn("rounded px-1 py-0.5", light ? "bg-slate-200/60" : "bg-white/5")}
          >
            Shift+Enter
          </kbd>{" "}
          for newline · saved to this lesson so you can come back to it, visible
          only to you and the platform owner
        </p>
        <p className="mt-1 text-center text-[11px]">
          <AiQuotaNote quota={quota} />
        </p>
      </div>
    </div>
  );
}
