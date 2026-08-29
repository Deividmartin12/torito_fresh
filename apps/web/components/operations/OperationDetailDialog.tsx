'use client';

import { HandCoins, X } from 'lucide-react';
import Link from 'next/link';
import { resumenVencimiento } from '../../lib/credit';
import { money } from '../../lib/format';
import { OperationDetailLine } from '../../lib/operations';

type Props = {
  title: string;
  partyLabel: string;
  party: string;
  warehouseLabel: string;
  warehouse: string;
  status: string;
  total: number;
  netTotal?: number;
  paid?: number;
  balance?: number;
  paymentStatus?: string;
  dueDate?: string | null;
  returnStatus?: string;
  kardexId: string | null;
  kardexRef?: string | null;
  items: OperationDetailLine[];
  onClose: () => void;
  /** Solo ventas con saldo: abre el registro de cobro. */
  onRegisterCollection?: () => void;
};

export function OperationDetailDialog({
  title,
  partyLabel,
  party,
  warehouseLabel,
  warehouse,
  status,
  total,
  netTotal = total,
  paid = 0,
  balance = 0,
  paymentStatus = 'PENDIENTE',
  dueDate,
  returnStatus = 'SIN_DEVOLUCION',
  kardexId,
  kardexRef,
  items,
  onClose,
  onRegisterCollection,
}: Props) {
  const due = resumenVencimiento(dueDate ?? null, balance);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="crud-modal operation-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="operation-detail-title"
      >
        <div className="modal-top">
          <div>
            <h2 id="operation-detail-title">{title}</h2>
            <small>Detalle de la operación y efecto en inventario</small>
          </div>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Cerrar detalle"
          >
            <X size={18} />
          </button>
        </div>
        <div className="operation-detail">
          <div className="detail-summary">
            <span>
              {partyLabel}
              <strong>{party}</strong>
            </span>
            <span>
              {warehouseLabel}
              <strong>{warehouse}</strong>
            </span>
            <span>
              Operación<strong>{status}</strong>
            </span>
            <span>
              Pago<strong>{paymentStatus}</strong>
            </span>
            {balance > 0 ? (
              <span>
                Vencimiento
                <strong>
                  {dueDate
                    ? `${new Intl.DateTimeFormat('es-PE', { timeZone: 'UTC' }).format(
                        new Date(dueDate),
                      )} · ${due.label}`
                    : 'Sin fecha programada'}
                </strong>
              </span>
            ) : null}
            <span>
              Devolución<strong>{returnStatus.replaceAll('_', ' ')}</strong>
            </span>
          </div>
          <div className="operation-detail-items">
            {items.map((item, index) => (
              <div className="detail-line" key={`${item.producto}-${index}`}>
                <span>
                  {item.producto}
                  <small>
                    {item.cantidad} × S/ {item.precio.toFixed(2)}
                    {item.cantidadDevuelta ? ` · Devuelto: ${item.cantidadDevuelta}` : ''}
                  </small>
                </span>
                <strong>S/ {item.subtotal.toFixed(2)}</strong>
              </div>
            ))}
          </div>
          <div className="operation-financial-summary">
            <span>
              Total original<strong>S/ {total.toFixed(2)}</strong>
            </span>
            <span>
              Total neto<strong>S/ {netTotal.toFixed(2)}</strong>
            </span>
            <span>
              Pagado<strong>S/ {paid.toFixed(2)}</strong>
            </span>
            <span>
              Saldo<strong>S/ {balance.toFixed(2)}</strong>
            </span>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cerrar
            </button>
            {kardexId ? (
              <Link
                className="btn-secondary"
                href={`/movimientos?ref=${encodeURIComponent(kardexRef ?? '')}`}
              >
                Ver kardex
              </Link>
            ) : null}
            {balance > 0 && onRegisterCollection ? (
              <button type="button" className="btn-primary" onClick={onRegisterCollection}>
                <HandCoins size={16} /> Registrar cobro
              </button>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
