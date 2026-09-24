import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  ClipboardCheck,
  Factory,
  Package,
  type LucideIcon,
} from 'lucide-react';

/** "ENTRADA" / "SALIDA" → "Entrada" / "Salida". */
export function directionLabel(direccion: string) {
  return direccion === 'ENTRADA' ? 'Entrada' : direccion === 'SALIDA' ? 'Salida' : direccion;
}

type MovementStyle = { label: string; icon: LucideIcon; tone: 'green' | 'red' | 'blue' | 'amber' };

// Indexado por `tipoMovimiento` (no por `tipoOperacion`, que es el otro eje). Los valores
// válidos los impone un CHECK y están en packages/database/prisma/constraints.sql
// (`movimiento_tipo_valido`).
const MOVEMENT_STYLES: Record<string, MovementStyle> = {
  ENTRADA: { label: 'Entrada', icon: ArrowDownLeft, tone: 'green' },
  SALIDA: { label: 'Salida', icon: ArrowUpRight, tone: 'red' },
  PRODUCCION: { label: 'Producción', icon: Factory, tone: 'blue' },
  TRANSFERENCIA: { label: 'Transferencia', icon: ArrowLeftRight, tone: 'amber' },
  AJUSTE: { label: 'Ajuste', icon: ClipboardCheck, tone: 'amber' },
  MERMA: { label: 'Merma', icon: ArrowUpRight, tone: 'red' },
  CAMBIO_ESTADO: { label: 'Cambio de estado', icon: Package, tone: 'blue' },
};

// Un tipo desconocido se muestra como movimiento, no como "Transferencia": ese fallback era
// el que hacía que la reversión de una producción (tipoMovimiento AJUSTE) apareciera como un
// traslado entre almacenes que nunca ocurrió.
const MOVEMENT_FALLBACK: MovementStyle = { label: 'Movimiento', icon: Package, tone: 'blue' };

export function movementStyle(tipo: string): MovementStyle {
  return MOVEMENT_STYLES[tipo] ?? MOVEMENT_FALLBACK;
}

/** Opciones del filtro por tipo de operación: etiqueta legible y valor guardado. */
export const MOVEMENT_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Todos los tipos' },
  { value: 'VENTA', label: 'Salidas por venta' },
  { value: 'DEVOLUCION_VENTA', label: 'Devoluciones de cliente' },
  { value: 'PRODUCCION', label: 'Producción' },
  { value: 'AJUSTE_NEGATIVO', label: 'Ajustes por conteo (faltante)' },
  { value: 'AJUSTE_POSITIVO', label: 'Ajustes por conteo (sobrante)' },
  { value: 'CARGA_INICIAL', label: 'Carga inicial de inventario' },
  { value: 'MERMA', label: 'Mermas y roturas' },
  // Del módulo de Compras, que ya no existe: solo devuelven filas históricas.
  { value: 'COMPRA', label: 'Entradas por compra' },
  { value: 'DEVOLUCION_COMPRA', label: 'Devoluciones a proveedor' },
];
