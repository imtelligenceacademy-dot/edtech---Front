import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead className="text-xs uppercase tracking-wide text-slate-500 bg-slate-50">
      {children}
    </thead>
  );
}

export function TR({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <tr className={cn("border-b border-slate-100 last:border-0", className)}>
      {children}
    </tr>
  );
}

export function TH({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <th
      className={cn(
        "text-left font-medium px-4 py-3 whitespace-nowrap",
        className
      )}
    >
      {children}
    </th>
  );
}

export function TD({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <td className={cn("px-4 py-3 text-slate-700", className)}>{children}</td>
  );
}
