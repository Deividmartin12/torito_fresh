import { api } from './api';

export type CuentaCaja = {
  id: string | null;
  unidadNegocioId: string;
  unidad: string;
  metodoPagoId: string;
  metodo: string;
  responsable: string;
  activo: boolean;
  saldoInicial: number | null;
  fechaApertura: string | null;
  saldo: number | null;
  ingresos: number;
  salidas: number;
  version: number;
};
export const tiposCaja: Record<string, string> = {
  APERTURA: 'Apertura',
  COBRO: 'Cobro',
  REEMBOLSO: 'Reembolso',
  GASTO: 'Gasto',
  REVERSION: 'Reversión',
  APORTE: 'Aporte',
  DEPOSITO: 'Depósito externo',
  RETIRO: 'Retiro',
  TRANSFERENCIA_ENTRADA: 'Transferencia recibida',
  TRANSFERENCIA_SALIDA: 'Transferencia enviada',
  AJUSTE: 'Ajuste',
};
export type MovimientoCaja = {
  id: string;
  cuentaId: string;
  unidad: string;
  metodo: string;
  fecha: string;
  registradoAt: string;
  tipo: string;
  importe: number;
  saldo: number | null;
  descripcion: string;
  responsable: string;
  origen: string | null;
  origenId: string | null;
  ventaId: string | null;
};
export type HistorialCaja = {
  items: MovimientoCaja[];
  total: number;
  pagina: number;
  ingresos: number;
  salidas: number;
  porCuenta: Record<string, { ingresos: number; salidas: number }>;
  gastosSinCuenta: {
    monto: number;
    cantidad: number;
    items: {
      id: string;
      fecha: string;
      monto: number;
      concepto: string;
      unidad: string;
      origen: string;
    }[];
  };
};
export const getCuentasCaja = () => api<CuentaCaja[]>('/caja/cuentas');
export function getMovimientosCaja(filters: Record<string, string>) {
  const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
  return api<HistorialCaja>(`/caja/movimientos?${query}`);
}
export function registrarCaja(path: string, body: object) {
  return api<{ id: string }>(`/caja/${path}`, { method: 'POST', body: JSON.stringify(body) });
}
