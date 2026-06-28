const styles: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700 ring-amber-200",
  PREPARING: "bg-sky-50 text-sky-700 ring-sky-200",
  ON_ROUTE: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  DELIVERED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  CANCELLED: "bg-rose-50 text-rose-700 ring-rose-200",
  PAID: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  PARTIAL: "bg-orange-50 text-orange-700 ring-orange-200",
  ACTIVE: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  INACTIVE: "bg-slate-100 text-slate-600 ring-slate-200",
};

const labels: Record<string, string> = {
  PENDING: "Pendiente",
  PREPARING: "En preparacion",
  ON_ROUTE: "En ruta",
  DELIVERED: "Entregado",
  CANCELLED: "Cancelado",
  PAID: "Pagado",
  PARTIAL: "Pago parcial",
  ACTIVE: "Activo",
  INACTIVE: "Inactivo",
};

export function StatusBadge({ value }: { value: string }) {
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold ring-1 ${styles[value] ?? "bg-slate-100 text-slate-600 ring-slate-200"}`}>
      {labels[value] ?? value}
    </span>
  );
}
