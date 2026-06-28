"use client";

import {
  BarChart3,
  Boxes,
  ClipboardList,
  Droplets,
  HandCoins,
  LayoutDashboard,
  LogOut,
  Package,
  ReceiptText,
  Route,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { clearSession, getStoredUser, getToken, SessionUser } from "../lib/api";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/productos", label: "Productos", icon: Package },
  { href: "/pedidos", label: "Pedidos", icon: ClipboardList },
  { href: "/ventas", label: "Ventas", icon: ReceiptText },
  { href: "/cobranzas", label: "Cobranzas", icon: HandCoins },
  { href: "/envases", label: "Envases", icon: Droplets },
  { href: "/repartos", label: "Repartos", icon: Route },
  { href: "/inventario", label: "Inventario", icon: Boxes },
  { href: "/reportes", label: "Reportes", icon: BarChart3 },
];

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    setUser(getStoredUser());
  }, [router]);

  function logout() {
    clearSession();
    router.replace("/login");
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-slate-200 bg-white lg:block">
        <div className="flex h-16 items-center gap-3 border-b border-slate-200 px-5">
          <div className="grid h-10 w-10 place-items-center rounded-md bg-brand-600 text-white">
            <Droplets size={22} />
          </div>
          <div>
            <p className="text-sm font-black uppercase tracking-wide text-ink">tORITO FRESH</p>
            <p className="text-xs text-slate-500">Gestion administrativa</p>
          </div>
        </div>
        <nav className="space-y-1 px-3 py-4">
          {nav.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex h-10 items-center gap-3 rounded-md px-3 text-sm font-semibold transition ${
                  active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50 hover:text-ink"
                }`}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
          <div className="flex min-h-16 items-center justify-between gap-3 px-4 lg:px-6">
            <div className="min-w-0">
              <p className="text-sm font-bold text-ink">{user?.name ?? "tORITO FRESH"}</p>
              <p className="text-xs text-slate-500">{user?.role ?? "Sistema administrativo"}</p>
            </div>
            <button className="btn-secondary" onClick={logout} title="Cerrar sesion">
              <LogOut size={16} />
              <span className="hidden sm:inline">Salir</span>
            </button>
          </div>
          <nav className="flex gap-2 overflow-x-auto px-3 pb-3 lg:hidden">
            {nav.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-md px-3 text-xs font-semibold ${
                    active ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-700"
                  }`}
                >
                  <Icon size={15} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-5 lg:px-6">{children}</main>
      </div>
    </div>
  );
}
