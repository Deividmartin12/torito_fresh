import { BadRequestException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { unidadControlaInventario } from './unit-context';

export type Transaction = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/**
 * Configuración de las transacciones que tocan stock (ventas, producción y conteos).
 * `Serializable` evita que dos operaciones simultáneas lean el mismo stock y lo consuman dos
 * veces, que terminaría dejando stock negativo.
 */
export const TRANSACCION_DE_STOCK = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
} as const;

/**
 * Etiquetas de `MovimientoInventario.tipoOperacion`.
 *
 * Las claves son de `tipoOperacion`, NO de `tipoMovimiento`: son dos ejes distintos y antes
 * este mapa los mezclaba, con entradas `AJUSTE` y `TRANSFERENCIA` que nunca coincidían con
 * nada porque no son valores válidos de esta columna. La lista de valores permitidos la
 * impone un CHECK y vive en `packages/database/prisma/constraints.sql`
 * (`movimiento_operacion_valida`).
 *
 * COMPRA y DEVOLUCION_COMPRA se conservan porque el kardex histórico del módulo de Compras
 * (ya eliminado) sigue teniendo filas con esos valores.
 */
export const MOVEMENT_LABELS: Record<string, string> = {
  COMPRA: 'Entrada por compra',
  VENTA: 'Salida por venta',
  DEVOLUCION_VENTA: 'Devolución de cliente',
  DEVOLUCION_COMPRA: 'Devolución a proveedor',
  PRODUCCION: 'Producción',
  TRANSFERENCIA_ALMACEN: 'Transferencia entre almacenes',
  AJUSTE_POSITIVO: 'Ajuste por conteo (sobrante)',
  AJUSTE_NEGATIVO: 'Ajuste por conteo (faltante)',
  CARGA_INICIAL: 'Carga inicial de inventario',
  MERMA: 'Merma o rotura',
  CAMBIO_ESTADO: 'Cambio de estado del inventario',
};

export const movementLabel = (operacion: string) =>
  MOVEMENT_LABELS[operacion] ?? operacion.replace(/_/g, ' ').toLowerCase();

/**
 * Cómo se nombra cada operación dentro de la frase "…por ___" que explica el movimiento en el
 * kardex. Va aparte de las etiquetas porque el artículo depende del género y no se puede
 * poner uno fijo en la plantilla: con un "una" hardcodeado salía "por una ajuste por conteo".
 */
const MOVEMENT_PHRASES: Record<string, string> = {
  COMPRA: 'una compra',
  VENTA: 'una venta',
  DEVOLUCION_VENTA: 'la devolución de un cliente',
  DEVOLUCION_COMPRA: 'una devolución a proveedor',
  PRODUCCION: 'una producción',
  TRANSFERENCIA_ALMACEN: 'una transferencia entre almacenes',
  AJUSTE_POSITIVO: 'un ajuste por conteo: sobraban unidades',
  AJUSTE_NEGATIVO: 'un ajuste por conteo: faltaban unidades',
  CARGA_INICIAL: 'la carga inicial del inventario',
  MERMA: 'una merma o rotura',
  CAMBIO_ESTADO: 'un cambio de estado del inventario',
};

export const movementPhrase = (operacion: string) =>
  MOVEMENT_PHRASES[operacion] ?? operacion.replace(/_/g, ' ').toLowerCase();

/** Costo unitario promedio ponderado después de agregar `addQty` unidades a `addCost` cada una. */
export const weightedAverage = (
  prevQty: number,
  prevCost: number,
  addQty: number,
  addCost: number,
) => {
  const total = prevQty + addQty;
  return total > 0 ? (prevQty * prevCost + addQty * addCost) / total : 0;
};

/**
 * Tolerancia al comparar cantidades. `Decimal(12,3)` guarda milésimas, así que media milésima
 * alcanza para distinguir "es el mismo número" de "cambió".
 */
export const EPSILON_CANTIDAD = 0.0005;

/** Un puesto que solo registra ventas y gastos no lleva inventario: no hay stock que mover. */
export async function exigirInventario(
  db: Transaction | PrismaClient,
  unidadNegocioId: bigint,
): Promise<void> {
  if (await unidadControlaInventario(db, unidadNegocioId)) return;
  throw new BadRequestException(
    'Esta unidad de negocio solo registra ventas y gastos: no lleva inventario.',
  );
}

/**
 * Algunas instalaciones antiguas no tienen cargado el catálogo inicial de estados. Todo lo que
 * entra al inventario entra como disponible, así que se asegura el estado antes de usarlo.
 */
export function ensureAvailableState(db: Transaction) {
  return db.estadoInventario.upsert({
    where: { codigo: 'DISPONIBLE' },
    update: { estado: true, permiteVenta: true },
    create: { codigo: 'DISPONIBLE', nombre: 'Disponible', permiteVenta: true },
  });
}
