import { ReactNode } from "react";

export function MetricCard({ title, value, icon }: { title: string; value: ReactNode; icon: ReactNode }) {
  return (
    <div className="rounded-xl bg-blue-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-500">{title}</p>
          <p className="mt-2 text-2xl font-bold text-blue-900">{value}</p>
        </div>
        <div className="grid h-10 w-10 place-items-center rounded-full bg-blue-100 text-blue-700">{icon}</div>
      </div>
    </div>
  );
}
