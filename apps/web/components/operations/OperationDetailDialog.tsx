'use client';

import { Ban, HandCoins, Pencil } from 'lucide-react';
import Link from 'next/link';
import { estadoPagoLabel, formaPagoLabel, resumenVencimiento } from '../../lib/credit';
import { fechaCorta, fechaHora, moneda } from '../../lib/format';
import { Sale } from '../../lib/operations';
import { Badge, BadgeTone } from '../ui/Badge';
import { Button } from '../ui/Button';
import { modalActionsClass } from '../ui/Field';
import { Modal, ModalHeader } from '../ui/Modal';

type Props = {
  sale: Sale;
  onClose: () => void;
  /** Solo ventas con saldo: abre el registro de cobro. */
  onRegisterCollection?: () => void;
  /** Solo ventas sin pagos ni devoluciones registradas: abre el formulario de edición. */
  onEdit?: () => void;
  /** Solo con permiso y si queda algo por devolver: abre el modal de anulación. */
  onAnular?: () => void;
};

/** Tono del vencimiento (`resumenVencimiento`) → tono del badge del sistema. */
const dueTone: Record<string, BadgeTone> = {
  overdue: 'red',
  today: 'amber',
  soon: 'amber',
  scheduled: 'blue',
  undated: 'gray',
  paid: 'green',
};

const estadoTone = (estado: string): BadgeTone =>
  estado === 'CONFIRMADA' ? 'green' : estado === 'ANULADA' ? 'red' : 'amber';

/** Detalle de una venta: montos, estado, productos y su efecto en inventario. */
export function OperationDetailDialog({
  sale,
  onClose,
  onRegisterCollection,
  onEdit,
  onAnular,
}: Props) {
  const pendiente = sale.saldo > 0;
  const due = resumenVencimiento(sale.fechaVencimiento ?? null, sale.saldo);

  return (
    <Modal onClose={onClose} className="max-w-[620px]">
      <ModalHeader
        title={sale.codigo}
        subtitle={fechaHora(sale.fecha)}
        onClose={onClose}
        closeLabel="Cerrar detalle"
      />

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
          <Badge tone={sale.estadoPago === 'PAGADA' ? 'green' : 'amber'}>
            {estadoPagoLabel[sale.estadoPago] ?? sale.estadoPago}
          </Badge>
        </div>

        <div className="sale-detail-tags">
          <Badge tone="blue">{formaPagoLabel[sale.pago] ?? sale.pago}</Badge>
          {/* Una venta anulada sigue CONFIRMADA en la base: lo que la anula es su devolución
              total. Acá se muestra lo que la persona necesita leer, no la columna cruda. */}
          <Badge tone={sale.anulada ? 'red' : estadoTone(sale.estado)}>
            {sale.anulada ? 'Anulada' : sale.estado === 'CONFIRMADA' ? 'Confirmada' : sale.estado}
          </Badge>
          {/* La anulación ya se anuncia con el badge de arriba: repetir "devolución total"
              al lado solo confunde. */}
          {sale.estadoDevolucion !== 'SIN_DEVOLUCION' && !sale.anulada ? (
            <Badge tone="amber">
              Devolución {sale.estadoDevolucion.replace('DEVOLUCION_', '').toLowerCase()}
            </Badge>
          ) : null}
          {pendiente ? <Badge tone={dueTone[due.tone] ?? 'gray'}>{due.label}</Badge> : null}
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
          <span
            className={pendiente ? 'sale-detail-balance-row pending' : 'sale-detail-balance-row'}
          >
            <em>Saldo</em>
            <b>{moneda(sale.saldo)}</b>
          </span>
        </div>

        {/* Solo si hubo envases de por medio: en una venta de agua embotellada la línea
              sobraría y no dice nada. */}
        {sale.envasesEntregados > 0 || sale.vaciosRecibidos > 0 ? (
          <div className="sale-detail-section">
            <span className="sale-detail-label">Envases</span>
            <p className="sale-detail-note">
              Entregó {sale.envasesEntregados}, recibió {sale.vaciosRecibidos} vacíos
              {sale.envasesEntregados === sale.vaciosRecibidos
                ? '. El saldo del cliente no se movió.'
                : sale.envasesEntregados > sale.vaciosRecibidos
                  ? `. Le quedaron ${sale.envasesEntregados - sale.vaciosRecibidos} envases nuestros.`
                  : `. Devolvió ${sale.vaciosRecibidos - sale.envasesEntregados} de los que ya tenía.`}
            </p>
          </div>
        ) : null}

        {sale.anulada ? (
          <div className="sale-detail-section">
            <span className="sale-detail-label">Anulación</span>
            <p className="sale-detail-note">
              {sale.motivoAnulacion}
              {sale.fechaAnulacion ? ` · ${fechaCorta(sale.fechaAnulacion)}` : ''}
            </p>
          </div>
        ) : null}

        {sale.creditoAutorizadoPor ? (
          <div className="sale-detail-section">
            <span className="sale-detail-label">Crédito autorizado</span>
            <p className="sale-detail-note">
              {sale.creditoAutorizadoPor} autorizó pasar el límite del cliente.
              {sale.creditoAutorizadoNota ? ` ${sale.creditoAutorizadoNota}` : ''}
            </p>
          </div>
        ) : null}

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

      <div className={`sale-detail-actions ${modalActionsClass}`}>
        <Button variant="secondary" type="button" onClick={onClose}>
          Cerrar
        </Button>
        {onEdit ? (
          <Button variant="secondary" type="button" onClick={onEdit}>
            <Pencil size={16} /> Editar
          </Button>
        ) : null}
        {pendiente && onRegisterCollection ? (
          <Button type="button" onClick={onRegisterCollection}>
            <HandCoins size={16} /> Registrar cobro
          </Button>
        ) : null}
        {onAnular ? (
          <Button variant="danger" type="button" onClick={onAnular}>
            <Ban size={16} /> Anular
          </Button>
        ) : null}
      </div>
    </Modal>
  );
}
