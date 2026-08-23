"use client";

import { Boxes, ChevronRight, CreditCard, Droplets, Factory, LayoutDashboard, Menu, Package, PanelLeftClose, PanelLeftOpen, ReceiptText, Recycle, Route, ShoppingCart, Store, Truck, UserRoundCog, Users, WalletCards, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { clearSession, getSessionExpiresAt, getStoredUser, getToken, SessionUser } from "../lib/api";
import { ThemeToggle } from "./ThemeToggle";

const groups = [
  { label: "Principal", icon: LayoutDashboard, links: [{ href: "/dashboard", label: "Resumen", icon: LayoutDashboard }] },
  { label: "Gastos", icon: ShoppingCart, links: [
    { href: "/gastos", label: "Gastos", icon: ShoppingCart },
  ] },
  { label: "Producción", icon: Factory, links: [
    { href: "/produccion", label: "Órdenes de producción", icon: Factory },
    { href: "/lotes", label: "Lotes producidos", icon: Boxes },
  ] },
  { label: "Ventas", icon: ReceiptText, links: [
    { href: "/clientes", label: "Clientes", icon: Users },
    { href: "/ventas", label: "Ventas", icon: ReceiptText },
    { href: "/devoluciones", label: "Devoluciones comerciales", icon: ReceiptText },
  ] },
  { label: "Distribución", icon: Route, links: [
    { href: "/envases", label: "Retorno de envases", icon: Recycle },
  ] },
  { label: "Inventario", icon: Boxes, links: [
    { href: "/productos", label: "Productos e insumos", icon: Package },
    { href: "/almacenes", label: "Almacenes", icon: Store },
    { href: "/inventario", label: "Stock por estado", icon: Boxes },
    { href: "/movimientos", label: "Kardex", icon: ShoppingCart },
  ] },
  { label: "Caja y cuentas", icon: WalletCards, links: [
    { href: "/cobranzas", label: "Cobros y abonos", icon: WalletCards },
    { href: "/cuentas-cobrar", label: "Cuentas por cobrar", icon: CreditCard },
    { href: "/metodos-pago", label: "Métodos de pago", icon: CreditCard },
  ] },
  { label: "Reportes", icon: ReceiptText, links: [
    { href: "/reportes/ventas", label: "Reporte de ventas", icon: ReceiptText },
    { href: "/reportes/gastos", label: "Reporte de gastos", icon: Truck },
    { href: "/reportes/stock", label: "Stock actual", icon: Boxes },
  ] },
  { label: "Configuración", icon: UserRoundCog, links: [
    { href: "/trabajadores", label: "Trabajadores", icon: UserRoundCog },
  ] },
];

const links = groups.flatMap((group) => group.links);

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<string[]>(() => {
    const activeGroup = groups.find((group) => group.links.some(({ href }) => pathname === href || pathname.startsWith(`${href}/`)));
    return activeGroup ? [activeGroup.label] : [groups[0].label];
  });

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    setUser(getStoredUser());
    setSidebarCollapsed(window.localStorage.getItem("torito-sidebar-collapsed") === "true");
  }, [router]);

  useEffect(() => {
    const expiresAt = getSessionExpiresAt();
    const endSession = () => {
      clearSession();
      router.replace("/login");
    };
    if (!expiresAt || expiresAt <= Date.now()) {
      endSession();
      return;
    }
    const timeout = window.setTimeout(endSession, expiresAt - Date.now());
    return () => window.clearTimeout(timeout);
  }, [router]);

  const toggleSidebar = () => {
    setSidebarCollapsed((collapsed) => {
      const nextValue = !collapsed;
      window.localStorage.setItem("torito-sidebar-collapsed", String(nextValue));
      return nextValue;
    });
  };

  useEffect(() => {
    setMenuOpen(false);
    const activeGroup = groups.find((group) => group.links.some(({ href }) => pathname === href || pathname.startsWith(`${href}/`)));
    if (activeGroup) setExpandedGroups((current) => current.includes(activeGroup.label) ? current : [...current, activeGroup.label]);
  }, [pathname]);

  const toggleGroup = (label: string) => {
    setExpandedGroups((current) => current.includes(label) ? current.filter((item) => item !== label) : [...current, label]);
  };

  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  return (
    <div className={sidebarCollapsed ? "app-shell sidebar-is-collapsed" : "app-shell"}>
      <a className="skip-link" href="#main-content">Saltar al contenido</a>
      <aside className={sidebarCollapsed ? "desktop-sidebar collapsed" : "desktop-sidebar"}>
        <div className="sidebar-brand">
          <span className="sidebar-logo"><Droplets size={21} /></span>
          <div className="sidebar-brand-copy"><strong>Torito Fresh</strong><small>Gestión administrativa</small></div>
        </div>
        <nav className="sidebar-nav" aria-label="Navegacion lateral">
          {groups.map((group) => {
            const groupActive = group.links.some(({ href }) => pathname === href || pathname.startsWith(`${href}/`));
            const expanded = expandedGroups.includes(group.label);
            const GroupIcon = group.icon;
            return (
              <section className={`sidebar-group${groupActive ? " active" : ""}${expanded ? " expanded" : ""}`} key={group.label}>
                <button className="sidebar-group-trigger" type="button" onClick={() => toggleGroup(group.label)} aria-expanded={expanded} aria-controls={`sidebar-group-${group.label.toLowerCase().replaceAll(" ", "-")}`} aria-label={sidebarCollapsed ? `${group.label}: mostrar subapartados` : undefined}>
                  <GroupIcon size={18} />
                  <strong>{group.label}</strong>
                  <ChevronRight className="sidebar-group-chevron" size={15} />
                </button>
                <div className="sidebar-submenu" id={`sidebar-group-${group.label.toLowerCase().replaceAll(" ", "-")}`}>
                  <div className="sidebar-submenu-title"><GroupIcon size={17} /><strong>{group.label}</strong></div>
                  <div className="sidebar-submenu-links">
                    {group.links.map(({ href, label, icon: Icon }) => {
                      const active = pathname === href || pathname.startsWith(`${href}/`);
                      return <Link aria-current={active ? "page" : undefined} className={active ? "sidebar-link active" : "sidebar-link"} href={href} key={href}><Icon size={16} /><span>{label}</span></Link>;
                    })}
                  </div>
                </div>
              </section>
            );
          })}
        </nav>
      </aside>

      <header className="admin-bar">
        <div className="admin-identity">
          <button className="sidebar-collapse-button" type="button" onClick={toggleSidebar} aria-label={sidebarCollapsed ? "Expandir barra lateral" : "Contraer barra lateral"} title={sidebarCollapsed ? "Expandir barra lateral" : "Contraer barra lateral"}>
            {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
          <div><strong>{user?.name ?? "Administrador"}</strong><span>{user?.role ?? "ADMIN"}</span></div>
        </div>
        <div className="admin-actions">
          <ThemeToggle />
          <button className="menu-button" onClick={() => setMenuOpen((value) => !value)} title={menuOpen ? "Cerrar menú" : "Abrir menú"} aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"} aria-expanded={menuOpen} aria-controls="mobile-navigation" type="button">
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      {menuOpen ? (
        <><button className="app-menu-backdrop" type="button" aria-label="Cerrar menú" onClick={() => setMenuOpen(false)} />
        <nav className="app-menu" id="mobile-navigation" aria-label="Menú principal">
          <div className="app-menu-title"><span>Navegación</span><small>Selecciona una sección</small></div>
          {links.map(({ href, label, icon: Icon }) => (
            <Link aria-current={pathname === href || pathname.startsWith(`${href}/`) ? "page" : undefined} className={pathname === href || pathname.startsWith(`${href}/`) ? "app-menu-link active" : "app-menu-link"} href={href} key={href} onClick={() => setMenuOpen(false)}>
              <Icon size={16} />{label}
            </Link>
          ))}
        </nav></>
      ) : null}

      <main className="app-main" id="main-content" tabIndex={-1}>{children}</main>
    </div>
  );
}
