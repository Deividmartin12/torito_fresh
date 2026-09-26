'use client';

import { CalendarClock, Check, History, Minus, Plus, Search, Zap } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Cliente } from '../../lib/clients';
import { evaluarCredito, resumenCredito } from '../../lib/credito';
import { cargarParcial } from '../../lib/cargar';
import { fechaCorta, moneda, normalizarBusqueda } from '../../lib/format';
import {
  CatalogItem,
  LastSale,
  OperationCatalogs,
  OperationalPaymentMethod,
  Sale,
  createSale,
  emptyCatalogs,
  getLastSale,
  getOperationCatalogs,
  getOperationalPaymentMethods,
} from '../../lib/operations';
import { puede } from '../../lib/permissions';
import { usePermisos } from '../../lib/useCurrentUser';
import { ClienteFormModal } from '../ClienteFormModal';
import { SearchableSelect } from '../SearchableSelect';
import { Button } from '../ui/Button';
import { SaleReceipt } from './SaleReceipt';

/** Plazos de fiado que se ofrecen de un toque. Cualquier otro va por la venta completa. */
const PLAZOS = [7, 15, 30];

/** Fecha de hoy más `dias`, en formato YYYY-MM-DD y hora local. */
function enDias(dias: number) {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + dias);
  return new Date(fecha.getTime() - fecha.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

/**
 * Venta express: cliente, productos con botones de más y menos, cobro de un toque y listo.
 *
 * Cubre la venta típica de mostrador y de reparto —contado o fiado a plazo redondo— y deja
 * para `OperationForm` todo lo demás: descuentos, pagos mixtos, elegir almacén o lote y
 * corregir una venta ya registrada.
 */
export function QuickSaleForm() {
  const [catalogs, setCatalogs] = useState<OperationCatalogs>(emptyCatalogs);
  const [metodos, setMetodos] = useState<OperationalPaymentMethod[]>([]);
  const [cargando, setCargando] = useState(true);
  const [clienteId, setClienteId] = useState('');
  const [clienteModal, setClienteModal] = useState(false);
  const [ultima, setUltima] = useState<LastSale | null>(null);
  // Cantidad por producto. Un producto fuera del mapa (o en cero) simplemente no se vende.
  const [cantidades, setCantidades] = useState<Record<string, number>>({});
  const [metodoPagoId, setMetodoPagoId] = useState('');
  const [fiado, setFiado] = useState(false);
  const [plazo, setPlazo] = useState(PLAZOS[0]);
  const [buscar, setBuscar] = useState('');
  // Vacíos que el cliente entrega ahora. Mientras no se toque el contador sigue al carrito
  // (intercambio uno a uno); en cuanto el repartidor lo ajusta, manda lo que él puso.
  const [vacios, setVacios] = useState(0);
  const [vaciosTocados, setVaciosTocados] = useState(false);
  const [guardando, setGuardando] = useState(false);
  // Quien tiene el permiso de excepción no queda trabado por el límite de crédito.
  const puedeExcepcion = puede(usePermisos(), 'creditos.excepcion');
  const [boleta, setBoleta] = useState<Sale | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const [cat, pagos] = await cargarParcial([
      getOperationCatalogs(),
      getOperationalPaymentMethods(),
    ] as const);
    if (cat.valor) setCatalogs(cat.valor);
    if (pagos.valor) setMetodos(pagos.valor);
    setCargando(false);
    const error = cat.error ?? pagos.error;
    if (error) {
      toast.error(error.message || 'No se pudo preparar la venta', {
        action: { label: 'Reintentar', onClick: () => void cargar() },
      });
    }
  }, []);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  // El pedido anterior del cliente es lo que convierte la venta de siempre en un solo toque.
  useEffect(() => {
    if (!clienteId) {
      setUltima(null);
      return;
    }
    let vigente = true;
    getLastSale(clienteId)
      .then((venta) => {
        if (vigente) setUltima(venta);
      })
      .catch(() => {
        if (vigente) setUltima(null);
      });
    return () => {
      vigente = false;
    };
  }, [clienteId]);

  const cliente = catalogs.clientes.find((item) => item.id === clienteId);
  const precioDe = useCallback((producto: CatalogItem) => producto.precioVenta ?? 0, []);

  const lineas = useMemo(
    () =>
      catalogs.productos
        .filter((producto) => (cantidades[producto.id] ?? 0) > 0)
        .map((producto) => ({
          producto,
          cantidad: cantidades[producto.id],
          // Redondeo al centavo, la misma fórmula del servidor: lo que se ve es lo que se guarda.
          importe: Math.round(cantidades[producto.id] * precioDe(producto) * 100) / 100,
        })),
    [cantidades, catalogs.productos, precioDe],
  );
  const total = Math.round(lineas.reduce((suma, linea) => suma + linea.importe, 0) * 100) / 100;

  // Envases que se está llevando el cliente en esta venta. En ruta el caso normal es el
  // intercambio uno a uno, así que el contador arranca en esa cantidad y solo se baja cuando
  // el cliente se queda con los vacíos.
  const envasesEntregados = lineas.reduce(
    (suma, linea) => suma + (linea.producto.esRetornable ? linea.cantidad : 0),
    0,
  );
  const vaciosMaximos = envasesEntregados + (cliente?.saldoEnvases ?? 0);
  const resumen = resumenCredito(cliente);
  // La venta rápida solo tiene contado o fiado: fiado deja a deber el total.
  const avisoCredito = evaluarCredito(cliente, fiado ? total : 0);
  useEffect(() => {
    if (!vaciosTocados) setVacios(envasesEntregados);
  }, [envasesEntregados, vaciosTocados]);

  const visibles = useMemo(() => {
    const texto = normalizarBusqueda(buscar);
    if (!texto) return catalogs.productos;
    return catalogs.productos.filter((producto) =>
      normalizarBusqueda(
        `${producto.tipo ?? ''} ${producto.nombre} ${producto.codigo ?? ''}`,
      ).includes(texto),
    );
  }, [buscar, catalogs.productos]);

  function sumar(productoId: string, paso: number) {
    setCantidades((actual) => {
      const siguiente = Math.max((actual[productoId] ?? 0) + paso, 0);
      const copia = { ...actual };
      if (siguiente === 0) delete copia[productoId];
      else copia[productoId] = siguiente;
      return copia;
    });
  }

  /** Sube o baja los vacíos, sin pasarse de lo que el cliente puede devolver. */
  function ajustarVacios(paso: number) {
    setVaciosTocados(true);
    setVacios((actual) => Math.min(Math.max(actual + paso, 0), vaciosMaximos));
  }

  function repetirUltimo() {
    if (!ultima) return;
    const repetido: Record<string, number> = {};
    for (const item of ultima.items) {
      // Se repite qué y cuánto, nunca a cuánto: el precio que manda es el vigente del producto.
      repetido[item.productoId] = (repetido[item.productoId] ?? 0) + Math.round(item.cantidad);
    }
    setCantidades(repetido);
  }

  function limpiar() {
    setCantidades({});
    setClienteId('');
    setUltima(null);
    setMetodoPagoId('');
    setFiado(false);
    setBuscar('');
    setVacios(0);
    setVaciosTocados(false);
  }

  function clienteCreado(nuevo: Cliente) {
    setCatalogs((actual) => ({
      ...actual,
      clientes: [
        {
          id: nuevo.id,
          nombre: nuevo.name,
          documento: nuevo.document ?? undefined,
          deudaActual: 0,
          comprobantesPendientes: 0,
        },
        ...actual.clientes,
      ],
    }));
    setClienteId(nuevo.id);
    setClienteModal(false);
  }

  async function guardar() {
    if (!clienteId) return toast.error('Elige el cliente de la venta.');
    if (!lineas.length) return toast.error('Agrega al menos un producto.');
    if (!fiado && !metodoPagoId) return toast.error('Elige con qué se está cobrando.');
    // Mismo límite que aplica el servidor: mejor avisarlo acá que dejar que falle al guardar.
    if (vacios > vaciosMaximos)
      return toast.error(
        `El cliente tendría ${vaciosMaximos} envases nuestros, así que no puede devolver ${vacios}.`,
      );

    setGuardando(true);
    try {
      const venta = await createSale({
        clienteId,
        tipoPago: fiado ? 'CREDITO' : 'CONTADO',
        items: lineas.map((linea) => ({
          productoId: linea.producto.id,
          cantidad: linea.cantidad,
          precioUnitario: precioDe(linea.producto),
          descuento: 0,
        })),
        pagosIniciales: fiado ? undefined : [{ metodoPagoId: Number(metodoPagoId), monto: total }],
        fechaVencimiento: fiado ? enDias(plazo) : undefined,
        vaciosDevueltos: vacios,
      });
      toast.success(`Venta ${venta.codigo} registrada por ${moneda(venta.total)}`, {
        action: { label: 'Ver boleta', onClick: () => setBoleta(venta) },
      });
      // Se limpia para la siguiente: en ruta se registran varias seguidas y volver a la lista
      // obligaría a entrar de nuevo cada vez.
      limpiar();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'No se pudo registrar la venta');
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) {
    return (
      <div className="operation-loading" role="status">
        <span className="loading-spinner" /> Preparando la venta...
      </div>
    );
  }

  if (!catalogs.preparado) {
    return (
      <div className="table-empty">
        <Zap size={22} />
        <span>
          Esta unidad todavía no puede registrar ventas. Revisa que tengas un trabajador vinculado,
          un almacén activo y productos cargados.
        </span>
      </div>
    );
  }

  return (
    <div className="quick-sale">
      <section className="mb-3 rounded-container-lg border border-line bg-surface p-4">
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <h2 className="m-0 text-base text-fg">Cliente</h2>
          {catalogs.unidadEscritura ? (
            <span className="operation-eyebrow">{catalogs.unidadEscritura.nombre}</span>
          ) : null}
        </div>
        <SearchableSelect
          value={clienteId}
          onChange={setClienteId}
          options={catalogs.clientes.map((item) => ({
            value: item.id,
            label: item.nombre,
            hint: item.documento,
          }))}
          placeholder="Buscar cliente por nombre o documento"
          actionLabel="+ Agregar cliente"
          onAction={() => setClienteModal(true)}
        />
        {resumen ? (
          <p className={resumen.alerta ? 'quick-client-debt alerta' : 'quick-client-debt'}>
            {resumen.texto}
          </p>
        ) : null}
        {/* El problema de crédito se avisa al elegir el cliente, no al tocar "Registrar":
            en ruta el repartidor necesita saberlo antes de armar el pedido. */}
        {avisoCredito ? (
          <p className="quick-client-debt alerta">
            {avisoCredito}
            {puedeExcepcion
              ? ' Podés registrarla igual: queda anotado que vos la autorizaste.'
              : ''}
          </p>
        ) : null}
        {ultima ? (
          <button type="button" className="quick-repeat" onClick={repetirUltimo}>
            <History size={17} />
            <span>
              Repetir su último pedido
              <small>
                {ultima.items
                  .map((item) => `${Math.round(item.cantidad)} × ${item.producto}`)
                  .join(' · ')}{' '}
                · {fechaCorta(ultima.fecha)}
              </small>
            </span>
          </button>
        ) : null}
      </section>

      <section className="mb-3 rounded-container-lg border border-line bg-surface p-4">
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <h2 className="m-0 text-base text-fg">Productos</h2>
        </div>
        {catalogs.productos.length > 6 ? (
          <label className="pill-search quick-product-search">
            <Search size={17} />
            <input
              value={buscar}
              onChange={(event) => setBuscar(event.target.value)}
              placeholder="Buscar producto"
            />
          </label>
        ) : null}
        <div className="product-pad">
          {visibles.map((producto) => {
            const cantidad = cantidades[producto.id] ?? 0;
            return (
              <article
                className={`product-pad-item${cantidad ? ' is-active' : ''}`}
                key={producto.id}
              >
                <strong>{producto.nombre}</strong>
                <span>{moneda(precioDe(producto))}</span>
                <div className="qty-stepper">
                  <button
                    type="button"
                    onClick={() => sumar(producto.id, -1)}
                    disabled={!cantidad}
                    aria-label={`Quitar un ${producto.nombre}`}
                  >
                    <Minus size={17} />
                  </button>
                  <span aria-live="polite">{cantidad}</span>
                  <button
                    type="button"
                    onClick={() => sumar(producto.id, 1)}
                    aria-label={`Agregar un ${producto.nombre}`}
                  >
                    <Plus size={17} />
                  </button>
                </div>
              </article>
            );
          })}
          {!visibles.length ? (
            <div className="entity-list-empty">Ningún producto coincide con la búsqueda.</div>
          ) : null}
        </div>
      </section>

      {/* Solo aparece cuando la venta lleva bidones. En ruta el contador arranca en el
          intercambio uno a uno y se baja con el − cuando el cliente no devolvió los vacíos. */}
      {envasesEntregados > 0 ? (
        <section className="mb-3 rounded-container-lg border border-line bg-surface p-4">
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <h2 className="m-0 text-base text-fg">Vacíos que devolvió</h2>
          </div>
          <div className="quick-empties">
            <div className="qty-stepper">
              <button type="button" onClick={() => ajustarVacios(-1)} aria-label="Un vacío menos">
                <Minus size={17} />
              </button>
              <strong>{vacios}</strong>
              <button type="button" onClick={() => ajustarVacios(1)} aria-label="Un vacío más">
                <Plus size={17} />
              </button>
            </div>
            <small>
              Se lleva {envasesEntregados}
              {cliente ? ` · ya tenía ${cliente.saldoEnvases ?? 0}` : ''}.{' '}
              {envasesEntregados - vacios === 0
                ? 'Queda igual.'
                : envasesEntregados - vacios > 0
                  ? `Le quedan ${envasesEntregados - vacios} de más.`
                  : `Devuelve ${vacios - envasesEntregados} de los que ya tenía.`}
            </small>
          </div>
        </section>
      ) : null}

      <section className="mb-3 rounded-container-lg border border-line bg-surface p-4">
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <h2 className="m-0 text-base text-fg">Cobro</h2>
        </div>
        <div className="pay-chips">
          {metodos.map((metodo) => (
            <button
              type="button"
              key={metodo.id}
              className={`pay-chip${!fiado && metodoPagoId === metodo.id ? ' is-active' : ''}`}
              onClick={() => {
                setFiado(false);
                setMetodoPagoId(metodo.id);
              }}
            >
              {!fiado && metodoPagoId === metodo.id ? <Check size={15} /> : null}
              {metodo.nombre}
            </button>
          ))}
          <button
            type="button"
            className={`pay-chip${fiado ? ' is-active' : ''}`}
            // Se evalúa con el cliente elegido, no con `fiado`: si ya no le alcanza el
            // crédito, el botón no se puede ni tocar (salvo permiso de excepción).
            disabled={!puedeExcepcion && Boolean(evaluarCredito(cliente, total))}
            title={
              !puedeExcepcion && evaluarCredito(cliente, total)
                ? (evaluarCredito(cliente, total) ?? undefined)
                : undefined
            }
            onClick={() => {
              setFiado(true);
              setMetodoPagoId('');
            }}
          >
            {fiado ? <Check size={15} /> : <CalendarClock size={15} />}
            Fiado
          </button>
        </div>
        {fiado ? (
          <div className="quick-due">
            <span className="label">Vence en</span>
            {PLAZOS.map((dias) => (
              <button
                type="button"
                key={dias}
                className={`pay-chip${plazo === dias ? ' is-active' : ''}`}
                onClick={() => setPlazo(dias)}
              >
                {dias} días
              </button>
            ))}
            <small>{fechaCorta(enDias(plazo))}</small>
          </div>
        ) : null}
      </section>

      <p className="quick-escape">
        ¿Lleva descuento, pago mixto o sale de otro almacén?{' '}
        <Link href="/ventas/nueva">Usa la venta completa</Link>.
      </p>

      <div className="operation-sticky-actions">
        <div className="operation-running-total">
          <span>Total</span>
          <strong>{moneda(total)}</strong>
        </div>
        <Button
          type="button"
          shape="rect"
          className="max-[700px]:col-span-2 max-[700px]:row-start-2 max-[700px]:w-full"
          onClick={() => void guardar()}
          disabled={guardando || !total}
        >
          {guardando ? 'Registrando...' : 'Registrar venta'}
        </Button>
      </div>

      {clienteModal ? (
        <ClienteFormModal onClose={() => setClienteModal(false)} onSaved={clienteCreado} />
      ) : null}
      {boleta ? <SaleReceipt sale={boleta} onClose={() => setBoleta(null)} /> : null}
    </div>
  );
}
