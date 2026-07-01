import type { ReactNode } from "react";
import { Card } from "./Card";

export function StatCard({
  label,
  value,
  delta,
  icon,
}: {
  label: string;
  value: string | number;
  delta?: string;
  icon?: ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">
            {label}
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
          {delta && (
            <p className="mt-1 text-xs text-slate-500">{delta}</p>
          )}
        </div>
        {icon && (
          <div className="rounded-lg bg-brand-50 p-2 text-brand-600">{icon}</div>
        )}
      </div>
    </Card>
  );
}
