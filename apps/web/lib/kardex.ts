import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Factory,
  type LucideIcon,
} from 'lucide-react';

/** "ENTRADA" / "SALIDA" → "Entrada" / "Salida". */
export function directionLabel(direccion: string) {
  return direccion === 'ENTRADA' ? 'Entrada' : direccion === 'SALIDA' ? 'Salida' : direccion;
}

type MovementStyle = { label: string; icon: LucideIcon; tone: 'green' | 'red' | 'blue' | 'amber' };

const MOVEMENT_STYLES: Record<string, MovementStyle> = {
  ENTRADA: { label: 'Entrada', icon: ArrowDownLeft, tone: 'green' },
  SALIDA: { label: 'Salida', icon: ArrowUpRight, tone: 'red' },
  PRODUCCION: { label: 'Producción', icon: Factory, tone: 'blue' },
  TRANSFERENCIA: { label: 'Transferencia', icon: ArrowLeftRight, tone: 'amber' },
};

export function movementStyle(tipo: string): MovementStyle {
  return MOVEMENT_STYLES[tipo] ?? MOVEMENT_STYLES.TRANSFERENCIA;
}

/** Opciones del filtro por tipo de movimiento: etiqueta legible y valor del enum. */
export const MOVEMENT_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Todos los tipos' },
  { value: 'COMPRA', label: 'Entradas por compra' },
  { value: 'VENTA', label: 'Salidas por venta' },
  { value: 'DEVOLUCION_VENTA', label: 'Devoluciones de cliente' },
  { value: 'DEVOLUCION_COMPRA', label: 'Devoluciones a proveedor' },
  { value: 'PRODUCCION', label: 'Producción' },
];
