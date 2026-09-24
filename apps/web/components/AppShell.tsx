'use client';

import {
  ArrowLeftRight,
  BarChart3,
  Boxes,
  CalendarClock,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  Eye,
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
  Building2,
  ShieldCheck,
  ShoppingCart,
  Store,
  Truck,
  UserRoundCog,
  Users,
  WalletCards,
  X,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  api,
  guardarSesion,
  limpiarSesion,
  obtenerVencimientoSesion,
  obtenerUsuarioGuardado,
  obtenerToken,
  UsuarioSesion,
} from '../lib/api';
import { aliasRuta, puede, puedeVer } from '../lib/permissions';
import { ThemeToggle } from './ThemeToggle';
import { useUnidad } from './UnidadProvider';

/** Iniciales para el avatar: "Juan Pérez Soto" → "JP". */
function iniciales(nombre: string) {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '?';
  return (partes[0][0] + (partes[1]?.[0] ?? '')).toUpperCase();
}

/**
 * Quién está usando la app, al pie del menú lateral: nombre, cargo y unidad de negocio.
 *
 * El CARGO y el ROL no son lo mismo y por eso se muestra el cargo cuando existe: el cargo es
 * cómo se llama el puesto de la persona ("Almacenero") y el rol es qué puede hacer en el
 * sistema ("Vendedor"). Quien no tiene trabajador vinculado no tiene cargo, y ahí se muestra
 * el rol, que es lo único que la describe.
 *
 * La unidad sigue la misma regla que el resto de la app: quien puede elegir unidad ve la que
 * está mirando ahora (que puede ser "Todas las unidades"), y quien no, la suya.
 */
function IdentidadUsuario({
  user,
  colapsado,
  variant = 'sidebar',
}: {
  user: UsuarioSesion | null;
  colapsado: boolean;
  variant?: 'sidebar' | 'menu';
}) {
  const { resumen, disponibles } = useUnidad();
  const permisos = user?.permisos ?? [];
  if (!user) return null;

  const cargo = user.cargo || user.rolNombre || '';
  const unidad = puede(permisos, 'unidades.elegir')
    ? disponibles.length > 0
      ? resumen
      : ''
    : (user.unidad ?? '');
  const resumenCompleto = [user.name, cargo, unidad].filter(Boolean).join(' · ');

  const surface =
    variant === 'menu'
      ? 'mb-1 rounded-ui border border-line bg-surface-soft'
      : 'border-t border-line bg-surface';

  return (
    <div
      className={`flex flex-none items-center gap-2.5 py-3 ${colapsado ? 'justify-center px-2.5' : 'px-3.5'} ${surface}`}
      title={colapsado ? resumenCompleto : undefined}
    >
      <span
        aria-hidden="true"
        className="flex h-[34px] w-[34px] flex-[0_0_34px] items-center justify-center rounded-control bg-accent-soft text-[13px] font-semibold text-accent-soft-text"
      >
        {iniciales(user.name)}
      </span>
      {colapsado ? null : (
        <div className="flex min-w-0 flex-col gap-px">
          <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-[13px] text-fg">
            {user.name}
          </strong>
          {cargo ? (
            <span className="overflow-hidden text-ellipsis whitespace-nowrap text-xs text-muted">
              {cargo}
            </span>
          ) : null}
          {unidad ? (
            <small className="flex items-center gap-1 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-muted">
              <Building2 size={11} aria-hidden="true" className="shrink-0" />
              {unidad}
            </small>
          ) : null}
        </div>
      )}
    </div>
  );
}

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
      { href: '/proveedores', label: 'Proveedores', icon: Truck },
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
      { href: '/ventas/rapida', label: 'Venta rápida', icon: Zap },
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
      { href: '/conteo-inventario', label: 'Conteo y cuadre', icon: ClipboardCheck },
      { href: '/movimientos', label: 'Kardex', icon: ArrowLeftRight },
    ],
  },
  {
    label: 'Caja y cuentas',
    icon: WalletCards,
    links: [
      { href: '/cobranzas', label: 'Cobranzas', icon: WalletCards },
      { href: '/metodos-pago', label: 'Métodos de pago', icon: CreditCard },
      { href: '/carga-diaria', label: 'Carga diaria', icon: ClipboardList },
    ],
  },
  {
    label: 'Reportes',
    icon: ReceiptText,
    links: [
      { href: '/reportes/resumen', label: 'Resumen diario', icon: BarChart3 },
      { href: '/reportes/ventas', label: 'Reporte de ventas', icon: ReceiptText },
      { href: '/reportes/trabajadores', label: 'Reporte por trabajador', icon: UserRoundCog },
      { href: '/reportes/gastos', label: 'Reporte de gastos', icon: Truck },
      { href: '/reportes/stock', label: 'Stock actual', icon: Boxes },
    ],
  },
  {
    label: 'Configuración',
    icon: UserRoundCog,
    links: [
      { href: '/trabajadores', label: 'Trabajadores', icon: UserRoundCog },
      { href: '/unidades-negocio', label: 'Unidades de negocio', icon: Building2 },
      { href: '/unidades-visibles', label: 'Unidades que veo', icon: Eye },
      { href: '/roles', label: 'Roles y permisos', icon: ShieldCheck },
    ],
  },
];

/** Botón/enlace disparador de un grupo del sidebar de escritorio, en sus cuatro combinaciones:
 *  compactado o expandido, cruzado con si el grupo está activo (contiene la página actual). */
function sidebarTriggerClass({
  collapsed,
  active,
  isSingle,
}: {
  collapsed: boolean;
  active: boolean;
  isSingle: boolean;
}) {
  const base =
    'relative flex items-center gap-[9px] text-muted no-underline transition-colors duration-150';
  if (collapsed) {
    const tone = active
      ? 'bg-accent-soft text-accent-soft-text'
      : 'hover:bg-surface-hover hover:text-fg';
    return `${base} h-[42px] w-[48px] cursor-pointer justify-center rounded-xl ${tone}`;
  }
  const cursor = isSingle ? 'cursor-pointer' : 'cursor-default';
  const hover = isSingle
    ? ''
    : 'hover:bg-[color-mix(in_srgb,var(--surface-hover)_70%,transparent)]';
  const tone = active ? (isSingle ? 'bg-accent-soft text-accent-soft-text' : 'text-fg') : '';
  return `${base} min-h-[37px] w-full ${cursor} justify-start rounded-[11px] px-[5px] py-[7px] ${hover} ${tone}`;
}

const sidebarLabelClass =
  'flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-sm font-medium text-fg';

/** El submenú de un grupo del sidebar: acordeón embebido si está expandido, popover flotante
 *  (abre con el mouse) si está compactado. */
function sidebarSubmenuClass({
  collapsed,
  expanded,
  suppressed,
}: {
  collapsed: boolean;
  expanded: boolean;
  suppressed: boolean;
}) {
  if (!collapsed) return expanded ? 'grid gap-[2px]' : 'hidden';
  const forced = suppressed ? '!opacity-0 !invisible !pointer-events-none' : '';
  return [
    'invisible absolute -top-[5px] left-[calc(100%+11px)] z-[60] w-[224px] -translate-x-1 rounded-[14px]',
    'border border-line bg-surface p-[7px] opacity-0 shadow-flyout pointer-events-none',
    'transition-[opacity,transform,visibility] duration-150 ease-out',
    "before:absolute before:top-0 before:right-full before:h-[50px] before:w-[13px] before:content-['']",
    'group-hover:visible group-hover:translate-x-0 group-hover:opacity-100 group-hover:pointer-events-auto',
    'group-focus-within:visible group-focus-within:translate-x-0 group-focus-within:opacity-100 group-focus-within:pointer-events-auto',
    forced,
  ].join(' ');
}

const sidebarLinkClass =
  'flex min-h-[34px] items-center gap-2 rounded-[9px] px-2.5 py-[6px] text-xs font-medium text-muted no-underline transition-colors duration-150 hover:bg-surface-hover hover:text-fg aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent-soft-text aria-[current=page]:hover:bg-accent-soft';

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { clave: unidadClave, controlaInventario } = useUnidad();
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

    // Refresco silencioso: si el rol o la unidad cambiaron, el menú y el selector se
    // acomodan solos. Un 401 lo maneja `api()`, que limpia la sesión y manda al login.
    api<UsuarioSesion>('/auth/me')
      .then((actual) => {
        const token = obtenerToken();
        if (!token) return;
        guardarSesion(token, actual);
        setUser(actual);
      })
      .catch(() => {
        // Sin conexión no se toca la sesión guardada: la pantalla sigue con lo que había.
      });
  }, [router]);

  // Menú visible según los PERMISOS y según la unidad en la que se está trabajando: un puesto
  // que solo registra ventas y gastos no tiene Producción, Lotes, Almacenes ni Kardex. Los
  // grupos que quedan sin links se descartan enteros; `aliasRuta` renombra ítems (p. ej.
  // "Productos disponibles" para quien no administra el catálogo).
  //
  // Antes esto filtraba por el nombre del rol, y por eso un rol creado desde el panel no veía
  // ninguna pantalla por más permisos que se le marcaran: no estaba en la lista de los cinco.
  const visibleGroups = useMemo(() => {
    const permisos = user?.permisos ?? [];
    const contextoUnidad = { controlaInventario };
    return groups
      .map((group) => ({
        ...group,
        links: group.links
          .filter((link) => puedeVer(permisos, link.href, contextoUnidad))
          .map((link) => ({ ...link, label: aliasRuta(permisos, link.href) ?? link.label })),
      }))
      .filter((group) => group.links.length > 0);
    // `controlaInventario` tiene que estar acá: sin él, al cambiar de unidad el menú se queda
    // congelado con el de la anterior y no hay ningún error que lo delate.
  }, [user, controlaInventario]);

  // Guarda de ruta: si no corresponde ver la ruta actual, lo mandamos al inicio.
  useEffect(() => {
    if (user && !puedeVer(user.permisos ?? [], pathname, { controlaInventario }))
      router.replace('/dashboard');
  }, [user, pathname, router, controlaInventario]);

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
      <div className="min-h-screen">
        <main
          className="w-full pt-4 focus:outline-none desktop:pt-[22px]"
          id="main-content"
          tabIndex={-1}
        >
          <div className="table-loading" role="status">
            <span className="loading-spinner" /> Cargando...
          </div>
        </main>
      </div>
    );
  }

  return (
    <div
      className={`min-h-screen px-[10px] py-0 tablet:px-4 desktop:py-0 desktop:pr-5 desktop:pb-[34px] desktop:transition-[padding-left] desktop:duration-200 desktop:ease-linear print:!m-0 print:!block print:!p-0 ${
        sidebarCollapsed ? 'desktop:pl-[88px]' : 'desktop:pl-[252px]'
      }`}
      // Lo lee el CSS de las barras fijas de acciones (`.operation-sticky-actions`), que se
      // corren a la izquierda cuando la barra lateral está compactada.
      data-sidebar={sidebarCollapsed ? 'collapsed' : 'expanded'}
    >
      <a
        className="fixed left-3 top-[10px] z-[120] -translate-y-[160%] rounded-[10px] bg-accent px-3.5 py-2.5 text-white no-underline transition-transform duration-150 ease-out focus:translate-y-0 print:!hidden"
        href="#main-content"
      >
        Saltar al contenido
      </a>
      <aside
        className={`fixed inset-y-0 left-0 z-[35] hidden overflow-hidden rounded-r-[18px] border-0 border-r border-line bg-surface transition-[width] duration-200 ease desktop:flex desktop:flex-col desktop:overflow-visible print:!hidden ${
          sidebarCollapsed ? 'w-[68px]' : 'w-[232px]'
        }`}
        onMouseLeave={() => setFlyoutSuppressed(false)}
      >
        <div
          className={`relative flex min-h-16 items-center border-b border-line ${
            sidebarCollapsed ? 'justify-center p-2' : 'justify-start py-0 pl-3.5 pr-2.5'
          }`}
        >
          <span
            className={`flex w-[42px] flex-[0_0_42px] items-center justify-center overflow-hidden bg-transparent ${
              sidebarCollapsed ? 'h-9 rounded-[10px]' : 'h-[62px] rounded-[13px]'
            }`}
          >
            <img
              src="/torito-logo.jpg"
              alt="Torito Fresh"
              className={`block w-full object-contain ${sidebarCollapsed ? 'h-auto' : 'h-full'}`}
            />
          </span>
        </div>
        <nav
          className={`min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin] desktop:overflow-visible ${
            sidebarCollapsed ? 'px-2 pt-2.5 pb-[18px]' : 'px-3 pt-3.5 pb-6'
          }`}
          aria-label="Navegacion lateral"
        >
          {visibleGroups.map((group) => {
            const groupActive = group.links.some(
              ({ href }) => pathname === href || pathname.startsWith(`${href}/`),
            );
            // Grupos con un solo destino: sin acordeón, enlace directo.
            if (group.links.length === 1) {
              const single = group.links[0];
              const SingleIcon = single.icon;
              const singleActive =
                pathname === single.href || pathname.startsWith(`${single.href}/`);
              return (
                <section
                  className={sidebarCollapsed ? 'mb-1 grid justify-items-center' : 'mb-[3px]'}
                  key={group.label}
                >
                  <Link
                    className={sidebarTriggerClass({
                      collapsed: sidebarCollapsed,
                      active: singleActive,
                      isSingle: true,
                    })}
                    href={single.href}
                    aria-current={singleActive ? 'page' : undefined}
                    aria-label={sidebarCollapsed ? single.label : undefined}
                    title={sidebarCollapsed ? single.label : undefined}
                    onClick={(event) => {
                      setFlyoutSuppressed(true);
                      event.currentTarget.blur();
                    }}
                  >
                    <SingleIcon size={18} className="shrink-0" />
                    {sidebarCollapsed ? null : (
                      <strong className={sidebarLabelClass}>{single.label}</strong>
                    )}
                  </Link>
                </section>
              );
            }
            const expanded = expandedGroup === group.label;
            const GroupIcon = group.icon;
            return (
              <section
                className={`group relative ${sidebarCollapsed ? 'mb-1 grid justify-items-center' : 'mb-[3px]'}`}
                key={group.label}
              >
                <button
                  className={sidebarTriggerClass({
                    collapsed: sidebarCollapsed,
                    active: groupActive,
                    isSingle: false,
                  })}
                  type="button"
                  onClick={() => toggleGroup(group.label)}
                  aria-expanded={expanded}
                  aria-controls={`sidebar-group-${group.label.toLowerCase().replaceAll(' ', '-')}`}
                  aria-label={sidebarCollapsed ? `${group.label}: mostrar subapartados` : undefined}
                >
                  <GroupIcon size={18} className="shrink-0" />
                  {sidebarCollapsed ? null : (
                    <strong className={sidebarLabelClass}>{group.label}</strong>
                  )}
                  {sidebarCollapsed ? null : (
                    <ChevronRight
                      size={15}
                      className={`ml-auto shrink-0 text-muted opacity-65 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
                    />
                  )}
                </button>
                <div
                  className={sidebarSubmenuClass({
                    collapsed: sidebarCollapsed,
                    expanded,
                    suppressed: flyoutSuppressed,
                  })}
                  id={`sidebar-group-${group.label.toLowerCase().replaceAll(' ', '-')}`}
                >
                  {sidebarCollapsed ? (
                    <div className="mb-[5px] flex min-h-[36px] items-center gap-2 border-b border-line px-[7px] pb-2 pt-0.5 text-fg">
                      <GroupIcon size={17} className="shrink-0" />
                      <strong className="text-sm font-medium">{group.label}</strong>
                    </div>
                  ) : null}
                  <div
                    className={
                      sidebarCollapsed
                        ? 'grid gap-[2px]'
                        : "relative ml-[7px] mb-[5px] grid gap-[2px] pl-[18px] pt-px before:absolute before:bottom-1 before:left-[5px] before:top-px before:w-px before:bg-[color-mix(in_srgb,var(--border-strong)_46%,transparent)] before:content-['']"
                    }
                  >
                    {group.links.map(({ href, label, icon: Icon }) => {
                      const active = pathname === href || pathname.startsWith(`${href}/`);
                      return (
                        <Link
                          aria-current={active ? 'page' : undefined}
                          className={sidebarLinkClass}
                          href={href}
                          key={href}
                          onClick={(event) => {
                            setFlyoutSuppressed(true);
                            event.currentTarget.blur();
                          }}
                        >
                          <Icon size={16} className="shrink-0" />
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

        {/* Quién está adentro, al pie del menú: el nombre, su cargo y la unidad en la que
            está trabajando. Antes vivía en la barra de arriba, donde el nombre competía por
            lugar con los botones y en el celular directamente no entraba. Acá abajo hay sitio
            para las tres líneas y no se cruza con nada. */}
        <IdentidadUsuario user={user} colapsado={sidebarCollapsed} />
      </aside>

      <header className="sticky top-0 z-30 -mx-2.5 flex min-h-[60px] items-center justify-between gap-3 border-b border-line bg-surface px-4 tablet:-mx-4 tablet:min-h-16 tablet:px-5 desktop:-mx-5 desktop:px-5 print:!hidden">
        <div className="flex min-w-0 items-center gap-3">
          <button
            className="hidden h-[31px] w-[31px] flex-none place-items-center rounded-[9px] border border-line bg-surface-soft text-muted transition-colors duration-150 hover:border-line-strong hover:bg-surface-hover hover:text-accent desktop:grid"
            type="button"
            onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? 'Expandir barra lateral' : 'Contraer barra lateral'}
            title={sidebarCollapsed ? 'Expandir barra lateral' : 'Contraer barra lateral'}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>
        <div className="flex items-center gap-2">
          {/* La unidad que se está mirando y el rol con el que se trabaja salían acá como dos
              etiquetas. Se sacaron: la barra lateral ya las muestra al pie, junto al nombre de
              la persona, y repetirlas arriba llenaba la cabecera sin decir nada nuevo. */}
          {/* En el celular los botones de la barra son objetivos táctiles: 44px mínimo. */}
          <ThemeToggle className="max-[720px]:min-h-11 max-[720px]:min-w-11 max-[720px]:flex-none" />
          <button
            type="button"
            className="inline-flex min-h-[39px] flex-none items-center justify-center gap-[7px] rounded-full border border-line bg-surface px-3.5 text-xs font-medium text-muted transition-colors duration-150 hover:border-line-strong hover:bg-surface-hover hover:text-accent max-[720px]:min-h-11 max-[720px]:min-w-11"
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
            className="grid h-[39px] w-[39px] flex-none place-items-center rounded-full border border-line bg-surface text-muted max-[720px]:h-11 max-[720px]:w-11 desktop:hidden"
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
            className="fixed inset-0 z-[38] block cursor-default border-0 bg-[rgba(4,12,24,0.45)] dark:bg-[rgba(0,4,12,0.72)] desktop:hidden print:!hidden"
            type="button"
            aria-label="Cerrar menú"
            onClick={() => setMenuOpen(false)}
          />
          <nav
            className="fixed inset-y-0 right-0 z-40 block w-[min(86vw,360px)] overflow-y-auto rounded-l-[20px] border-0 border-l border-line bg-surface p-[10px] pb-[calc(10px+env(safe-area-inset-bottom))] [overscroll-behavior:contain] desktop:hidden print:!hidden"
            id="mobile-navigation"
            aria-label="Menú principal"
          >
            {/* En el celular no hay barra lateral, así que la identidad va acá arriba: es lo
                primero que se ve al abrir el menú y responde "¿con qué cuenta estoy?" sin
                tener que entrar a ninguna pantalla. */}
            <IdentidadUsuario user={user} colapsado={false} variant="menu" />
            <div className="mx-1 mb-[9px] mt-[3px] grid gap-0.5 border-b border-line px-2 pb-3 pt-[7px] text-fg">
              <span className="text-[17px]">Navegación</span>
              <small className="text-xs text-muted">Selecciona una sección</small>
            </div>
            {visibleGroups.map((group) => {
              const groupActive = group.links.some(
                ({ href }) => pathname === href || pathname.startsWith(`${href}/`),
              );
              // Igual que en el sidebar: un solo destino no necesita acordeón.
              if (group.links.length === 1) {
                const single = group.links[0];
                const SingleIcon = single.icon;
                return (
                  <Link
                    aria-current={groupActive ? 'page' : undefined}
                    className="my-[3px] flex min-h-11 items-center gap-2 rounded-[10px] border border-transparent px-3 text-sm text-muted no-underline aria-[current=page]:border-line-strong aria-[current=page]:bg-surface-hover aria-[current=page]:text-accent"
                    href={single.href}
                    key={group.label}
                    onClick={() => setMenuOpen(false)}
                  >
                    <SingleIcon size={16} className="shrink-0" />
                    {single.label}
                  </Link>
                );
              }
              const expanded = expandedGroup === group.label;
              const GroupIcon = group.icon;
              const panelId = `app-menu-group-${group.label.toLowerCase().replaceAll(' ', '-')}`;
              return (
                <section className="my-[3px]" key={group.label}>
                  <button
                    className={`flex min-h-[48px] w-full items-center gap-2.5 rounded-[10px] border border-transparent bg-transparent px-3 text-left text-sm font-semibold ${groupActive ? 'text-accent' : 'text-fg'}`}
                    type="button"
                    onClick={() => toggleGroup(group.label)}
                    aria-expanded={expanded}
                    aria-controls={panelId}
                  >
                    <GroupIcon size={18} className="shrink-0" />
                    <strong className="font-semibold">{group.label}</strong>
                    <ChevronRight
                      size={16}
                      className={`ml-auto text-muted transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
                    />
                  </button>
                  <div
                    className="ml-[13px] mt-0.5 mb-1.5 border-l border-line pl-[9px]"
                    id={panelId}
                    hidden={!expanded}
                  >
                    {group.links.map(({ href, label, icon: Icon }) => {
                      const active = pathname === href || pathname.startsWith(`${href}/`);
                      return (
                        <Link
                          aria-current={active ? 'page' : undefined}
                          className="my-[3px] flex min-h-11 items-center gap-2 rounded-[10px] border border-transparent px-3 text-sm text-muted no-underline aria-[current=page]:border-line-strong aria-[current=page]:bg-surface-hover aria-[current=page]:text-accent"
                          href={href}
                          key={href}
                          onClick={() => setMenuOpen(false)}
                        >
                          <Icon size={16} className="shrink-0" />
                          {label}
                        </Link>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </nav>
        </>
      ) : null}

      {/* La `key` remonta la pantalla al cambiar de unidad: así ninguna se queda mostrando
          los datos de la anterior porque su `load()` no dependía de la unidad. */}
      <main
        className="w-full pt-4 focus:outline-none desktop:pt-[22px] print:!m-0 print:!block print:!p-0"
        id="main-content"
        tabIndex={-1}
        key={unidadClave}
      >
        {children}
      </main>
    </div>
  );
}
