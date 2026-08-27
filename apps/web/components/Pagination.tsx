'use client';

type Props = {
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
};

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

export function Pagination({ page, pages, total, pageSize, onChange, onPageSizeChange }: Props) {
  // El marcador evita que TableEnhancer agregue otra paginación mientras cargan los datos.
  if (total === 0)
    return (
      <div className="table-pagination manual-table-pagination-marker" hidden aria-hidden="true" />
    );
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="table-pagination">
      <span>
        Mostrando {from}-{to} de {total}
      </span>
      {onPageSizeChange ? (
        <label className="pagination-size">
          <span>Filas</span>
          <select
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            aria-label="Filas por página"
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </label>
      ) : null}
      <nav className="pagination-pages" aria-label="Páginas de la tabla">
        {visiblePages(page, pages).map((item) =>
          typeof item === 'number' ? (
            <button
              type="button"
              key={item}
              className={item === page ? 'active' : ''}
              onClick={() => onChange(item)}
              aria-label={`Página ${item}`}
              aria-current={item === page ? 'page' : undefined}
            >
              {item}
            </button>
          ) : (
            <span className="pagination-ellipsis" key={item} aria-hidden="true">
              …
            </span>
          ),
        )}
      </nav>
    </div>
  );
}
