'use client';

import {
  Ban,
  Boxes,
  Check,
  Eye,
  HandCoins,
  Pencil,
  Plus,
  Printer,
  ReceiptText,
  Search,
  ShoppingCart,
  Wallet,
  Zap,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DataTable, DataTableColumn } from '../../../components/DataTable';
import { StatCard } from '../../../components/dashboard/StatCard';
import { AnnulSaleModal } from '../../../components/operations/AnnulSaleModal';
import { OperationDetailDialog } from '../../../components/operations/OperationDetailDialog';
import { RegisterCollectionModal } from '../../../components/operations/RegisterCollectionModal';
import { SaleReceipt } from '../../../components/operations/SaleReceipt';
import { PeriodFilter } from '../../../components/PeriodFilter';
import { useUnidad } from '../../../components/UnidadProvider';
import { Badge } from '../../../components/ui/Badge';
import { buttonClass } from '../../../components/ui/Button';
import { IconButton } from '../../../components/ui/IconButton';
import { fechaHora, moneda } from '../../../lib/format';
import {
  getOperationalAccounts,
  getOperationalPaymentMethods,
  getSales,
  OperationalAccount,
  OperationalPaymentMethod,
  Sale,
} from '../../../lib/operations';
import { puede } from '../../../lib/permissions';
import { usePermisos } from '../../../lib/useCurrentUser';

/** Una venta se puede editar mientras su único cobro sea el automático de la propia venta
 * (una venta al contado nace cobrada y aun así se debe poder corregir). Un cobro hecho después
 * desde Cobranzas, o una devolución confirmada, sí la bloquean: ver `OperationsService.updateSale`,
 * que aplica la misma regla en el servidor para no descuadrar la cuenta por cobrar. */
function esEditable(venta: Sale) {
  return (
    !venta.anulada &&
    venta.pagado <= venta.montoInicial + 0.005 &&
    venta.estadoDevolucion === 'SIN_DEVOLUCION'
  );
}

/** Anular se permite haya cobros o no; lo único que la descarta es que ya no quede nada por
 *  devolver. Misma regla que aplica `OperationsService.annulSale`. */
function esAnulable(venta: Sale) {
  return !venta.anulada && venta.estadoDevolucion !== 'DEVOLUCION_TOTAL';
}

export default function VentasPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [buscar, setBuscar] = useState('');
  const [pago, setPago] = useState('Todos');
  const [rango, setRango] = useState<{ from: string; to: string } | null>(null);
  const [etiquetaPeriodo, setEtiquetaPeriodo] = useState('');
  const [detalle, setDetalle] = useState<Sale | null>(null);
  const [boleta, setBoleta] = useState<Sale | null>(null);
  const [cobrarAccount, setCobrarAccount] = useState<OperationalAccount | null>(null);
  // La venta que se está por anular (null = modal cerrado).
  const [anulando, setAnulando] = useState<Sale | null>(null);
  const permisos = usePermisos();
  const { clave: unidad, resumen: unidadResumen } = useUnidad();
  // Quien solo crea y lee ventas no ve confirmaciones, cobranzas ni el resumen por cobrar.
  const editable = puede(permisos, 'ventas.editar');
  // Anular es su propio permiso: no es corregir, es deshacer y sacar plata de la caja.
  const anulable = puede(permisos, 'ventas.anular');

  const ventasQuery = useQuery({ queryKey: ['sales', unidad], queryFn: () => getSales() });
  const ventas = ventasQuery.data ?? [];
  const loading = ventasQuery.isPending;
  const load = ventasQuery.refetch;
  useEffect(() => {
    if (ventasQuery.error) {
      toast.error(
        ventasQuery.error instanceof Error
          ? ventasQuery.error.message
          : 'No se pudieron cargar las ventas',
        { action: { label: 'Reintentar', onClick: () => void ventasQuery.refetch() } },
      );
    }
  }, [ventasQuery.error, ventasQuery.refetch]);

  // El resumen por cobrar es informativo: si falla, no bloquea la lista de ventas (por eso no
  // hay toast de error acá, a diferencia de la consulta de arriba).
  const receivablesQuery = useQuery({
    queryKey: ['operational-accounts', 'cobrar', unidad],
    queryFn: () => getOperationalAccounts('cobrar'),
    enabled: editable,
  });
  const receivables = receivablesQuery.data ?? [];
  const methodsQuery = useQuery({
    queryKey: ['operational-payment-methods'],
    queryFn: getOperationalPaymentMethods,
    enabled: editable,
  });
  const methods = methodsQuery.data ?? [];

  const porCobrarTotal = receivables.reduce((sum, item) => sum + item.saldo, 0);
  const vencidasCount = receivables.filter((item) => item.estado === 'VENCIDA').length;

  const handlePeriod = useCallback((from: string, to: string, meta: { label: string }) => {
    setRango({ from, to });
    setEtiquetaPeriodo(meta.label);
  }, []);

  // Se cargan todas las ventas (más nuevas primero, orden del servidor); aquí solo se
  // refina por período, tipo de pago y texto, y DataTable pagina en el cliente.
  const filtradas = useMemo(
    () =>
      ventas.filter(
        (item) =>
          (pago === 'Todos' || item.pago === pago) &&
          (!rango ||
            (item.fecha.slice(0, 10) >= rango.from && item.fecha.slice(0, 10) <= rango.to)) &&
          `${item.codigo} ${item.cliente} ${item.almacen}`
            .toLowerCase()
            .includes(buscar.toLowerCase()),
      ),
    [buscar, pago, rango, ventas],
  );
  // Las anuladas quedan fuera de los indicadores: su `estado` sigue siendo CONFIRMADA (lo que
  // las anula es su devolución total), así que sin este filtro el contador diría "15
  // operaciones" con 13 de ellas dadas de baja. El monto ya salía bien porque usa el neto.
  const confirmed = filtradas.filter((item) => item.estado === 'CONFIRMADA' && !item.anulada);

  const columns: DataTableColumn<Sale>[] = [
    {
      key: 'venta',
      header: 'Venta',
      cardLabel: null,
      render: (item) => (
        <>
          <strong className="block text-[13px] font-medium text-fg">{item.codigo}</strong>
          <small className="mt-0.5 block text-[11px] text-muted">{fechaHora(item.fecha)}</small>
        </>
      ),
    },
    { key: 'cliente', header: 'Cliente', render: (item) => item.cliente },
    { key: 'origen', header: 'Origen', render: (item) => item.almacen },
    {
      key: 'pago',
      header: 'Pago',
      render: (item) => (
        <>
          <Badge tone={item.estadoPago === 'PAGADA' ? 'green' : 'amber'}>{item.estadoPago}</Badge>
          <small className="mt-0.5 block text-[11px] text-muted">Saldo {moneda(item.saldo)}</small>
        </>
      ),
    },
    {
      key: 'total',
      header: 'Total / neto',
      render: (item) => (
        <>
          <strong className="block text-[13px] font-medium text-fg">{moneda(item.total)}</strong>
          <small className="mt-0.5 block text-[11px] text-muted">
            Neto {moneda(item.totalNeto)}
          </small>
        </>
      ),
    },
    {
      key: 'inventario',
      header: 'Inventario',
      render: (item) =>
        item.kardexId ? (
          <Link
            className="kardex-link"
            href={`/movimientos?ref=${encodeURIComponent(item.kardexRef ?? '')}`}
          >
            <Check size={13} /> {item.kardexRef ?? 'Ver kardex'}
          </Link>
        ) : (
          <Badge tone="amber">Pendiente</Badge>
        ),
    },
    {
      key: 'estados',
      header: 'Estados',
      render: (item) => (
        <>
          {/* Una venta anulada sigue con estado CONFIRMADA en la base: lo que la anula es su
              devolución de tipo anulación. Acá se muestra lo que la persona necesita ver. */}
          <Badge tone={item.anulada ? 'red' : item.estado === 'CONFIRMADA' ? 'green' : 'amber'}>
            {item.anulada ? 'ANULADA' : item.estado}
          </Badge>
          <small className="mt-0.5 block text-[11px] text-muted">
            {item.anulada
              ? (item.motivoAnulacion ?? 'Anulada')
              : item.estadoDevolucion.replaceAll('_', ' ')}
          </small>
        </>
      ),
    },
    {
      key: 'acciones',
      header: 'Acciones',
      cardLabel: null,
      render: (item) => (
        <div className="flex flex-wrap gap-[7px]">
          <IconButton
            onClick={() => setDetalle(item)}
            title="Ver venta"
            aria-label={`Ver ${item.codigo}`}
          >
            <Eye size={16} />
          </IconButton>
          <IconButton
            onClick={() => setBoleta(item)}
            title="Imprimir venta"
            aria-label={`Imprimir ${item.codigo}`}
          >
            <Printer size={16} />
          </IconButton>
          {editable && esEditable(item) ? (
            <IconButton
              onClick={() => router.push(`/ventas/${item.id}/editar`)}
              title="Editar venta"
              aria-label={`Editar ${item.codigo}`}
            >
              <Pencil size={16} />
            </IconButton>
          ) : null}
          {anulable && esAnulable(item) ? (
            <IconButton
              tone="danger"
              onClick={() => setAnulando(item)}
              title="Anular venta"
              aria-label={`Anular ${item.codigo}`}
            >
              <Ban size={16} />
            </IconButton>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="module-page operations-list-page">
      <div className="operation-list-head">
        <div>
          <span className="operation-eyebrow">Operaciones</span>
          <h1>{`Ventas${etiquetaPeriodo ? ` · ${etiquetaPeriodo}` : ''}`}</h1>
          {unidadResumen ? (
            <span className="report-scope-caption">Alcance: {unidadResumen}</span>
          ) : null}
        </div>
        <div className="operation-head-actions">
          {puede(permisos, 'ventas.registrar') ? (
            <Link
              className={buttonClass('primary', 'min-h-[44px] shrink-0 px-[19px]')}
              href="/ventas/rapida"
            >
              <Zap size={18} /> Venta rápida
            </Link>
          ) : null}
          <Link
            className={buttonClass('secondary', 'min-h-[44px] shrink-0 px-[19px]')}
            href="/ventas/nueva"
          >
            <Plus size={18} /> Nueva venta
          </Link>
        </div>
      </div>
      <div className="stat-grid">
        <StatCard
          icon={<ReceiptText size={19} />}
          label="Ventas confirmadas"
          value={moneda(confirmed.reduce((sum, item) => sum + item.totalNeto, 0))}
          detail={`${confirmed.length} operaciones`}
          tone="blue"
        />
        <StatCard
          icon={<Wallet size={19} />}
          label="Cobrado"
          value={moneda(confirmed.reduce((sum, item) => sum + item.pagado, 0))}
          detail="Pagos recibidos"
          tone="green"
        />
        {editable ? (
          <StatCard
            icon={<HandCoins size={19} />}
            label="Por cobrar (total)"
            value={moneda(porCobrarTotal)}
            detail={
              vencidasCount > 0 ? `${vencidasCount} vencidas · ir a Cobranzas` : 'Ir a Cobranzas'
            }
            tone="red"
            href="/cobranzas"
          />
        ) : null}
        <StatCard
          icon={<Boxes size={19} />}
          label="Con kardex"
          value={confirmed.filter((item) => item.kardexId).length}
          detail="Ventas que movieron stock"
          tone="violet"
        />
      </div>

      <PeriodFilter defaultPeriod="month" onChange={handlePeriod} />

      <div className="module-tools operations-filters">
        <label className="pill-search">
          <Search size={17} />
          <input
            value={buscar}
            onChange={(event) => setBuscar(event.target.value)}
            placeholder="Buscar venta, cliente o almacén"
          />
        </label>
        <label className="filter-field">
          <span>Tipo de pago</span>
          <select
            className="filter-pill"
            value={pago}
            onChange={(event) => setPago(event.target.value)}
          >
            <option>Todos</option>
            <option>CONTADO</option>
            <option>CREDITO</option>
            <option>MIXTO</option>
          </select>
        </label>
      </div>

      {loading ? (
        <div className="table-loading" role="status">
          <span className="loading-spinner" /> Cargando ventas...
        </div>
      ) : ventas.length === 0 ? (
        <div className="empty-state">
          <ShoppingCart size={34} />
          <h2>Aún no hay ventas</h2>
          <p>Registra la primera venta para comenzar a controlar tus ventas e inventario.</p>
          <Link className={buttonClass('primary')} href="/ventas/nueva">
            <Plus size={17} /> Registrar venta
          </Link>
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={filtradas}
          rowKey={(item) => item.id}
          emptyMessage={
            <div className="flex flex-col items-center gap-2.5">
              <Search size={22} />
              <span>No hay ventas que coincidan con los filtros.</span>
              <button
                type="button"
                className="text-accent underline"
                onClick={() => {
                  setBuscar('');
                  setPago('Todos');
                }}
              >
                Limpiar filtros
              </button>
            </div>
          }
        />
      )}

      {detalle ? (
        <OperationDetailDialog
          sale={detalle}
          onClose={() => setDetalle(null)}
          onEdit={
            editable && esEditable(detalle)
              ? () => router.push(`/ventas/${detalle.id}/editar`)
              : undefined
          }
          onRegisterCollection={
            editable && detalle.saldo > 0 && detalle.cuentaCobrarId
              ? () => {
                  const account = receivables.find((item) => item.id === detalle.cuentaCobrarId);
                  if (!account) {
                    toast.error('No se encontró la cuenta por cobrar de esta venta.');
                    return;
                  }
                  setCobrarAccount(account);
                  setDetalle(null);
                }
              : undefined
          }
          onAnular={anulable && esAnulable(detalle) ? () => setAnulando(detalle) : undefined}
        />
      ) : null}

      {cobrarAccount ? (
        <RegisterCollectionModal
          tipo="cobrar"
          cuenta={cobrarAccount}
          metodos={methods}
          onClose={() => setCobrarAccount(null)}
          onDone={(updated) => {
            queryClient.setQueryData<OperationalAccount[]>(
              ['operational-accounts', 'cobrar'],
              (current) => current?.map((item) => (item.id === updated.id ? updated : item)),
            );
            setCobrarAccount(null);
            // El cobro cambió `pagado`/`saldo` de la venta: se invalida en vez de parchear a
            // mano, porque `Sale` no vuelve en la respuesta del cobro.
            void queryClient.invalidateQueries({ queryKey: ['sales'] });
          }}
        />
      ) : null}

      {anulando ? (
        <AnnulSaleModal
          venta={anulando}
          metodos={methods}
          onClose={() => setAnulando(null)}
          onDone={() => {
            setAnulando(null);
            setDetalle(null);
            // La anulación toca la venta, el stock y las cuentas por cobrar: se recargan las
            // tres listas en vez de parchear a mano, porque ninguna vuelve en la respuesta.
            void queryClient.invalidateQueries({ queryKey: ['sales'] });
            void queryClient.invalidateQueries({ queryKey: ['operational-accounts', 'cobrar'] });
          }}
        />
      ) : null}

      {boleta ? <SaleReceipt sale={boleta} onClose={() => setBoleta(null)} /> : null}
    </div>
  );
}
