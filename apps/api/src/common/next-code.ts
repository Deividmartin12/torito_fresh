/**
 * Genera el siguiente código correlativo con un prefijo fijo (ej. "ALM-001", "PRD-014").
 *
 * `buscarUltimoCodigo` debe devolver el código más alto que ya exista con ese prefijo (o
 * `null` si no hay ninguno). Con eso alcanza: se le suma 1 y listo.
 *
 * Antes esta función probaba 1, 2, 3... consultando la base en cada intento, así que crear
 * el producto número 500 costaba 500 consultas. Ahora es una sola.
 */
export async function nextSequentialCode(
  prefix: string,
  buscarUltimoCodigo: () => Promise<string | null>,
  digits = 3,
): Promise<string> {
  const ultimoCodigo = await buscarUltimoCodigo();
  // Del código "PRD-014" nos quedamos con "014" y lo pasamos a número.
  const ultimoNumero = ultimoCodigo ? Number(ultimoCodigo.slice(prefix.length + 1)) : 0;
  const siguiente = (Number.isFinite(ultimoNumero) ? ultimoNumero : 0) + 1;
  return `${prefix}-${String(siguiente).padStart(digits, '0')}`;
}
