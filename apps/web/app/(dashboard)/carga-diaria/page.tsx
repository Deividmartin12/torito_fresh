'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Save } from 'lucide-react';
import { ClipboardEvent, KeyboardEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { PeriodFilter } from '../../../components/PeriodFilter';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { controlClass, fieldLabelClass } from '../../../components/ui/Field';
import {
  CargaDiaPayload,
  CargaDiaRegistrado,
  getCargaDiaria,
  registrarCargaDiaria,
} from '../../../lib/carga-diaria';
import { moneda } from '../../../lib/format';

/** Un rango más largo que esto ya no es una carga del mes: el API lo rechaza. */
const MAX_DIAS = 93;

type Columna =
  | { clave: 'produccion'; titulo: string; tipo: 'cantidad' }
  | { clave: `venta:${string}`; titulo: string; tipo: 'monto'; categoriaId: string }
  | { clave: 'gasto'; titulo: string; tipo: 'monto' };

/** Lo tecleado y todavía no guardado: fecha → columna → texto. */
type Borradores = Record<string, Record<string, string>>;

const localDate = (date = new Date()) =>
  new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

/** Los días del rango, sin pasar de `hasta`. */
function diasEntre(desde: string, hasta: string) {
  const dias: string[] = [];
  const cursor = new Date(`${desde}T12:00:00Z`);
  while (dias.length <= MAX_DIAS) {
    const clave = cursor.toISOString().slice(0, 10);
    if (clave > hasta) break;
    dias.push(clave);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dias;
}

const diaSemana = new Intl.DateTimeFormat('es-PE', { weekday: 'short', timeZone: 'UTC' });
const etiquetaDia = (fecha: string) => {
  const dia = diaSemana.format(new Date(`${fecha}T12:00:00Z`)).replace('.', '');
  return { dia: dia.charAt(0).toUpperCase() + dia.slice(1), numero: fecha.slice(8, 10) };
};

/**
 * Lo que llega de Excel o de un mensaje: "S/ 1,250.50", "1.250,50", "120", "120,5". Devuelve
 * el número como texto con punto decimal, o '' si no hay un número ahí.
 */
function normalizarNumero(texto: string, entero: boolean) {
  let limpio = texto.replace(/s\/|\s/gi, '').replace(/[^\d.,-]/g, '');
  if (!limpio) return '';
  const coma = limpio.lastIndexOf(',');
  const punto = limpio.lastIndexOf('.');
  if (coma >= 0 && punto >= 0) {
    // El separador que va último es el decimal; el otro, de miles.
    limpio = coma > punto ? limpio.replace(/\./g, '').replace(',', '.') : limpio.replace(/,/g, '');
  } else if (coma >= 0) {
    // "1,250" es mil doscientos cincuenta; "120,5" es ciento veinte y medio.
    limpio = /,\d{3}$/.test(limpio) ? limpio.replace(/,/g, '') : limpio.replace(',', '.');
  }
  const numero = Number(limpio);
  if (!Number.isFinite(numero) || numero <= 0) return '';
  return entero ? String(Math.round(numero)) : String(Math.round(numero * 100) / 100);
}

/** Filtra lo que se teclea a mano: solo dígitos y, en los montos, un separador decimal. */
function filtrarTecleo(texto: string, entero: boolean) {
  if (entero) return texto.replace(/\D/g, '').slice(0, 7);
  const [entera, ...resto] = texto
    .replace(',', '.')
    .replace(/[^\d.]/g, '')
    .split('.');
  return resto.length ? `${entera}.${resto.join('').slice(0, 2)}` : entera;
}

/** Valor ya registrado de una columna para un día, si lo hay. */
function registrado(dia: CargaDiaRegistrado | undefined, columna: Columna) {
  if (!dia) return null;
  if (columna.clave === 'produccion')
    return dia.produccion
      ? { texto: String(dia.produccion.cantidad), detalle: dia.produccion.codigo ?? 'Producción' }
      : null;
  if (columna.clave === 'gasto')
    return dia.gasto ? { texto: moneda(dia.gasto.monto), detalle: 'Gasto del día' } : null;
  const venta = dia.ventas.find((item) => item.categoriaId === columna.categoriaId);
  return venta
    ? {
        texto: moneda(venta.monto),
        detalle: `${venta.codigo ?? 'Venta'} · ${venta.cantidad} ${venta.cantidad === 1 ? 'unidad' : 'unidades'}`,
      }
    : null;
}

export default function CargaDiariaPage() {
  const queryClient = useQueryClient();
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [borradores, setBorradores] = useState<Borradores>({});
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [productoId, setProductoId] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cambiarPeriodo = useCallback((inicio: string, fin: string) => {
    setDesde(inicio);
    setHasta(fin);
  }, []);

  const hoyLocal = localDate();
  const finVisible = hasta && hasta > hoyLocal ? hoyLocal : hasta;
  const rangoValido = Boolean(desde && finVisible && desde <= finVisible);
  const dias = useMemo(
    () => (rangoValido ? diasEntre(desde, finVisible) : []),
    [rangoValido, desde, finVisible],
  );
  const rangoLargo = dias.length > MAX_DIAS;

  const query = useQuery({
    queryKey: ['carga-diaria', desde, finVisible],
    queryFn: () => getCargaDiaria(desde, finVisible),
    enabled: rangoValido && !rangoLargo,
  });
  const resumen = query.data ?? null;

  useEffect(() => {
    if (query.error)
      toast.error(
        query.error instanceof Error ? query.error.message : 'No se pudo cargar el período',
        { action: { label: 'Reintentar', onClick: () => void query.refetch() } },
      );
  }, [query.error, query.refetch]);

  useEffect(() => {
    if (!productoId && resumen?.productoPorDefectoId) setProductoId(resumen.productoPorDefectoId);
  }, [productoId, resumen?.productoPorDefectoId]);

  const producto = resumen?.productos.find((item) => item.id === productoId) ?? null;

  const columnas = useMemo<Columna[]>(() => {
    if (!resumen) return [];
    return [
      ...(resumen.controlaInventario
        ? [{ clave: 'produccion', titulo: 'Producción', tipo: 'cantidad' } as const]
        : []),
      ...resumen.categorias.map(
        (categoria) =>
          ({
            clave: `venta:${categoria.id}`,
            titulo: `Ventas ${categoria.nombre.toLocaleLowerCase('es')}`,
            tipo: 'monto',
            categoriaId: categoria.id,
          }) as const,
      ),
      { clave: 'gasto', titulo: 'Gastos', tipo: 'monto' } as const,
    ];
  }, [resumen]);

  const registradosPorDia = useMemo(
    () => new Map((resumen?.dias ?? []).map((dia) => [dia.fecha, dia])),
    [resumen],
  );

  const editable = useCallback(
    (fecha: string, columna: Columna) =>
      fecha <= (resumen?.hoy ?? hoyLocal) && !registrado(registradosPorDia.get(fecha), columna),
    [registradosPorDia, resumen?.hoy, hoyLocal],
  );

  function escribir(fecha: string, clave: string, valor: string) {
    setBorradores((actual) => {
      const dia = { ...(actual[fecha] ?? {}) };
      if (valor) dia[clave] = valor;
      else delete dia[clave];
      const siguiente = { ...actual };
      if (Object.keys(dia).length) siguiente[fecha] = dia;
      else delete siguiente[fecha];
      return siguiente;
    });
    setErrores((actual) => {
      if (!actual[fecha]) return actual;
      const siguiente = { ...actual };
      delete siguiente[fecha];
      return siguiente;
    });
  }

  /** Enter y flechas se mueven por la grilla, como en una hoja de cálculo. */
  function navegar(event: KeyboardEvent<HTMLInputElement>, fila: number, col: number) {
    const movimientos: Record<string, [number, number]> = {
      Enter: [event.shiftKey ? -1 : 1, 0],
      ArrowDown: [1, 0],
      ArrowUp: [-1, 0],
    };
    const paso = movimientos[event.key];
    if (!paso) return;
    event.preventDefault();
    for (let destino = fila + paso[0]; destino >= 0 && destino < dias.length; destino += paso[0]) {
      const celda = document.querySelector<HTMLInputElement>(
        `[data-celda="${destino}-${col + paso[1]}"]`,
      );
      if (celda) {
        celda.focus();
        celda.select();
        return;
      }
    }
  }

  /**
   * Pegar un bloque copiado de Excel (columnas separadas por tabulador, filas por salto de
   * línea) lo reparte desde la celda donde se pega, saltando lo que ya está registrado.
   */
  function pegar(event: ClipboardEvent<HTMLInputElement>, fila: number, col: number) {
    const texto = event.clipboardData.getData('text');
    if (!/[\t\n]/.test(texto.trim())) return;
    event.preventDefault();
    const filas = texto
      .replace(/\r/g, '')
      .split('\n')
      .filter((linea, indice, todas) => linea.trim() || indice < todas.length - 1);
    let pegadas = 0;
    filas.forEach((linea, df) => {
      const fecha = dias[fila + df];
      if (!fecha) return;
      linea.split('\t').forEach((valor, dc) => {
        const columna = columnas[col + dc];
        if (!columna || !editable(fecha, columna)) return;
        const numero = normalizarNumero(valor, columna.tipo === 'cantidad');
        if (numero) {
          escribir(fecha, columna.clave, numero);
          pegadas += 1;
        }
      });
    });
    if (pegadas) toast.success(`Se pegaron ${pegadas} valores.`);
  }

  const pendientes = Object.entries(borradores).filter(([, valores]) =>
    Object.values(valores).some((valor) => Number(valor) > 0),
  );
  const totales = pendientes.reduce(
    (suma, [, valores]) => {
      for (const [clave, valor] of Object.entries(valores)) {
        const numero = Number(valor) || 0;
        if (clave === 'produccion') suma.produccion += numero;
        else if (clave === 'gasto') suma.gastos += numero;
        else suma.ventas += numero;
      }
      return suma;
    },
    { produccion: 0, ventas: 0, gastos: 0 },
  );

  async function guardar() {
    if (!productoId) {
      toast.error('Elige el producto que se produce y se vende.');
      return;
    }
    const payload: CargaDiaPayload[] = pendientes.map(([fecha, valores]) => {
      const ventas = Object.entries(valores)
        .filter(([clave, valor]) => clave.startsWith('venta:') && Number(valor) > 0)
        .map(([clave, valor]) => ({
          categoriaId: Number(clave.slice('venta:'.length)),
          monto: Number(valor),
        }));
      return {
        fecha,
        ...(Number(valores.produccion) > 0 ? { produccion: Number(valores.produccion) } : {}),
        ...(ventas.length ? { ventas } : {}),
        ...(Number(valores.gasto) > 0 ? { gasto: Number(valores.gasto) } : {}),
      };
    });
    if (!payload.length) return;
    setGuardando(true);
    try {
      const { resultados } = await registrarCargaDiaria(productoId, payload);
      const ok = resultados.filter((item) => item.ok).map((item) => item.fecha);
      const fallidos = resultados.filter((item) => !item.ok);
      setBorradores((actual) => {
        const siguiente = { ...actual };
        for (const fecha of ok) delete siguiente[fecha];
        return siguiente;
      });
      setErrores(Object.fromEntries(fallidos.map((item) => [item.fecha, item.error ?? 'Error'])));
      if (ok.length)
        toast.success(ok.length === 1 ? 'Se registró 1 día.' : `Se registraron ${ok.length} días.`);
      if (fallidos.length)
        toast.error(
          fallidos.length === 1
            ? 'Un día no se pudo registrar: revisa el motivo en su fila.'
            : `${fallidos.length} días no se pudieron registrar: revisa el motivo en cada fila.`,
        );
      // Lo registrado aparece en ventas, gastos, producción y el panel: que se vuelvan a pedir.
      void queryClient.invalidateQueries({ queryKey: ['carga-diaria'] });
      for (const clave of ['sales', 'expenses', 'business-dashboard', 'production'])
        void queryClient.invalidateQueries({ queryKey: [clave] });
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'No se pudo registrar la carga');
    } finally {
      setGuardando(false);
    }
  }

  // Fecha + columnas + estado. En el celular cada día es una tarjeta con sus campos en dos
  // columnas; desde tablet es una fila de la grilla.
  const plantilla = `72px repeat(${columnas.length}, minmax(104px, 1fr)) minmax(96px, 0.8fr)`;
  // Si las columnas no entran, la grilla se desplaza en horizontal en vez de apretarlas.
  const anchoMinimo = 72 + columnas.length * 104 + 96 + (columnas.length + 1) * 8 + 24;

  return (
    <div className="module-page operations-list-page pb-28">
      <div className="operation-list-head">
        <div>
          <span className="operation-eyebrow">Caja y cuentas</span>
          <h1>Carga diaria</h1>
          <p>
            Carga los totales de cada día —producción, ventas por método de pago y gastos— y se
            registran como producción, ventas y gastos reales de esa fecha.
          </p>
        </div>
      </div>

      <PeriodFilter defaultPeriod="month" onChange={cambiarPeriodo} />

      {resumen && resumen.productos.length > 1 ? (
        <label className="mb-3 block max-w-sm">
          <span className={fieldLabelClass}>Producto que se produce y se vende</span>
          <select
            className={controlClass}
            value={productoId}
            onChange={(event) => setProductoId(event.target.value)}
          >
            {resumen.productos.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nombre} · {moneda(item.precio)}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {producto ? (
        <p className="mb-3 text-[13px] text-muted">
          Las ventas se registran a nombre de «Ventas del día» y se llevan toda la producción de ese
          día, repartida entre los métodos de pago según el monto de cada uno: lo producido no queda
          en stock. Si el día no tiene producción, los bidones se calculan con el precio de{' '}
          {producto.nombre} ({moneda(producto.precio)})
          {producto.retornable ? '. Los envases van con canje uno a uno' : ''}. Puedes pegar un
          bloque copiado de Excel: se reparte desde la celda donde pegas.
        </p>
      ) : null}

      {rangoLargo ? (
        <div className="empty-state">
          <ClipboardList size={26} />
          <h2>Rango demasiado largo</h2>
          <p>Elige un mes, una semana o un rango de hasta tres meses para cargar.</p>
        </div>
      ) : desde && !rangoValido ? (
        <div className="empty-state">
          <ClipboardList size={26} />
          <h2>Nada que cargar</h2>
          <p>Ese período todavía no empezó.</p>
        </div>
      ) : !resumen ? (
        <div className="table-loading" role="status">
          <span className="loading-spinner" /> Cargando días...
        </div>
      ) : (
        <div
          className="grid gap-2 tablet:gap-0 tablet:overflow-x-auto tablet:rounded-container-lg tablet:border tablet:border-line tablet:bg-surface"
          style={{
            ['--carga-columnas' as string]: plantilla,
            ['--carga-ancho' as string]: `${anchoMinimo}px`,
          }}
        >
          <div className="hidden border-b border-line bg-surface-soft px-3 py-2.5 text-[11px] font-semibold uppercase text-muted tablet:grid tablet:min-w-[var(--carga-ancho)] tablet:gap-2 tablet:[grid-template-columns:var(--carga-columnas)]">
            <span className="tablet:sticky tablet:left-0 tablet:z-[1] tablet:-ml-3 tablet:bg-surface-soft tablet:pl-3">
              Día
            </span>
            {columnas.map((columna) => (
              <span key={columna.clave} className="text-right">
                {columna.titulo}
                {columna.tipo === 'monto' ? ' (S/)' : ''}
              </span>
            ))}
            <span className="text-right">Estado</span>
          </div>

          {dias.map((fecha, fila) => {
            const registradoDia = registradosPorDia.get(fecha);
            const borrador = borradores[fecha];
            const error = errores[fecha];
            const cargados = columnas.filter((columna) => registrado(registradoDia, columna));
            const { dia, numero } = etiquetaDia(fecha);
            const finDeSemana = dia.startsWith('Sá') || dia.startsWith('Do');
            return (
              <div
                key={fecha}
                className={`grid grid-cols-2 gap-2 rounded-ui border border-line bg-surface p-3 tablet:min-w-[var(--carga-ancho)] tablet:items-center tablet:rounded-none tablet:border-0 tablet:border-b tablet:px-3 tablet:py-1.5 tablet:[grid-template-columns:var(--carga-columnas)] tablet:last:border-b-0 ${
                  error ? 'border-status-red-text' : ''
                }`}
              >
                {/* La fecha queda fija a la izquierda al desplazar la grilla en horizontal. */}
                <div className="col-span-2 flex items-baseline gap-1.5 tablet:sticky tablet:left-0 tablet:z-[1] tablet:col-span-1 tablet:-ml-3 tablet:self-stretch tablet:items-center tablet:bg-surface tablet:pl-3">
                  <strong className="text-[15px] tabular-nums text-fg">{numero}</strong>
                  <span className={`text-xs ${finDeSemana ? 'text-accent' : 'text-muted'}`}>
                    {dia}
                  </span>
                </div>

                {columnas.map((columna, col) => {
                  const hecho = registrado(registradoDia, columna);
                  const entero = columna.tipo === 'cantidad';
                  return (
                    <label key={columna.clave} className="min-w-0">
                      <span className={`${fieldLabelClass} tablet:hidden`}>
                        {columna.titulo}
                        {entero ? '' : ' (S/)'}
                      </span>
                      {hecho ? (
                        <span
                          className="flex h-10 items-center justify-end truncate rounded-full bg-surface-soft px-3 text-[13px] tabular-nums text-fg"
                          title={hecho.detalle}
                        >
                          {hecho.texto}
                        </span>
                      ) : (
                        <input
                          className={`${controlClass} text-right tabular-nums`}
                          data-celda={`${fila}-${col}`}
                          inputMode={entero ? 'numeric' : 'decimal'}
                          autoComplete="off"
                          placeholder="—"
                          value={borrador?.[columna.clave] ?? ''}
                          onChange={(event) =>
                            escribir(
                              fecha,
                              columna.clave,
                              filtrarTecleo(event.target.value, entero),
                            )
                          }
                          onKeyDown={(event) => navegar(event, fila, col)}
                          onPaste={(event) => pegar(event, fila, col)}
                          onFocus={(event) => event.target.select()}
                          aria-label={`${columna.titulo} del ${numero} (${dia})`}
                          disabled={guardando}
                        />
                      )}
                    </label>
                  );
                })}

                <div className="col-span-2 flex justify-end tablet:col-span-1">
                  {error ? (
                    <span className="text-right text-xs text-[#c52e49] dark:text-[#ff9db2]">
                      {error}
                    </span>
                  ) : cargados.length === columnas.length ? (
                    <Badge tone="green">Registrado</Badge>
                  ) : cargados.length ? (
                    <Badge tone="blue">Parcial</Badge>
                  ) : borrador ? (
                    <Badge tone="amber">Por guardar</Badge>
                  ) : (
                    <span className="text-xs text-muted">—</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {pendientes.length ? (
        <div className="operation-sticky-actions">
          <div className="operation-running-total">
            <span>
              {pendientes.length === 1
                ? '1 día por guardar'
                : `${pendientes.length} días por guardar`}
            </span>
            <strong>
              {[
                totales.produccion ? `${totales.produccion} producidos` : '',
                totales.ventas ? `Ventas ${moneda(totales.ventas)}` : '',
                totales.gastos ? `Gastos ${moneda(totales.gastos)}` : '',
              ]
                .filter(Boolean)
                .join(' · ')}
            </strong>
          </div>
          <Button type="button" onClick={() => void guardar()} disabled={guardando}>
            <Save size={16} />
            {guardando ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
