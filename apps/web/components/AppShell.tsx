'use client';

import {
  ArrowLeftRight,
  BarChart3,
  Boxes,
  CalendarClock,
  ChevronRight,
  CreditCard,
  Factory,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  PackageX,
  PanelLeftClose,
  PanelLeftOpen,
  ReceiptText,
  Recycle,
  Route,
  ShoppingCart,
  Store,
  Truck,
  UserRoundCog,
  Users,
  WalletCards,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  limpiarSesion,
  obtenerVencimientoSesion,
  obtenerUsuarioGuardado,
  obtenerToken,
  UsuarioSesion,
} from '../lib/api';
import { aliasRuta, puedeVer } from '../lib/permissions';
import { ThemeToggle } from './ThemeToggle';

const groups = [
  {
    label: 'Principal',
    icon: LayoutDashboard,
    links: [{ href: '/dashboard', label: 'Resumen', icon: LayoutDashboard }],
  },
  {
    label: 'Gastos',
    icon: ShoppingCart,
    links: [
      { href: '/gastos', label: 'Gastos', icon: ShoppingCart },
      { href: '/categorias-gastos', label: 'Categorías de gasto', icon: ShoppingCart },
    ],
  },
  {
    label: 'Producción',
    icon: Factory,
    links: [
      { href: '/produccion', label: 'Órdenes de producción', icon: Factory },
      { href: '/lotes', label: 'Lotes producidos', icon: Boxes },
    ],
  },
  {
    label: 'Ventas',
    icon: ReceiptText,
    links: [
      { href: '/clientes', label: 'Clientes', icon: Users },
      { href: '/ventas', label: 'Ventas', icon: ReceiptText },
      { href: '/recargas', label: 'Frecuencia de recarga', icon: CalendarClock },
      { href: '/devoluciones', label: 'Devoluciones comerciales', icon: ReceiptText },
    ],
  },
  {
    label: 'Distribución',
    icon: Route,
    links: [
      { href: '/envases', label: 'Retorno de envases', icon: Recycle },
      { href: '/bidones-rotos', label: 'Bidones rotos', icon: PackageX },
    ],
  },
  {
    label: 'Inventario',
    icon: Boxes,
    links: [
      { href: '/productos', label: 'Productos e insumos', icon: Package },
      { href: '/almacenes', label: 'Almacenes', icon: Store },
      { href: '/movimientos', label: 'Kardex', icon: ArrowLeftRight },
    ],
  },
  {
    label: 'Caja y cuentas',
    icon: WalletCards,
    links: [
      { href: '/cobranzas', label: 'Cobranzas', icon: WalletCards },
      { href: '/metodos-pago', label: 'Métodos de pago', icon: CreditCard },
    ],
  },
  {
    label: 'Reportes',
    icon: ReceiptText,
    links: [
      { href: '/reportes/resumen', label: 'Resumen diario', icon: BarChart3 },
      { href: '/reportes/ventas', label: 'Reporte de ventas', icon: ReceiptText },
      { href: '/reportes/gastos', label: 'Reporte de gastos', icon: Truck },
      { href: '/reportes/stock', label: 'Stock actual', icon: Boxes },
    ],
  },
  {
    label: 'Configuración',
    icon: UserRoundCog,
    links: [{ href: '/trabajadores', label: 'Trabajadores', icon: UserRoundCog }],
  },
];

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<UsuarioSesion | null>(null);
  const [ready, setReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // Con el sidebar compactado el submenú se abre al pasar el cursor. Al hacer clic en una
  // opción lo ocultamos hasta que el cursor salga del sidebar y vuelva a entrar.
  const [flyoutSuppressed, setFlyoutSuppressed] = useState(false);
  // Acordeón real: un solo grupo abierto a la vez. Abrir uno cierra el anterior.
  const [expandedGroup, setExpandedGroup] = useState<string | null>(() => {
    const activeGroup = groups.find((group) =>
      group.links.some(({ href }) => pathname === href || pathname.startsWith(`${href}/`)),
    );
    return activeGroup?.label ?? groups[0].label;
  });

  useEffect(() => {
    // Hace falta el token Y los datos del usuario. Si falta cualquiera de los dos la sesión
    // está a medias: se limpia y se manda al login, en vez de quedarse en "Cargando...".
    const almacenado = obtenerUsuarioGuardado();
    if (!obtenerToken() || !almacenado) {
      limpiarSesion();
      router.replace('/login');
      return;
    }
    setUser(almacenado);
    setReady(true);
    setSidebarCollapsed(window.localStorage.getItem('torito-sidebar-collapsed') === 'true');
  }, [router]);

  // Menú visible según el rol. `visibleGroups` descarta links no permitidos y grupos
  // que quedan vacíos; `aliasRuta` renombra ítems por rol (p. ej. "Productos disponibles").
  const visibleGroups = useMemo(() => {
    const role = user?.role;
    return groups
      .map((group) => ({
        ...group,
        links: group.links
          .filter((link) => puedeVer(role, link.href))
          .map((link) => ({ ...link, label: aliasRuta(role, link.href) ?? link.label })),
      }))
      .filter((group) => group.links.length > 0);
  }, [user]);
  const visibleLinks = useMemo(
    () => visibleGroups.flatMap((group) => group.links),
    [visibleGroups],
  );

  // Guarda de ruta: si el rol no puede ver la ruta actual, lo mandamos al inicio.
  useEffect(() => {
    if (user && !puedeVer(user.role, pathname)) router.replace('/dashboard');
  }, [user, pathname, router]);

  // Cierra la sesión sola cuando vence el token, avisando por qué.
  useEffect(() => {
    const venceEn = obtenerVencimientoSesion();
    const cerrarSesion = () => {
      limpiarSesion();
      toast.info('Tu sesión expiró. Vuelve a iniciar sesión.');
      router.replace('/login');
    };
    if (!venceEn || venceEn <= Date.now()) {
      cerrarSesion();
      return;
    }
    const timeout = window.setTimeout(cerrarSesion, venceEn - Date.now());
    return () => window.clearTimeout(timeout);
  }, [router]);

  const toggleSidebar = () => {
    setSidebarCollapsed((collapsed) => {
      const nextValue = !collapsed;
      window.localStorage.setItem('torito-sidebar-collapsed', String(nextValue));
      return nextValue;
    });
  };

  useEffect(() => {
    setMenuOpen(false);
    const activeGroup = groups.find((group) =>
      group.links.some(({ href }) => pathname === href || pathname.startsWith(`${href}/`)),
    );
    if (activeGroup) setExpandedGroup(activeGroup.label);
  }, [pathname]);

  const toggleGroup = (label: string) => {
    setExpandedGroup((current) => (current === label ? null : label));
  };

  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [menuOpen]);

  // Mientras no se confirme la sesión no se montan las pantallas de adentro. Si se montaran,
  // cada una lanzaría sus consultas al API sin token, el API respondería 401 y el usuario
  // vería el panel parpadear, una recarga y varios mensajes de error sobre el login.
  if (!ready) {
    return (
      <div className="app-shell">
        <main className="app-main" id="main-content" tabIndex={-1}>
          <div className="table-loading" role="status">
            <span className="loading-spinner" /> Cargando...
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={sidebarCollapsed ? 'app-shell sidebar-is-collapsed' : 'app-shell'}>
      <a className="skip-link" href="#main-content">
        Saltar al contenido
      </a>
      <aside
        className={`desktop-sidebar${sidebarCollapsed ? ' collapsed' : ''}${
          flyoutSuppressed ? ' flyout-suppressed' : ''
        }`}
        onMouseLeave={() => setFlyoutSuppressed(false)}
      >
        <div className="sidebar-brand">
          <span className="sidebar-logo">
            <img src="/torito-logo.jpg" alt="Torito Fresh" />
          </span>
        </div>
        <nav className="sidebar-nav" aria-label="Navegacion lateral">
          {visibleGroups.map((group) => {
            const groupActive = group.links.some(
              ({ href }) => pathname === href || pathname.startsWith(`${href}/`),
            );
            const expanded = expandedGroup === group.label;
            const GroupIcon = group.icon;
            return (
              <section
                className={`sidebar-group${groupActive ? ' active' : ''}${expanded ? ' expanded' : ''}`}
                key={group.label}
              >
                <button
                  className="sidebar-group-trigger"
                  type="button"
                  onClick={() => toggleGroup(group.label)}
                  aria-expanded={expanded}
                  aria-controls={`sidebar-group-${group.label.toLowerCase().replaceAll(' ', '-')}`}
                  aria-label={sidebarCollapsed ? `${group.label}: mostrar subapartados` : undefined}
                >
                  <GroupIcon size={18} />
                  <strong>{group.label}</strong>
                  <ChevronRight className="sidebar-group-chevron" size={15} />
                </button>
                <div
                  className="sidebar-submenu"
                  id={`sidebar-group-${group.label.toLowerCase().replaceAll(' ', '-')}`}
                >
                  <div className="sidebar-submenu-title">
                    <GroupIcon size={17} />
                    <strong>{group.label}</strong>
                  </div>
                  <div className="sidebar-submenu-links">
                    {group.links.map(({ href, label, icon: Icon }) => {
                      const active = pathname === href || pathname.startsWith(`${href}/`);
                      return (
                        <Link
                          aria-current={active ? 'page' : undefined}
                          className={active ? 'sidebar-link active' : 'sidebar-link'}
                          href={href}
                          key={href}
                          onClick={(event) => {
                            setFlyoutSuppressed(true);
                            event.currentTarget.blur();
                          }}
                        >
                          <Icon size={16} />
                          <span>{label}</span>
                        </Link>
                      );
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
          <button
            className="sidebar-collapse-button"
            type="button"
            onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? 'Expandir barra lateral' : 'Contraer barra lateral'}
            title={sidebarCollapsed ? 'Expandir barra lateral' : 'Contraer barra lateral'}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
          <div>
            <strong>{user?.name ?? 'Administrador'}</strong>
            <span>{user?.role ?? 'ADMIN'}</span>
          </div>
        </div>
        <div className="admin-actions">
          <ThemeToggle />
          <button
            type="button"
            className="admin-logout"
            onClick={() => {
              limpiarSesion();
              router.replace('/login');
            }}
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
          >
            <LogOut size={16} />
            <span>Salir</span>
          </button>
          <button
            className="menu-button"
            onClick={() => setMenuOpen((value) => !value)}
            title={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
            aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={menuOpen}
            aria-controls="mobile-navigation"
            type="button"
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      {menuOpen ? (
        <>
          <button
            className="app-menu-backdrop"
            type="button"
            aria-label="Cerrar menú"
            onClick={() => setMenuOpen(false)}
          />
          <nav className="app-menu" id="mobile-navigation" aria-label="Menú principal">
            <div className="app-menu-title">
              <span>Navegación</span>
              <small>Selecciona una sección</small>
            </div>
            {visibleLinks.map(({ href, label, icon: Icon }) => (
              <Link
                aria-current={
                  pathname === href || pathname.startsWith(`${href}/`) ? 'page' : undefined
                }
                className={
                  pathname === href || pathname.startsWith(`${href}/`)
                    ? 'app-menu-link active'
                    : 'app-menu-link'
                }
                href={href}
                key={href}
                onClick={() => setMenuOpen(false)}
              >
                <Icon size={16} />
                {label}
              </Link>
            ))}
          </nav>
        </>
      ) : null}

      <main className="app-main" id="main-content" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
