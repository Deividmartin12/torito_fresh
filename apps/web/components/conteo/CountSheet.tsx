'use client';

import {
  AlertTriangle,
  CheckCheck,
  ClipboardCheck,
  Droplet,
  Minus,
  Plus,
  Save,
  TriangleAlert,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { cargarParcial } from '../../lib/cargar';
import {
  ConteoResumen,
  FilaCuadre,
  HojaCuadre,
  LineaConteo,
  MOTIVOS_DIFERENCIA,
  createConteo,
  getConteos,
  getHojaCuadre,
} from '../../lib/conteos';
import { cantidad as formatoCantidad, fechaCorta, moneda } from '../../lib/format';
import { CatalogItem, getOperationCatalogs } from '../../lib/operations';
import { PeriodFilter } from '../PeriodFilter';
import { Segmented } from '../Segmented';
import { SearchableSelect } from '../SearchableSelect';
import { EntityList } from '../dashboard/EntityList';
import { PanelCard } from '../dashboard/PanelCard';
import { StatCard } from '../dashboard/StatCard';
import { Button } from '../ui/Button';
import { useUnidad } from '../UnidadProvider';
import { AddPositionDialog, PosicionNueva } from './AddPositionDialog';

/** Misma clave que usa el backend: producto + lote + estado. */
const clave = (fila: { productoId: string; loteId: string | null; estadoInventarioId: string }) =>
  `${fila.productoId}|${fila.loteId ?? ''}|${fila.estadoInventarioId}`;

/** Una posición agregada a mano nace con todo en cero: no existe en el almacén todavía. */
const filaDesdePosicion = (posicion: PosicionNueva): FilaCuadre => ({
  stockId: null,
  productoId: posicion.productoId,
  producto: posicion.producto,
  codigo: posicion.codigo,
  unidadMedida: posicion.unidadMedida,
  controlaLote: posicion.controlaLote,
  loteId: posicion.loteId,
  lote: posicion.lote,
  loteEstado: null,
  // Solo existe un estado de inventario en el sistema (DISPONIBLE, id 1) y todo lo que entra
  // entra como disponible; el backend lo reasegura con un upsert.
  estadoInventarioId: '1',
  estado: 'DISPONIBLE',
  saldoInicial: 0,
  producido: 0,
  consumido: 0,
  vendido: 0,
  devuelto: 0,
  mermas: 0,
  ajustes: 0,
  otros: 0,
  teorico: 0,
  costoPromedio: 0,
  costoSugerido: posicion.costoUnitario,
  ledgerCuadra: true,
});

export function CountSheet() {
  const [almacenes, setAlmacenes] = useState<CatalogItem[]>([]);
  const [productos, setProductos] = useState<CatalogItem[]>([]);
  const [almacenId, setAlmacenId] = useState('');
  const [fecha, setFecha] = useState('');
  const [hoja, setHoja] = useState<HojaCuadre | null>(null);
  const [extras, setExtras] = useState<FilaCuadre[]>([]);
  const [contados, setContados] = useState<Record<string, string>>({});
  const [motivos, setMotivos] = useState<Record<string, string>>({});
  const [observaciones, setObservaciones] = useState('');
  const [mostrarVacias, setMostrarVacias] = useState(false);
  const [agregando, setAgregando] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [pestana, setPestana] = useState('Cuadre');
  const [historial, setHistorial] = useState<ConteoResumen[]>([]);
  const { clave: unidad } = useUnidad();

  // Catálogos: los almacenes vienen acotados a la unidad donde se va a escribir, que es la
  // misma que resuelve el backend al guardar.
  const cargarCatalogos = useCallback(async () => {
    try {
      const catalogos = await getOperationCatalogs();
      setAlmacenes(catalogos.almacenes);
      setProductos(catalogos.productos);
      setAlmacenId((actual) => actual || (catalogos.almacenes[0]?.id ?? ''));
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'No se pudieron cargar los almacenes');
    }
  }, []);
  useEffect(() => {
    void cargarCatalogos();
  }, [cargarCatalogos, unidad]);

  const cargarHoja = useCallback(async () => {
    if (!almacenId || !fecha) return;
    setCargando(true);
    const [sheet, counts] = await cargarParcial([
      getHojaCuadre(almacenId, fecha),
      getConteos(fecha, fecha, almacenId),
    ] as const);
    if (sheet.valor) {
      setHoja(sheet.valor);
      // Cada recarga limpia lo tecleado: los números de la hoja cambiaron y contar contra los
      // viejos es justo lo que el bloqueo del servidor rechaza.
      setContados({});
      setMotivos({});
      setExtras([]);
    }
    if (counts.valor) setHistorial(counts.valor);
    setCargando(false);
    if (sheet.error) {
      toast.error(sheet.error.message || 'No se pudo cargar la hoja de cuadre', {
        action: { label: 'Reintentar', onClick: () => void cargarHoja() },
      });
    }
  }, [almacenId, fecha]);
  useEffect(() => {
    void cargarHoja();
  }, [cargarHoja]);

  const cambiarPeriodo = useCallback((desde: string) => setFecha(desde), []);

  const filas = useMemo(() => [...(hoja?.filas ?? []), ...extras], [extras, hoja]);
  const visibles = useMemo(
    () => filas.filter((fila) => mostrarVacias || fila.teorico !== 0 || fila.stockId === null),
    [filas, mostrarVacias],
  );
  const enCero = filas.filter((fila) => fila.teorico === 0 && fila.stockId !== null).length;

  const diferenciaDe = (fila: FilaCuadre) => {
    const texto = contados[clave(fila)];
    if (texto === undefined || texto === '') return null;
    return Math.round((Number(texto) - fila.teorico) * 1000) / 1000;
  };
  const contadas = filas.filter((fila) => {
    const texto = contados[clave(fila)];
    return texto !== undefined && texto !== '';
  });
  const conDiferencia = contadas.filter((fila) => (diferenciaDe(fila) ?? 0) !== 0);
  const diferenciaTotal = conDiferencia.reduce((suma, fila) => suma + (diferenciaDe(fila) ?? 0), 0);

  function escribir(fila: FilaCuadre, valor: string) {
    const limpio = valor.replace(/[^0-9.]/g, '');
    setContados((actual) => ({ ...actual, [clave(fila)]: limpio }));
  }
  function sumar(fila: FilaCuadre, paso: number) {
    setContados((actual) => {
      const texto = actual[clave(fila)];
      const base = texto === undefined || texto === '' ? fila.teorico : Number(texto);
      return { ...actual, [clave(fila)]: String(Math.max(base + paso, 0)) };
    });
  }
  function todoCuadra() {
    setContados((actual) => {
      const siguiente = { ...actual };
      for (const fila of visibles) {
        const llave = clave(fila);
        if (siguiente[llave] === undefined || siguiente[llave] === '')
          siguiente[llave] = String(fila.teorico);
      }
      return siguiente;
    });
  }

  async function guardar(forzar = false) {
    if (!contadas.length) return toast.error('Anotá al menos una posición para guardar el conteo.');
    setGuardando(true);
    try {
      const lineas: LineaConteo[] = contadas.map((fila) => ({
        stockId: fila.stockId ?? undefined,
        productoId: fila.productoId,
        loteId: fila.loteId ?? undefined,
        estadoInventarioId: fila.estadoInventarioId,
        contado: Number(contados[clave(fila)]),
        teorico: fila.teorico,
        costoUnitario: fila.stockId === null ? fila.costoSugerido : undefined,
        motivo: motivos[clave(fila)] || undefined,
      }));
      const conteo = await createConteo({
        almacenId,
        fecha,
        observaciones: observaciones.trim() || undefined,
        forzar: forzar || undefined,
        lineas,
      });
      toast.success(
        conteo.diferencias
          ? `Conteo guardado: se corrigieron ${conteo.diferencias} posiciones`
          : 'Conteo guardado: todo cuadraba',
      );
      setObservaciones('');
      await cargarHoja();
    } catch (cause) {
      const mensaje = cause instanceof Error ? cause.message : 'No se pudo guardar el conteo';
      // 409: el stock se movió mientras se contaba. Se ofrece aplicar la diferencia sobre el
      // saldo de ahora, que conserva las ventas del medio.
      const desincronizado = mensaje.includes('cambió mientras contabas');
      toast.error(mensaje, {
        duration: desincronizado ? 12_000 : 6_000,
        action: desincronizado
          ? { label: 'Aplicar la diferencia igual', onClick: () => void guardar(true) }
          : undefined,
      });
    } finally {
      setGuardando(false);
    }
  }

  const clavesEnLaHoja = new Set(filas.map((fila) => clave(fila)));

  return (
    <div className="count-sheet-page">
      <div className="module-tools count-sheet-tools">
        <label className="filter-field count-sheet-warehouse">
          <span>Almacén</span>
          <SearchableSelect
            value={almacenId}
            onChange={setAlmacenId}
            options={almacenes.map((item) => ({ value: item.id, label: item.nombre }))}
            placeholder="Elegí el almacén"
          />
        </label>
      </div>

      <PeriodFilter defaultPeriod="day" onChange={cambiarPeriodo} />

      <Segmented
        options={[
          { value: 'Cuadre', label: 'Cuadre' },
          { value: 'Historial', label: 'Historial' },
        ]}
        value={pestana}
        onChange={setPestana}
        ariaLabel="Qué mirar"
      />

      {pestana === 'Historial' ? (
        <PanelCard title="Conteos de esta fecha">
          <EntityList
            rows={historial.map((conteo) => ({
              id: conteo.id,
              icon: <ClipboardCheck size={18} />,
              tone: conteo.diferencias ? ('amber' as const) : ('green' as const),
              title:
                conteo.tipo === 'CARGA_INICIAL' ? 'Carga inicial de inventario' : 'Conteo físico',
              meta: `${conteo.almacen} · ${conteo.registradoPor} · ${conteo.contadas} posiciones`,
              amount: conteo.diferencias
                ? `−${formatoCantidad(conteo.unidadesFaltantes)} / +${formatoCantidad(
                    conteo.unidadesSobrantes,
                  )}`
                : 'Cuadró',
              status: conteo.diferencias
                ? { label: `${conteo.diferencias} corregidas`, tone: 'amber' as const }
                : { label: 'Sin diferencias', tone: 'green' as const },
            }))}
            empty="Todavía no se contó el inventario en esta fecha."
          />
        </PanelCard>
      ) : cargando && !hoja ? (
        <div className="dashboard-loading" role="status">
          <span className="loading-spinner" /> Preparando la hoja de cuadre...
        </div>
      ) : hoja ? (
        <>
          {!hoja.esHoy ? (
            <p className="count-warning">
              <TriangleAlert size={16} />
              Estás contando el {fechaCorta(hoja.fecha)}. El ajuste corrige el stock de ahora y
              queda fechado ese día, así que ese día cuadra en el kardex.
            </p>
          ) : null}
          {hoja.primeraCarga ? (
            <p className="count-warning count-warning-info">
              <ClipboardCheck size={16} />
              Este almacén todavía no tiene nada cargado. Agregá los productos que ya tenés con su
              cantidad y su costo: eso es la carga inicial del inventario.
            </p>
          ) : null}
          {hoja.totales.ledgerDescuadrado > 0 ? (
            <p className="count-warning">
              <AlertTriangle size={16} />
              En {hoja.totales.ledgerDescuadrado} posiciones el kardex y el saldo guardado no
              coinciden. Viene de antes de este conteo; al guardar, el stock queda en lo que
              contaste.
            </p>
          ) : null}
          {hoja.conteoDelDia ? (
            <p className="count-warning count-warning-info">
              <ClipboardCheck size={16} />
              Esta fecha ya tiene un conteo de {hoja.conteoDelDia.registradoPor}
              {hoja.conteoDelDia.diferencias === 0
                ? ', y cuadraba'
                : ` con ${hoja.conteoDelDia.diferencias} ${
                    hoja.conteoDelDia.diferencias === 1 ? 'diferencia' : 'diferencias'
                  }`}
              . Guardar otro encadena una corrección más.
            </p>
          ) : null}

          <section className="stat-grid" aria-label="Resumen del día">
            <StatCard
              icon={<Droplet size={19} />}
              label="Producido"
              value={formatoCantidad(hoja.totales.producido)}
              detail="Entró por producción"
              tone="blue"
            />
            <StatCard
              icon={<Minus size={19} />}
              label="Vendido"
              value={formatoCantidad(hoja.totales.vendido)}
              detail="Salió por ventas"
              tone="amber"
            />
            <StatCard
              icon={<ClipboardCheck size={19} />}
              label="Debería haber"
              value={formatoCantidad(hoja.totales.teorico)}
              detail={`${hoja.totales.posiciones} ${
                hoja.totales.posiciones === 1 ? 'posición' : 'posiciones'
              } · ${moneda(hoja.totales.valorizado)}`}
              tone="violet"
            />
            <StatCard
              icon={diferenciaTotal === 0 ? <CheckCheck size={19} /> : <AlertTriangle size={19} />}
              label="Diferencia"
              value={
                contadas.length === 0
                  ? '—'
                  : `${diferenciaTotal > 0 ? '+' : ''}${formatoCantidad(diferenciaTotal)}`
              }
              detail={
                contadas.length === 0
                  ? 'Todavía no contaste nada'
                  : `${contadas.length} ${
                      contadas.length === 1 ? 'contada' : 'contadas'
                    } · ${conDiferencia.length} con diferencia`
              }
              tone={diferenciaTotal === 0 ? 'green' : 'red'}
            />
          </section>

          <div className="count-sheet">
            <div className="count-sheet-head" aria-hidden="true">
              <span>Producto</span>
              <span>Debería haber</span>
              <span>Conté</span>
              <span>Diferencia</span>
            </div>
            {visibles.map((fila) => {
              const llave = clave(fila);
              const diferencia = diferenciaDe(fila);
              const tono =
                diferencia === null
                  ? 'none'
                  : diferencia === 0
                    ? 'ok'
                    : diferencia > 0
                      ? 'over'
                      : 'short';
              return (
                <div className={`count-row count-row-${tono}`} key={llave}>
                  <div className="count-cell count-product">
                    <strong>{fila.producto}</strong>
                    <small>
                      {fila.lote} · {fila.codigo}
                      {fila.stockId === null ? ' · posición nueva' : ''}
                    </small>
                    <details className="count-breakdown">
                      <summary>De dónde sale</summary>
                      <ul>
                        <li>
                          Arrancó con <b>{formatoCantidad(fila.saldoInicial)}</b>
                        </li>
                        {fila.producido ? (
                          <li>
                            Se produjeron <b>+{formatoCantidad(fila.producido)}</b>
                          </li>
                        ) : null}
                        {fila.consumido ? (
                          <li>
                            Se consumieron como insumo <b>−{formatoCantidad(fila.consumido)}</b>
                          </li>
                        ) : null}
                        {fila.vendido ? (
                          <li>
                            Se vendieron <b>−{formatoCantidad(fila.vendido)}</b>
                          </li>
                        ) : null}
                        {fila.devuelto ? (
                          <li>
                            Devolvieron <b>+{formatoCantidad(fila.devuelto)}</b>
                          </li>
                        ) : null}
                        {fila.mermas ? (
                          <li>
                            Mermas y roturas <b>−{formatoCantidad(fila.mermas)}</b>
                          </li>
                        ) : null}
                        {fila.ajustes ? (
                          <li>
                            Ajustes previos <b>{formatoCantidad(fila.ajustes)}</b>
                          </li>
                        ) : null}
                        <li>
                          Costo por unidad:{' '}
                          <b>{moneda(fila.costoPromedio || fila.costoSugerido)}</b>
                        </li>
                      </ul>
                    </details>
                  </div>
                  <div className="count-cell count-theoretical">
                    <span className="count-cell-label">Debería haber</span>
                    <strong>{formatoCantidad(fila.teorico)}</strong>
                  </div>
                  <div className="count-cell count-input-cell">
                    <span className="count-cell-label">Conté</span>
                    <div className="qty-stepper">
                      <button
                        type="button"
                        onClick={() => sumar(fila, -1)}
                        aria-label={`Quitar uno de ${fila.producto}`}
                      >
                        <Minus size={17} />
                      </button>
                      <input
                        className="count-input"
                        type="text"
                        inputMode="decimal"
                        value={contados[llave] ?? ''}
                        onChange={(event) => escribir(fila, event.target.value)}
                        onFocus={(event) => event.target.select()}
                        placeholder="—"
                        aria-label={`Cantidad contada de ${fila.producto}`}
                      />
                      <button
                        type="button"
                        onClick={() => sumar(fila, 1)}
                        aria-label={`Agregar uno de ${fila.producto}`}
                      >
                        <Plus size={17} />
                      </button>
                    </div>
                  </div>
                  <div className="count-cell count-diff-cell">
                    <span className="count-cell-label">Diferencia</span>
                    {diferencia === null ? (
                      <span className="count-diff-chip count-diff-none">sin contar</span>
                    ) : (
                      <span className={`count-diff-chip count-diff-${tono}`}>
                        {diferencia > 0 ? '+' : ''}
                        {formatoCantidad(diferencia)}
                      </span>
                    )}
                    {diferencia !== null && diferencia !== 0 ? (
                      <select
                        className="count-motivo"
                        value={motivos[llave] ?? ''}
                        onChange={(event) =>
                          setMotivos((actual) => ({ ...actual, [llave]: event.target.value }))
                        }
                        aria-label={`Motivo de la diferencia de ${fila.producto}`}
                      >
                        <option value="">¿Por qué?</option>
                        {MOTIVOS_DIFERENCIA.map((motivo) => (
                          <option key={motivo.value} value={motivo.value}>
                            {motivo.label}
                          </option>
                        ))}
                      </select>
                    ) : null}
                  </div>
                </div>
              );
            })}
            {!visibles.length ? (
              <div className="entity-list-empty">
                Este almacén no tiene posiciones con stock. Agregá los productos que tengas para
                cargar el inventario.
              </div>
            ) : null}
          </div>

          <div className="count-sheet-extras">
            <Button variant="secondary" type="button" onClick={() => setAgregando(true)}>
              <Plus size={16} /> Agregar producto al conteo
            </Button>
            <Button variant="secondary" type="button" onClick={todoCuadra}>
              <CheckCheck size={16} /> Todo cuadra
            </Button>
            {enCero > 0 ? (
              <Button
                variant="secondary"
                type="button"
                onClick={() => setMostrarVacias((valor) => !valor)}
              >
                {mostrarVacias ? 'Ocultar' : 'Mostrar'} posiciones vacías ({enCero})
              </Button>
            ) : null}
          </div>

          <label className="count-note">
            <span className="label">Observaciones del conteo</span>
            <input
              type="text"
              value={observaciones}
              onChange={(event) => setObservaciones(event.target.value)}
              placeholder="Opcional: quién contó, qué pasó"
              maxLength={300}
            />
          </label>

          <div className="operation-sticky-actions">
            <div className="operation-running-total">
              <span>
                {contadas.length} de {visibles.length} contadas
              </span>
              <strong>
                {conDiferencia.length
                  ? `${conDiferencia.length} con diferencia`
                  : contadas.length
                    ? 'Todo cuadra'
                    : 'Sin contar'}
              </strong>
            </div>
            <Button
              type="button"
              shape="rect"
              className="min-h-[48px] max-[700px]:col-span-2 max-[700px]:row-start-2 max-[700px]:w-full"
              onClick={() => void guardar()}
              disabled={guardando || !contadas.length}
            >
              <Save size={17} /> {guardando ? 'Guardando...' : 'Guardar conteo'}
            </Button>
          </div>
        </>
      ) : null}

      {agregando ? (
        <AddPositionDialog
          productos={productos}
          yaEnLaHoja={clavesEnLaHoja}
          onClose={() => setAgregando(false)}
          onAdd={(posicion) => setExtras((actual) => [...actual, filaDesdePosicion(posicion)])}
        />
      ) : null}
    </div>
  );
}
