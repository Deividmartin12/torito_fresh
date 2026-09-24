import { api } from './api';

/** Una posición de stock en la hoja de cuadre, con el desglose de su día. */
export type FilaCuadre = {
  stockId: string | null;
  productoId: string;
  producto: string;
  codigo: string;
  unidadMedida: string;
  controlaLote: boolean;
  loteId: string | null;
  lote: string;
  loteEstado: string | null;
  estadoInventarioId: string;
  estado: string;
  saldoInicial: number;
  producido: number;
  consumido: number;
  vendido: number;
  devuelto: number;
  mermas: number;
  ajustes: number;
  otros: number;
  /** Lo que debería haber según el sistema. Es contra esto que se compara el conteo. */
  teorico: number;
  costoPromedio: number;
  /** A qué costo entrarían unidades nuevas cuando el promedio está en cero. */
  costoSugerido: number;
  /** false = el kardex y el saldo guardado no coinciden, y eso ya venía mal de antes. */
  ledgerCuadra: boolean;
};

export type HojaCuadre = {
  almacen: { id: string; nombre: string; unidad: string; controlaInventario: boolean };
  fecha: string;
  esHoy: boolean;
  primeraCarga: boolean;
  conteoDelDia: {
    id: string;
    tipo: string;
    diferencias: number;
    contadas: number;
    registradoPor: string;
    createdAt: string;
  } | null;
  totales: {
    posiciones: number;
    teorico: number;
    producido: number;
    vendido: number;
    valorizado: number;
    posicionesEnCero: number;
    ledgerDescuadrado: number;
  };
  filas: FilaCuadre[];
};

export const MOTIVOS_DIFERENCIA = [
  { value: 'ROTURA', label: 'Se rompió' },
  { value: 'MERMA', label: 'Merma' },
  { value: 'ERROR_DE_CARGA', label: 'Error de carga' },
  { value: 'ROBO', label: 'Faltante o robo' },
  { value: 'OTRO', label: 'Otro' },
] as const;

export type LineaConteo = {
  stockId?: string;
  productoId: string;
  loteId?: string;
  estadoInventarioId: string;
  contado: number;
  teorico: number;
  costoUnitario?: number;
  motivo?: string;
  nota?: string;
};

export type ConteoResumen = {
  id: string;
  fecha: string;
  tipo: string;
  almacen: string;
  registradoPor: string;
  posiciones: number;
  contadas: number;
  diferencias: number;
  unidadesSobrantes: number;
  unidadesFaltantes: number;
  observaciones: string | null;
  createdAt: string;
};

export type ConteoDetalle = ConteoResumen & {
  movimientos: { id: string; referencia: string | null; operacion: string }[];
  detalles: {
    id: string;
    producto: string;
    codigo: string;
    unidadMedida: string;
    lote: string;
    estado: string;
    teorico: number;
    contado: number;
    diferencia: number;
    costoUnitario: number;
    motivo: string | null;
    nota: string | null;
  }[];
};

export function getHojaCuadre(almacenId: string, fecha?: string) {
  const query = new URLSearchParams({ almacenId });
  if (fecha) query.set('fecha', fecha);
  return api<HojaCuadre>(`/conteos/hoja?${query}`);
}

export function createConteo(payload: {
  almacenId: string;
  fecha: string;
  observaciones?: string;
  forzar?: boolean;
  lineas: LineaConteo[];
}) {
  return api<ConteoDetalle>('/conteos', { method: 'POST', body: JSON.stringify(payload) });
}

export function getConteos(from?: string, to?: string, almacenId?: string) {
  const query = new URLSearchParams();
  if (from) query.set('from', from);
  if (to) query.set('to', to);
  if (almacenId) query.set('almacenId', almacenId);
  return api<ConteoResumen[]>(`/conteos${query.size ? `?${query}` : ''}`);
}

export function getConteo(id: string) {
  return api<ConteoDetalle>(`/conteos/${id}`);
}
