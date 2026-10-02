'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Pencil, Save } from 'lucide-react';
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
  | { clave: 'produccion1' | 'produccion2'; titulo: string; tipo: 'cantidad' }
  | {
      clave: `venta:${string}`;
      titulo: string;
      tipo: 'monto';
      metodoPagoId: string;
      categoriaId: string;
      historico?: boolean;
    }
  | { clave: 'gasto1' | 'gasto2'; titulo: string; tipo: 'monto' };

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
  if (!Number.isFinite(numero) || numero < 0) return '';
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
  if (columna.clave === 'produccion1' || columna.clave === 'produccion2') {
    const valor = dia.produccion;
    if (!valor) return null;
    const indice = columna.clave === 'produccion1' ? 0 : 1;
    return {
      texto: valor.partes
        ? String(valor.partes[indice])
        : indice === 0
          ? String(valor.cantidad)
          : '—',
      detalle: valor.partes ? (valor.codigo ?? 'Producción') : 'Total anterior, sin desglose',
    };
  }
  if (columna.clave === 'gasto1' || columna.clave === 'gasto2') {
    const valor = dia.gasto;
    if (!valor) return null;
    const indice = columna.clave === 'gasto1' ? 0 : 1;
    return {
      texto: valor.partes ? moneda(valor.partes[indice]) : indice === 0 ? moneda(valor.monto) : '—',
      detalle: valor.partes ? 'Gasto del día' : 'Total anterior, sin desglose',
    };
  }
  if (!('metodoPagoId' in columna)) return null;
  const venta = dia.ventas.find((item) => item.metodoPagoId === columna.metodoPagoId);
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
  const [ediciones, setEdiciones] = useState<
    Record<string, { registro: CargaDiaRegistrado; borrador?: Record<string, string> }>
  >({});

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
      ...resumen.metodos.map(
        (metodo) =>
          ({
            clave: `venta:${metodo.id}`,
            titulo: metodo.nombre,
            tipo: 'monto',
            metodoPagoId: metodo.id,
            categoriaId: metodo.categoriaId,
          }) as const,
      ),
      ...resumen.historicos.map(
        (metodo) =>
          ({
            clave: `venta:${metodo.id}`,
            titulo: metodo.nombre,
            tipo: 'monto',
            metodoPagoId: metodo.id,
            categoriaId: metodo.categoriaId,
            historico: true,
          }) as const,
      ),
      { clave: 'gasto1', titulo: 'Gastos 1', tipo: 'monto' } as const,
      { clave: 'gasto2', titulo: 'Gastos 2', tipo: 'monto' } as const,
      ...(resumen.controlaInventario
        ? [
            { clave: 'produccion1', titulo: 'Producción 1', tipo: 'cantidad' } as const,
            { clave: 'produccion2', titulo: 'Producción 2', tipo: 'cantidad' } as const,
          ]
        : []),
    ];
  }, [resumen]);

  const registradosPorDia = useMemo(
    () => new Map((resumen?.dias ?? []).map((dia) => [dia.fecha, dia])),
    [resumen],
  );

  const editable = useCallback(
    (fecha: string, columna: Columna) =>
      fecha <= (resumen?.hoy ?? hoyLocal) &&
      !('historico' in columna && columna.historico) &&
      (Boolean(ediciones[fecha]) || !registrado(registradosPorDia.get(fecha), columna)) &&
      !(
        'categoriaId' in columna &&
        registradosPorDia
          .get(fecha)
          ?.ventas.some(
            (v) => v.metodoPagoId.startsWith('anterior:') && v.categoriaId === columna.categoriaId,
          )
      ),
    [registradosPorDia, resumen?.hoy, hoyLocal, ediciones],
  );

  function editarDia(fecha: string) {
    const registro = registradosPorDia.get(fecha);
    if (!registro) return;
    const valores: Record<string, string> = { ...borradores[fecha] };
    if (registro.produccion) {
      const partes = registro.produccion.partes ?? [registro.produccion.cantidad, 0];
      valores.produccion1 = String(partes[0]);
      valores.produccion2 = String(partes[1]);
    }
    if (registro.gasto) {
      const partes = registro.gasto.partes ?? [registro.gasto.monto, 0];
      valores.gasto1 = String(partes[0]);
      valores.gasto2 = String(partes[1]);
    }
    for (const venta of registro.ventas)
      valores[`venta:${venta.metodoPagoId}`] = String(venta.monto);
    setEdiciones((actual) => ({ ...actual, [fecha]: { registro, borrador: borradores[fecha] } }));
    setBorradores((actual) => ({ ...actual, [fecha]: valores }));
    setErrores((actual) => ({ ...actual, [fecha]: '' }));
  }

  function cancelarEdicion(fecha: string) {
    const previo = ediciones[fecha]?.borrador;
    setBorradores((actual) => {
      const siguiente = { ...actual };
      if (previo) siguiente[fecha] = previo;
      else delete siguiente[fecha];
      return siguiente;
    });
    setEdiciones((actual) => {
      const siguiente = { ...actual };
      delete siguiente[fecha];
      return siguiente;
    });
    setErrores((actual) => ({ ...actual, [fecha]: '' }));
  }

  function escribir(fecha: string, clave: string, valor: string) {
    setBorradores((actual) => {
      const dia = { ...(actual[fecha] ?? {}) };
      if (valor) dia[clave] = valor;
      else delete dia[clave];
      const siguiente = { ...actual };
      if (Object.keys(dia).length || ediciones[fecha]) siguiente[fecha] = dia;
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
      if (celda && !celda.disabled) {
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

  const pendientes = Object.entries(borradores).filter(
    ([fecha, valores]) =>
      ediciones[fecha] || Object.values(valores).some((valor) => Number(valor) > 0),
  );
  const totales = pendientes.reduce(
    (suma, [, valores]) => {
      for (const [clave, valor] of Object.entries(valores)) {
        const numero = Number(valor) || 0;
        if (clave.startsWith('produccion')) suma.produccion += numero;
        else if (clave.startsWith('gasto')) suma.gastos += numero;
        else suma.ventas += numero;
      }
      return suma;
    },
    { produccion: 0, ventas: 0, gastos: 0 },
  );

  async function guardar(soloFecha?: string) {
    if (guardando) return;
    if (!productoId) {
      toast.error('Elige el producto que se produce y se vende.');
      return;
    }
    const seleccionados = pendientes.filter(([fecha]) => !soloFecha || fecha === soloFecha);
    if (!seleccionados.length) return;
    const grupos = new Map<string, CargaDiaPayload[]>();
    for (const [fecha, valores] of seleccionados) {
      const edicion = ediciones[fecha]?.registro;
      const previo = edicion ?? registradosPorDia.get(fecha);
      const ventas = columnas.flatMap((columna) => {
        if (!('metodoPagoId' in columna) || columna.historico) return [];
        const monto = Number(valores[columna.clave]) || 0;
        const existente = edicion?.ventas.some((v) => v.metodoPagoId === columna.metodoPagoId);
        return monto > 0 || existente
          ? [{ metodoPagoId: Number(columna.metodoPagoId), monto }]
          : [];
      });
      const payload: CargaDiaPayload = {
        fecha,
        ...(edicion ? { editar: true, revision: edicion.revision } : {}),
        ...(edicion?.produccion ||
        [valores.produccion1, valores.produccion2].some((v) => Number(v) > 0)
          ? { producciones: [Number(valores.produccion1) || 0, Number(valores.produccion2) || 0] }
          : {}),
        ...(ventas.length ? { ventas } : {}),
        ...(edicion?.gasto || [valores.gasto1, valores.gasto2].some((v) => Number(v) > 0)
          ? { gastos: [Number(valores.gasto1) || 0, Number(valores.gasto2) || 0] }
          : {}),
      };
      const productoDia = previo?.productoId ?? productoId;
      grupos.set(productoDia, [...(grupos.get(productoDia) ?? []), payload]);
    }
    setGuardando(true);
    try {
      const resultados: { fecha: string; ok: boolean; error?: string }[] = [];
      for (const [productoDia, payload] of grupos) {
        try {
          const respuesta = await registrarCargaDiaria(productoDia, payload);
          resultados.push(...respuesta.resultados);
        } catch (cause) {
          resultados.push(
            ...payload.map((dia) => ({
              fecha: dia.fecha,
              ok: false,
              error: cause instanceof Error ? cause.message : 'No se pudo guardar el día',
            })),
          );
        }
      }
      const ok = resultados.filter((item) => item.ok).map((item) => item.fecha);
      const fallidos = resultados.filter((item) => !item.ok);
      setBorradores((actual) => {
        const siguiente = { ...actual };
        for (const fecha of ok) delete siguiente[fecha];
        return siguiente;
      });
      setEdiciones((actual) => {
        const siguiente = { ...actual };
        for (const fecha of ok) delete siguiente[fecha];
        return siguiente;
      });
      setErrores((actual) => ({
        ...actual,
        ...Object.fromEntries(
          resultados.map((item) => [item.fecha, item.ok ? '' : (item.error ?? 'Error')]),
        ),
      }));
      if (ok.length)
        toast.success(ok.length === 1 ? 'Día guardado.' : `Se guardaron ${ok.length} días.`);
      if (fallidos.length)
        toast.error(
          fallidos.length === 1
            ? 'Un día no se pudo registrar: revisa el motivo en su fila.'
            : `${fallidos.length} días no se pudieron registrar: revisa el motivo en cada fila.`,
        );
      // Lo registrado aparece en ventas, gastos, producción y el panel: que se vuelvan a pedir.
      void queryClient.invalidateQueries({ queryKey: ['carga-diaria'] });
      for (const clave of [
        'sales',
        'expenses',
        'business-dashboard',
        'production',
        'stock',
        'kardex',
        'reports',
      ])
        void queryClient.invalidateQueries({ queryKey: [clave] });
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'No se pudo registrar la carga');
    } finally {
      setGuardando(false);
    }
  }

  // Fecha + columnas + estado. En el celular cada día es una tarjeta con sus campos en dos
  // columnas; desde tablet es una fila de la grilla.
  const plantilla = `72px repeat(${columnas.length}, minmax(104px, 1fr)) minmax(144px, 0.8fr)`;
  // Si las columnas no entran, la grilla se desplaza en horizontal en vez de apretarlas.
  const anchoMinimo = 72 + columnas.length * 104 + 144 + (columnas.length + 1) * 8 + 24;

  return (
    <div className="module-page operations-list-page !pb-44">
      <div className="operation-list-head">
        <div>
          <span className="operation-eyebrow">Caja y cuentas</span>
          <h1>Carga diaria</h1>
          <p>
            Carga las ventas por método de pago, gastos y producción de bidones de cada día. Se
            suman Gastos 1 + Gastos 2 y Producción 1 + Producción 2 para registrar los totales de
            esa fecha. Usa Editar para corregir un día ya guardado.
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
            const editando = Boolean(ediciones[fecha]);
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
                      {hecho && (!editando || ('historico' in columna && columna.historico)) ? (
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
                          disabled={guardando || !editable(fecha, columna)}
                        />
                      )}
                      {columna.clave === 'gasto2' ? (
                        <small className="block pt-1 text-right text-xs text-muted">
                          Total:{' '}
                          {moneda(
                            (!editando ? registradoDia?.gasto?.monto : undefined) ??
                              (Math.round((Number(borrador?.gasto1) || 0) * 100) +
                                Math.round((Number(borrador?.gasto2) || 0) * 100)) /
                                100,
                          )}
                        </small>
                      ) : null}
                      {columna.clave === 'produccion2' ? (
                        <small className="block pt-1 text-right text-xs text-muted">
                          Total:{' '}
                          {(!editando ? registradoDia?.produccion?.cantidad : undefined) ??
                            (Number(borrador?.produccion1) || 0) +
                              (Number(borrador?.produccion2) || 0)}{' '}
                          bidones
                        </small>
                      ) : null}
                    </label>
                  );
                })}

                <div className="col-span-2 flex flex-col items-end gap-1.5 tablet:col-span-1">
                  {error ? (
                    <span className="text-right text-xs text-[#c52e49] dark:text-[#ff9db2]">
                      {error}
                    </span>
                  ) : editando ? (
                    <Badge tone="amber">Editando</Badge>
                  ) : cargados.length === columnas.length ? (
                    <Badge tone="green">Registrado</Badge>
                  ) : cargados.length ? (
                    <Badge tone="blue">Parcial</Badge>
                  ) : borrador ? (
                    <Badge tone="amber">Por guardar</Badge>
                  ) : (
                    <span className="text-xs text-muted">—</span>
                  )}
                  {editando ? (
                    <>
                      <Button
                        disabled={guardando}
                        onClick={() => void guardar(fecha)}
                        aria-label={`Guardar cambios del ${fecha}`}
                      >
                        <Save size={14} /> Guardar cambios
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={guardando}
                        onClick={() => cancelarEdicion(fecha)}
                        aria-label={`Cancelar edición del ${fecha}`}
                      >
                        Cancelar
                      </Button>
                    </>
                  ) : registradoDia ? (
                    <Button
                      variant="secondary"
                      disabled={guardando}
                      onClick={() => editarDia(fecha)}
                      aria-label={`Editar día ${fecha}`}
                    >
                      <Pencil size={14} /> Editar
                    </Button>
                  ) : null}
                  {registradoDia?.produccion && !editando ? (
                    <small className="text-right text-xs text-muted">
                      {registradoDia.ventas.reduce((suma, venta) => suma + venta.cantidad, 0)}{' '}
                      vendidos de {registradoDia.produccion.cantidad} producidos
                    </small>
                  ) : null}
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
