"use client";

import { Boxes, CreditCard, Droplets, LayoutDashboard, Menu, Package, ReceiptText, ShoppingCart, Store, Truck, UserRoundCog, Users, WalletCards, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { getStoredUser, getToken, SessionUser } from "../lib/api";

const groups = [
  { label: "Principal", links: [{ href: "/dashboard", label: "Resumen", icon: LayoutDashboard }] },
  { label: "Compras", links: [
    { href: "/proveedores", label: "Proveedores", icon: Truck },
    { href: "/compras", label: "Compras", icon: ShoppingCart },
    { href: "/cuentas-pagar", label: "Cuentas por pagar", icon: CreditCard },
  ] },
  { label: "Ventas", links: [
    { href: "/clientes", label: "Clientes", icon: Users },
    { href: "/ventas", label: "Ventas", icon: ReceiptText },
    { href: "/cuentas-cobrar", label: "Cuentas por cobrar", icon: WalletCards },
    { href: "/devoluciones", label: "Devoluciones", icon: ReceiptText },
  ] },
  { label: "Inventario", links: [
    { href: "/productos", label: "Productos", icon: Package },
    { href: "/lotes", label: "Lotes", icon: Boxes },
    { href: "/almacenes", label: "Almacenes", icon: Store },
    { href: "/inventario", label: "Stock", icon: Boxes },
    { href: "/movimientos", label: "Movimientos", icon: ShoppingCart },
  ] },
  { label: "Configuracion", links: [
    { href: "/trabajadores", label: "Trabajadores", icon: UserRoundCog },
    { href: "/metodos-pago", label: "Metodos de pago", icon: CreditCard },
  ] },
];

const links = groups.flatMap((group) => group.links);

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    setUser(getStoredUser());
  }, [router]);

  return (
    <div className="app-shell">
      <aside className="desktop-sidebar">
        <div className="sidebar-brand"><span className="sidebar-logo"><Droplets size={21} /></span><div><strong>Torito Fresh</strong><small>Gestion administrativa</small></div></div>
        <nav className="sidebar-nav" aria-label="Navegacion lateral">
          {groups.map((group) => <section className="sidebar-group" key={group.label}><p>{group.label}</p>{group.links.map(({ href, label, icon: Icon }) => <Link className={pathname === href ? "sidebar-link active" : "sidebar-link"} href={href} key={href}><Icon size={16} /><span>{label}</span></Link>)}</section>)}
        </nav>
      </aside>

      <header className="admin-bar">
        <div><strong>{user?.name ?? "Administrador"}</strong><span>{user?.role ?? "ADMIN"}</span></div>
        <button className="menu-button" onClick={() => setMenuOpen((value) => !value)} title="Abrir menu" aria-label="Abrir menu" type="button">
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </header>

      {menuOpen ? (
        <nav className="app-menu" aria-label="Menu principal">
          {links.map(({ href, label, icon: Icon }) => (
            <Link className={pathname === href ? "app-menu-link active" : "app-menu-link"} href={href} key={href} onClick={() => setMenuOpen(false)}>
              <Icon size={16} />{label}
            </Link>
          ))}
        </nav>
      ) : null}

      <main className="app-main">{children}</main>
    </div>
  );
}
