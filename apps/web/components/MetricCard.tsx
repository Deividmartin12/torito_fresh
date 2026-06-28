import { ReactNode } from "react";

export function MetricCard({ title, value, icon }: { title: string; value: ReactNode; icon: ReactNode }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
          <p className="mt-2 text-2xl font-bold text-ink">{value}</p>
        </div>
        <div className="grid h-10 w-10 place-items-center rounded-md bg-brand-50 text-brand-700">{icon}</div>
      </div>
    </div>
  );
}
