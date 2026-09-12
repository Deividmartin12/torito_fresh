/**
 * Backfill de un solo uso: le asigna categoría a los métodos de pago que ya existían
 * antes de que `MetodoPago` tuviera `categoriaId`, `referencia` y `trabajadorId`.
 *
 * Hasta ahora un método era solo un nombre suelto en mayúsculas ("EFECTIVO", "YAPE").
 * Acá cada nombre distinto se convierte en una categoría y el método pasa a colgar de
 * ella, quedando global (`trabajadorId: null`) para no cambiar quién puede usarlo hoy.
 * Los ids de los métodos no se tocan, así que los `PagoCliente` históricos siguen
 * apuntando al mismo lugar.
 *
 * Es idempotente: correrlo dos veces no duplica categorías ni pisa las que ya tienen.
 *
 *   npx tsx packages/database/prisma/backfill-metodos-pago.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** Ícono y referencia obligatoria según la categoría, igual a lo que la UI infería a mano. */
function rasgosDe(nombre: string) {
  if (nombre.includes('EFECTIVO')) return { icono: 'banknote', requiereReferencia: false };
  if (nombre.includes('YAPE') || nombre.includes('PLIN'))
    return { icono: 'smartphone', requiereReferencia: true };
  if (nombre.includes('TRANSFER')) return { icono: 'landmark', requiereReferencia: true };
  return { icono: 'credit-card', requiereReferencia: false };
}

async function main() {
  const metodos = await prisma.metodoPago.findMany({ where: { categoriaId: null } });
  if (!metodos.length) {
    console.log('No hay métodos de pago sin categoría. Nada que hacer.');
    return;
  }

  for (const metodo of metodos) {
    const nombre = (metodo.nombre ?? 'OTROS').trim().toUpperCase() || 'OTROS';
    const categoria = await prisma.categoriaMetodoPago.upsert({
      where: { nombre },
      update: {},
      create: { nombre, ...rasgosDe(nombre) },
    });
    // El nombre libre se limpia: pasa a ser la categoría, y la etiqueta visible se arma
    // con categoría + referencia. Así no queda "YAPE" repetido en "YAPE · YAPE".
    await prisma.metodoPago.update({
      where: { id: metodo.id },
      data: { categoriaId: categoria.id, nombre: null },
    });
    console.log(`  ${metodo.nombre ?? '(sin nombre)'} -> categoría ${categoria.nombre}`);
  }

  console.log(`Listo: ${metodos.length} método(s) de pago con categoría asignada.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
