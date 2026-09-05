import { api } from './api';

export type EstadoRecarga = 'ATRASADO' | 'POR_VENCER' | 'AL_DIA' | 'SIN_HISTORIAL';

export type RecargaCliente = {
  clienteId: string;
  cliente: string;
  telefono: string | null;
  compras: number;
  primeraRecarga: string;
  ultimaRecarga: string;
  diasDesdeUltima: number;
  intervaloDias: number | null;
  proximaRecarga: string | null;
  diasParaProxima: number | null;
  pagoPromedio: number;
  ultimoPago: number;
  totalPagado: number;
  estado: EstadoRecarga;
};

export function getRecargas() {
  return api<RecargaCliente[]>('/recargas');
}
