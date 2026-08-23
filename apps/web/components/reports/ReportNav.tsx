"use client";

import { Boxes, ShoppingCart, Truck } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const reports = [
  { href: "/reportes/ventas", label: "Ventas", icon: ShoppingCart },
  { href: "/reportes/gastos", label: "Gastos", icon: Truck },
  { href: "/reportes/stock", label: "Stock actual", icon: Boxes },
];

export function ReportNav() {
  const pathname = usePathname();
  return <nav className="report-nav" aria-label="Tipos de reporte">{reports.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={pathname === href ? "active" : ""}><Icon size={17} /> {label}</Link>)}</nav>;
}

export function ReportHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <><div className="report-page-head"><div><span className="operation-eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div></div><ReportNav /></>;
}

export function ReportMetric({ label, value, detail }: { label: string; value: React.ReactNode; detail: string }) {
  return <article className="report-metric"><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}
