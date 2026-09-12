'use client';

import { HandCoins, Pencil, X } from 'lucide-react';
import Link from 'next/link';
import { estadoPagoLabel, formaPagoLabel, resumenVencimiento } from '../../lib/credit';
import { fechaCorta, fechaHora, moneda } from '../../lib/format';
import { Sale } from '../../lib/operations';

type Props = {
  sale: Sale;
  onClose: () => void;
  /** Solo ventas con saldo: abre el registro de cobro. */
  onRegisterCollection?: () => void;
  /** Solo ventas sin pagos ni devoluciones registradas: abre el formulario de edición. */
  onEdit?: () => void;
};

/** Tono del vencimiento (`resumenVencimiento`) → clase de badge del sistema. */
const dueToneClass: Record<string, string> = {
  overdue: 'status-red',
  today: 'status-amber',
  soon: 'status-amber',
  scheduled: 'status-blue',
  undated: '',
  paid: 'status-green',
};

const estadoClass = (estado: string) =>
  estado === 'CONFIRMADA' ? 'status-green' : estado === 'ANULADA' ? 'status-red' : 'status-amber';

/** Detalle de una venta: montos, estado, productos y su efecto en inventario. */
export function OperationDetailDialog({ sale, onClose, onRegisterCollection, onEdit }: Props) {
  const pendiente = sale.saldo > 0;
  const due = resumenVencimiento(sale.fechaVencimiento ?? null, sale.saldo);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="crud-modal sale-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="operation-detail-title"
      >
        <div className="modal-top">
          <div>
            <h2 id="operation-detail-title">{sale.codigo}</h2>
            <small>{fechaHora(sale.fecha)}</small>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar detalle">
            <X size={18} />
          </button>
        </div>

        <div className="sale-detail-body">
          <div className="sale-detail-hero">
            <div>
              <small>{pendiente ? 'Saldo pendiente' : 'Total de la venta'}</small>
              <strong>{moneda(pendiente ? sale.saldo : sale.totalNeto)}</strong>
              <span>
                {pendiente
                  ? `Total ${moneda(sale.totalNeto)} · pagado ${moneda(sale.pagado)}`
                  : `Pagado ${moneda(sale.pagado)}`}
              </span>
            </div>
            <span
              className={`status ${sale.estadoPago === 'PAGADA' ? 'status-green' : 'status-amber'}`}
            >
              {estadoPagoLabel[sale.estadoPago] ?? sale.estadoPago}
            </span>
          </div>

          <div className="sale-detail-tags">
            <span className="status status-blue">{formaPagoLabel[sale.pago] ?? sale.pago}</span>
            <span className={`status ${estadoClass(sale.estado)}`}>
              {sale.estado === 'CONFIRMADA' ? 'Confirmada' : sale.estado}
            </span>
            {sale.estadoDevolucion !== 'SIN_DEVOLUCION' ? (
              <span className="status status-amber">
                Devolución {sale.estadoDevolucion.replace('DEVOLUCION_', '').toLowerCase()}
              </span>
            ) : null}
            {pendiente ? (
              <span className={`status ${dueToneClass[due.tone] ?? ''}`}>{due.label}</span>
            ) : null}
          </div>

          <div className="sale-detail-facts">
            <div>
              <small>Cliente</small>
              <strong>{sale.cliente}</strong>
              {sale.clienteDocumento ? (
                <span>
                  {sale.clienteTipoDocumento || 'Doc'} {sale.clienteDocumento}
                </span>
              ) : null}
            </div>
            <div>
              <small>Almacén de salida</small>
              <strong>{sale.almacen}</strong>
            </div>
            {sale.fechaVencimiento ? (
              <div>
                <small>Vence</small>
                <strong>{fechaCorta(sale.fechaVencimiento)}</strong>
              </div>
            ) : null}
            <div>
              <small>Inventario</small>
              {sale.kardexId ? (
                <Link
                  className="sale-detail-kardex"
                  href={`/movimientos?ref=${encodeURIComponent(sale.kardexRef ?? '')}`}
                >
                  {sale.kardexRef ?? 'Ver kardex'}
                </Link>
              ) : (
                <strong>Pendiente</strong>
              )}
            </div>
          </div>

          <div className="sale-detail-section">
            <span className="sale-detail-label">Productos</span>
            <div className="sale-detail-items">
              {sale.items.map((item, index) => (
                <div className="detail-line" key={`${item.producto}-${index}`}>
                  <span>
                    {item.producto}
                    <small>
                      {item.cantidad} × {moneda(item.precio)}
                      {item.descuento > 0 ? ` · dcto ${moneda(item.descuento)}` : ''}
                      {item.cantidadDevuelta ? ` · devuelto ${item.cantidadDevuelta}` : ''}
                    </small>
                  </span>
                  <strong>{moneda(item.subtotal)}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="sale-detail-totals">
            <span>
              <em>Subtotal</em>
              <b>{moneda(sale.subtotal)}</b>
            </span>
            {sale.descuento > 0 ? (
              <span>
                <em>Descuento</em>
                <b>- {moneda(sale.descuento)}</b>
              </span>
            ) : null}
            {sale.igv > 0 ? (
              <span>
                <em>IGV</em>
                <b>{moneda(sale.igv)}</b>
              </span>
            ) : null}
            <span className="sale-detail-total-row">
              <em>Total</em>
              <b>{moneda(sale.total)}</b>
            </span>
            {sale.total !== sale.totalNeto ? (
              <span>
                <em>Total neto (con devoluciones)</em>
                <b>{moneda(sale.totalNeto)}</b>
              </span>
            ) : null}
            <span>
              <em>Pagado</em>
              <b>{moneda(sale.pagado)}</b>
            </span>
            <span className={pendiente ? 'sale-detail-balance-row pending' : 'sale-detail-balance-row'}>
              <em>Saldo</em>
              <b>{moneda(sale.saldo)}</b>
            </span>
          </div>

          {sale.pagosIniciales.length ? (
            <div className="sale-detail-section">
              <span className="sale-detail-label">Cobro inicial</span>
              <div className="sale-detail-payments">
                {sale.pagosIniciales.map((pago, index) => (
                  <div key={`${pago.metodoPagoId}-${index}`}>
                    <span>{pago.metodo}</span>
                    <strong>{moneda(pago.monto)}</strong>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="modal-actions sale-detail-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cerrar
          </button>
          {onEdit ? (
            <button type="button" className="btn-secondary" onClick={onEdit}>
              <Pencil size={16} /> Editar
            </button>
          ) : null}
          {pendiente && onRegisterCollection ? (
            <button type="button" className="btn-primary" onClick={onRegisterCollection}>
              <HandCoins size={16} /> Registrar cobro
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
