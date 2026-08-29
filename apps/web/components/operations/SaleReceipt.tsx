'use client';

import { Printer, X } from 'lucide-react';
import { formaPagoLabel } from '../../lib/credit';
import { dateTime, money } from '../../lib/format';
import { Sale } from '../../lib/operations';

/**
 * Boleta de venta que se entrega al cliente con el detalle impreso de su compra.
 */
export function SaleReceipt({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  return (
    <div
      className="sale-receipt-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="sale-receipt">
        <header className="sale-receipt-head">
          <img src="/torito-logo.jpg" alt="Torito Fresh" />
          <div>
            <strong>AGUA TORITO FRESH</strong>
            <span>Boleta de venta</span>
          </div>
        </header>

        <div className="sale-receipt-meta">
          <div>
            <small>Comprobante</small>
            <strong>{sale.comprobante}</strong>
          </div>
          <div>
            <small>Fecha</small>
            <strong>{dateTime(sale.fecha)}</strong>
          </div>
          <div>
            <small>Cliente</small>
            <strong>{sale.cliente}</strong>
          </div>
          <div>
            <small>{sale.clienteTipoDocumento || 'Documento'}</small>
            <strong>{sale.clienteDocumento || '—'}</strong>
          </div>
        </div>

        <table className="sale-receipt-items">
          <thead>
            <tr>
              <th>Producto</th>
              <th className="num">Cant.</th>
              <th className="num">P. unit.</th>
              <th className="num">Importe</th>
            </tr>
          </thead>
          <tbody>
            {sale.items.map((item) => (
              <tr key={item.id}>
                <td>{item.producto}</td>
                <td className="num">{item.cantidad}</td>
                <td className="num">{money(item.precio)}</td>
                <td className="num">{money(item.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="sale-receipt-totals">
          <span>
            Subtotal <strong>{money(sale.subtotal)}</strong>
          </span>
          {sale.descuento > 0 ? (
            <span>
              Descuento <strong>- {money(sale.descuento)}</strong>
            </span>
          ) : null}
          {sale.igv > 0 ? (
            <span>
              IGV <strong>{money(sale.igv)}</strong>
            </span>
          ) : null}
          <span className="sale-receipt-grand">
            Total <strong>{money(sale.total)}</strong>
          </span>
        </div>

        <div className="sale-receipt-payment">
          <span>Forma de pago: {formaPagoLabel[sale.pago] ?? sale.pago}</span>
          {sale.saldo > 0 ? (
            <span>
              Pagado {money(sale.pagado)} · Saldo {money(sale.saldo)}
            </span>
          ) : null}
        </div>

        <footer className="sale-receipt-foot">¡Gracias por su compra!</footer>
      </div>

      <div className="sale-receipt-actions">
        <button type="button" className="btn-secondary" onClick={onClose}>
          <X size={16} /> Cerrar
        </button>
        <button type="button" className="btn-primary" onClick={() => window.print()}>
          <Printer size={16} /> Imprimir
        </button>
      </div>
    </div>
  );
}
