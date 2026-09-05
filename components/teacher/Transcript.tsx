"use client";

import { useState } from "react";
import { Bot, Check, Copy, User as UserIcon } from "lucide-react";
import { cn, stripMarkdown } from "@/lib/utils";
import type { AIMessage } from "@/types";

export function MessageBubble({
  message,
  light,
}: {
  message: AIMessage;
  light: boolean;
}) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(stripMarkdown(message.content));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — nothing useful to say about it */
    }
  }

  return (
    <div className={cn("msg-in group flex gap-3", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          isUser
            ? light
              ? "bg-slate-200 text-slate-700"
              : "bg-white/10 text-slate-300"
            : "bg-gradient-to-br from-brand to-brand-700 text-white shadow-lg shadow-brand/30"
        )}
      >
        {isUser ? <UserIcon size={14} /> : <Bot size={14} />}
      </div>
      <div className={cn("flex max-w-[80%] flex-col gap-1.5", isUser && "items-end")}>
        <div
          className={cn(
            "rounded-2xl px-4 py-3 text-sm leading-relaxed",
            isUser
              ? "bg-gradient-to-br from-brand to-brand-700 text-white shadow-lg shadow-brand/20"
              : light
              ? "border border-slate-200 bg-white/80 text-slate-900 backdrop-blur"
              : "border border-white/10 bg-white/5 text-slate-100 backdrop-blur"
          )}
        >
          <p className="whitespace-pre-wrap break-words">
            {stripMarkdown(message.content)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 px-1">
            {!isUser && (
              <button
                onClick={copy}
                title="Copy this answer"
                // Revealed on hover, which a touch screen does not have — so on
                // one it is simply always there, and the pseudo-element gives it
                // a target a thumb can hit. Unchanged with a mouse.
                className={cn(
                  "relative flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] opacity-0 transition after:absolute after:-inset-x-1 after:-inset-y-2.5 after:content-[''] group-hover:opacity-100 focus:opacity-100 [@media(hover:none)]:!opacity-100",
                  light
                    ? "border-slate-200 bg-white/70 text-slate-600 hover:text-slate-900"
                    : "border-white/10 bg-white/5 text-slate-400 hover:text-white"
                )}
              >
                {copied ? <Check size={10} /> : <Copy size={10} />}
                {copied ? "Copied" : "Copy"}
              </button>
            )}
            {message.sourceRef && (
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[10px]",
                  light
                    ? "border-slate-200 bg-white/70 text-slate-600"
                    : "border-white/10 bg-white/5 text-slate-400"
                )}
              >
                {message.sourceRef}
              </span>
            )}
            {message.cached && (
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[10px]",
                  light
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
                )}
              >
                Fast response
              </span>
            )}
        </div>
      </div>
    </div>
  );
}


export function TypingIndicator({ light }: { light: boolean }) {
  return (
    <div className="msg-in flex gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand-700 text-white shadow-lg shadow-brand/30">
        <Bot size={14} />
      </div>
      <div
        className={cn(
          "flex items-center gap-1.5 rounded-2xl border px-4 py-3 backdrop-blur",
          light ? "border-slate-200 bg-white/80" : "border-white/10 bg-white/5"
        )}
      >
        <span
          className={cn(
            "typing-dot h-1.5 w-1.5 rounded-full",
            light ? "bg-slate-500" : "bg-slate-400"
          )}
        />
        <span
          className={cn(
            "typing-dot h-1.5 w-1.5 rounded-full",
            light ? "bg-slate-500" : "bg-slate-400"
          )}
        />
        <span
          className={cn(
            "typing-dot h-1.5 w-1.5 rounded-full",
            light ? "bg-slate-500" : "bg-slate-400"
          )}
        />
      </div>
    </div>
  );
}
