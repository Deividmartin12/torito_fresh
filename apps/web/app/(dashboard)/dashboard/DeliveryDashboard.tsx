'use client';

import { useQuery } from '@tanstack/react-query';
import { Droplet, HandCoins, ReceiptText, Wallet, Zap } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { EntityList } from '../../../components/dashboard/EntityList';
import { PanelCard } from '../../../components/dashboard/PanelCard';
import { StatCard } from '../../../components/dashboard/StatCard';
import { StatHero } from '../../../components/dashboard/StatHero';
import { useUnidad } from '../../../components/UnidadProvider';
import { buttonClass } from '../../../components/ui/Button';
import { estadoPagoLabel } from '../../../lib/credit';
import { getDeliverySummary } from '../../../lib/dashboard';
import { fechaCorta, moneda } from '../../../lib/format';
import { puede } from '../../../lib/permissions';
import { usePermisos } from '../../../lib/useCurrentUser';

/** Hora local de una venta, que es como el repartidor reconoce su propio recorrido. */
function hora(valor: string) {
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(valor));
}

export function DeliveryDashboard() {
  const permisos = usePermisos();
  const { clave: unidad, resumen: unidadResumen } = useUnidad();

  const query = useQuery({
    queryKey: ['delivery-summary', unidad],
    queryFn: getDeliverySummary,
  });
  const data = query.data ?? null;
  const loading = query.isPending;
  useEffect(() => {
    if (query.error) {
      toast.error(
        query.error instanceof Error ? query.error.message : 'No se pudo cargar el resumen',
        { action: { label: 'Reintentar', onClick: () => void query.refetch() } },
      );
    }
  }, [query.error, query.refetch]);

  const totales = data?.totales;

  return (
    <div className="module-page business-dashboard">
      <div className="dashboard-head">
        <div>
          <h1>Mi día</h1>
          <span className="operation-eyebrow dashboard-period-label">
            {[data ? fechaCorta(data.fecha) : '', unidadResumen].filter(Boolean).join(' · ')}
          </span>
        </div>
      </div>

      {/* La acción que abre veinte veces al día va arriba y a ancho completo, antes que
          cualquier número: el panel se mira de reojo, la venta se registra siempre. */}
      {puede(permisos, 'ventas.registrar') ? (
        <Link
          className={buttonClass('primary', 'flex min-h-[52px] mb-3 w-full gap-2.5 text-base')}
          href="/ventas/rapida"
        >
          <Zap size={18} /> Registrar venta rápida
        </Link>
      ) : null}

      {loading && !data ? (
        <div className="dashboard-loading" role="status">
          <span className="loading-spinner" /> Cargando tu resumen...
        </div>
      ) : null}

      {data ? (
        <>
          <StatHero
            label="Vendido hoy"
            value={moneda(totales?.monto)}
            chip={`${totales?.ventas ?? 0} ventas`}
            series={data.porHora.map((tramo) => tramo.monto)}
          />

          <section className="stat-grid" aria-label="Indicadores del día">
            {/* Lo primero es la caja: es el número con el que el repartidor tiene que rendir
                al final del día, y suma las dos plata que pasan por sus manos. */}
            <StatCard
              icon={<Wallet size={19} />}
              label="Caja del día"
              value={moneda(totales?.cajaDelDia)}
              detail={`${moneda(totales?.cobrado)} de ventas + ${moneda(totales?.cobradoDeudas)} de deudas`}
              tone="green"
            />
            <StatCard
              icon={<HandCoins size={19} />}
              label="Por cobrar"
              value={moneda(totales?.pendiente)}
              detail="Quedó pendiente de pago"
              tone="amber"
            />
            <StatCard
              icon={<Droplet size={19} />}
              label="Bidones entregados"
              value={totales?.bidones ?? 0}
              detail="Envases retornables del día"
              tone="blue"
            />
            <StatCard
              icon={<ReceiptText size={19} />}
              label="Ventas"
              value={totales?.ventas ?? 0}
              detail="Operaciones que registraste"
              tone="violet"
            />
          </section>

          <PanelCard title="Mis entregas de hoy">
            <EntityList
              rows={data.items.map((item) => ({
                id: item.codigo,
                icon: <Droplet size={18} />,
                tone: item.saldo > 0 ? ('amber' as const) : ('green' as const),
                title: item.cliente,
                meta: `${hora(item.fecha)} · ${item.codigo}`,
                amount: moneda(item.total),
                status: {
                  label: estadoPagoLabel[item.estadoPago] ?? item.estadoPago,
                  tone: item.estadoPago === 'PAGADA' ? ('green' as const) : ('amber' as const),
                },
              }))}
              empty="Todavía no registraste ventas hoy."
            />
          </PanelCard>
        </>
      ) : null}
    </div>
  );
}
