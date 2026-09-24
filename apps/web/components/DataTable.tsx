'use client';

import { Search } from 'lucide-react';
import { ReactNode, useMemo, useState } from 'react';

export type DataTableColumn<T> = {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  headClassName?: string;
  cellClassName?: string;
  /** Etiqueta de la tarjeta móvil junto al valor. `null` = sin etiqueta: la celda
   *  ocupa la tarjeta entera (título de la fila, acciones, subtotales). */
  cardLabel?: ReactNode | null;
};

type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  loadingLabel?: string;
  emptyMessage: ReactNode;
  searchable?: boolean;
  getSearchText?: (row: T) => string;
  searchPlaceholder?: string;
  pageSize?: number;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string;
};

const PAGE_SIZES = [10, 25, 50, 100];

function visiblePages(page: number, pages: number) {
  const candidates = new Set([1, 2, 3, page - 1, page, page + 1, pages - 2, pages - 1, pages]);
  const numbers = [...candidates]
    .filter((value) => value >= 1 && value <= pages)
    .sort((a, b) => a - b);
  const result: Array<number | string> = [];
  numbers.forEach((value, index) => {
    if (index > 0 && value - numbers[index - 1] > 1)
      result.push(`ellipsis-${numbers[index - 1]}-${value}`);
    result.push(value);
  });
  return result;
}

/**
 * Tabla declarativa: reemplaza a TableEnhancer (que mutaba el DOM con un
 * MutationObserver para inyectar buscador, paginación y el modo tarjeta móvil).
 * Acá cada página describe sus columnas y DataTable resuelve todo: filtra por
 * texto si `searchable`, pagina, y renderiza dos vistas (tabla desde `tablet:`,
 * tarjetas apiladas en móvil) a partir de las mismas columnas.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  loadingLabel = 'Cargando...',
  emptyMessage,
  searchable = false,
  getSearchText,
  searchPlaceholder = 'Buscar en este listado',
  pageSize: initialPageSize = 10,
  onRowClick,
  rowClassName,
}: DataTableProps<T>) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const filtered = useMemo(() => {
    if (!searchable) return rows;
    const term = query.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) => (getSearchText?.(row) ?? '').toLowerCase().includes(term));
  }, [rows, query, searchable, getSearchText]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  // Clamping en vez de resetear la página en cada cambio de filtro: si la
  // página actual deja de existir, cae sola a la última válida.
  const currentPage = Math.min(page, pages);
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const showFooter = !loading && filtered.length > 0;

  return (
    <div className="overflow-hidden rounded-ui border border-line bg-surface">
      {searchable ? (
        <div className="border-b border-line p-3">
          <label className="flex h-[42px] w-full max-w-[420px] items-center gap-2 rounded-control border border-line bg-surface-soft px-4 text-muted transition-colors focus-within:border-accent">
            <Search size={17} className="shrink-0" />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="min-w-0 flex-1 bg-transparent text-[13px] text-fg outline-none placeholder:text-muted"
            />
          </label>
        </div>
      ) : null}

      <div className="hidden overflow-x-auto tablet:block">
        <table className="w-full min-w-[780px] border-collapse text-[13px]">
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`border-b border-line bg-surface px-4 py-3.5 text-left text-[10px] font-medium uppercase tracking-wide text-muted ${column.headClassName ?? ''}`}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="p-0">
                  <div className="flex min-h-[120px] items-center justify-center gap-2.5 text-muted">
                    <span className="h-6 w-6 shrink-0 animate-spin rounded-full border-[3px] border-line border-t-accent" />
                    {loadingLabel}
                  </div>
                </td>
              </tr>
            ) : !paginated.length ? (
              <tr>
                <td colSpan={columns.length} className="p-0">
                  <div className="flex min-h-[120px] items-center justify-center gap-2.5 text-muted">
                    {emptyMessage}
                  </div>
                </td>
              </tr>
            ) : (
              paginated.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={`border-t border-line transition-colors hover:bg-surface-soft ${onRowClick ? 'cursor-pointer' : ''} ${rowClassName?.(row) ?? ''}`}
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={`px-4 py-3.5 align-middle text-fg ${column.cellClassName ?? ''}`}
                    >
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="tablet:hidden">
        {loading ? (
          <div className="flex min-h-[120px] items-center justify-center gap-2.5 p-4 text-muted">
            <span className="h-6 w-6 shrink-0 animate-spin rounded-full border-[3px] border-line border-t-accent" />
            {loadingLabel}
          </div>
        ) : !paginated.length ? (
          <div className="flex min-h-[120px] items-center justify-center gap-2.5 p-4 text-center text-muted">
            {emptyMessage}
          </div>
        ) : (
          <ul className="flex flex-col gap-2.5 p-3">
            {paginated.map((row) => (
              <li
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`rounded-ui border border-line bg-surface px-3.5 ${onRowClick ? 'cursor-pointer' : ''} ${rowClassName?.(row) ?? ''}`}
              >
                {columns.map((column) =>
                  column.cardLabel === null ? (
                    <div
                      key={column.key}
                      className="border-t border-line py-2.5 text-[13px] text-fg first:border-t-0"
                    >
                      {column.render(row)}
                    </div>
                  ) : (
                    <div
                      key={column.key}
                      className="flex items-baseline justify-between gap-3 border-t border-line py-2.5 first:border-t-0"
                    >
                      <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted">
                        {column.cardLabel ?? column.header}
                      </span>
                      <span className="text-right text-[13px] text-fg">{column.render(row)}</span>
                    </div>
                  ),
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {showFooter ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface px-3.5 py-3 text-[13px] text-muted">
          <span className="min-w-[92px]">
            Mostrando {(currentPage - 1) * pageSize + 1}-
            {Math.min(currentPage * pageSize, filtered.length)} de {filtered.length}
          </span>
          <div className="flex items-center gap-4">
            <label className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-muted">
              <span>Filas</span>
              <select
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(1);
                }}
                aria-label="Filas por página"
                className="h-[34px] min-w-[62px] cursor-pointer rounded-[9px] border border-line bg-surface px-2 text-fg outline-none focus-visible:border-accent"
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <nav className="flex items-center gap-1.5" aria-label="Páginas de la tabla">
              {visiblePages(currentPage, pages).map((item) =>
                typeof item === 'number' ? (
                  <button
                    type="button"
                    key={item}
                    onClick={() => setPage(item)}
                    aria-label={`Página ${item}`}
                    aria-current={item === currentPage ? 'page' : undefined}
                    className={`grid h-8 w-8 min-w-[32px] place-items-center rounded-full border text-xs font-semibold transition-colors ${
                      item === currentPage
                        ? 'border-accent bg-accent text-white'
                        : 'border-line bg-surface text-muted hover:border-accent hover:text-accent'
                    }`}
                  >
                    {item}
                  </button>
                ) : (
                  <span
                    key={item}
                    className="min-w-[18px] select-none text-center text-muted"
                    aria-hidden="true"
                  >
                    …
                  </span>
                ),
              )}
            </nav>
          </div>
        </div>
      ) : null}
    </div>
  );
}
