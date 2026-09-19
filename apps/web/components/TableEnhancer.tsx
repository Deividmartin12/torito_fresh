'use client';

import { useEffect } from 'react';

/**
 * Copia en cada <td> la etiqueta de su columna (data-label) para que el CSS móvil
 * pueda mostrar la tabla como tarjetas apiladas sin tocar ninguna página.
 * Corre sobre TODAS las tablas, también las que traen paginación propia.
 */
function stampCardLabels(table: HTMLTableElement) {
  const headRow = table.tHead?.rows[0];
  if (!headRow) return;
  // Una entrada por columna real: un <th colspan="2"> ocupa dos posiciones.
  const headers = Array.from(headRow.cells).flatMap((th) =>
    Array<string>(th.colSpan || 1).fill(th.textContent?.trim() ?? ''),
  );
  const signature = headers.join('|');

  // display:block en móvil borra los roles implícitos de tabla; los explícitos
  // son idénticos, así que ponerlos siempre no cambia nada en escritorio.
  table.setAttribute('role', 'table');
  table.tHead?.setAttribute('role', 'rowgroup');

  for (const body of Array.from(table.tBodies)) {
    body.setAttribute('role', 'rowgroup');
    for (const row of Array.from(body.rows)) {
      const cells = Array.from(row.cells);
      // La firma incluye el encabezado: si cambia la tabla (pestañas de
      // devoluciones, vista de cobranzas) el estampado se rehace solo.
      const stamp = `${cells.length}:${signature}`;
      if (row.dataset.cardStamped === stamp) continue;
      row.dataset.cardStamped = stamp;
      row.setAttribute('role', 'row');

      // Fila de estado vacío o de carga: una sola celda que cubre toda la tabla.
      const plain = cells.length === 1 && (cells[0].colSpan || 1) >= headers.length;
      if (plain) row.dataset.card = 'plain';
      else delete row.dataset.card;

      let column = 0;
      for (const cell of cells) {
        const span = cell.colSpan || 1;
        const label = headers[column] ?? '';
        column += span;
        cell.setAttribute('role', cell.tagName === 'TH' ? 'rowheader' : 'cell');
        // Sin etiqueta: subtotales y celdas fusionadas ocupan el ancho de la tarjeta.
        if (plain || span > 1 || !label) delete cell.dataset.label;
        else cell.dataset.label = label;
        if (cell.querySelector('.row-actions')) cell.dataset.cell = 'actions';
        else delete cell.dataset.cell;
      }
    }
  }
}

export function TableEnhancer() {
  useEffect(() => {
    const cleanups: (() => void)[] = [];
    const enhance = () => {
      document
        .querySelectorAll<HTMLTableElement>('.glass-table table, .table-wrap table, table.table')
        .forEach((table) => {
          const host = table.parentElement;
          if (!host) return;
          // Antes del early-return: las tablas con paginación propia también
          // necesitan las etiquetas para el modo tarjeta.
          stampCardLabels(table);
          const manualPagination = host.nextElementSibling?.classList.contains('table-pagination');
          if (manualPagination) {
            host.querySelector(':scope > .auto-table-toolbar')?.remove();
            host.querySelector(':scope > .auto-table-pagination')?.remove();
            Array.from(table.tBodies[0]?.rows ?? []).forEach((row) => {
              row.style.display = '';
            });
            delete table.dataset.enhanced;
            return;
          }
          if (table.dataset.enhanced === 'true') return;
          if (host.querySelector(':scope > .table-pagination')) return;
          table.dataset.enhanced = 'true';
          const rows = Array.from(table.tBodies[0]?.rows ?? []);
          if (!rows.length) return;
          let pageSize = 10;
          let page = 1;
          let query = '';
          const pageHost = table.closest('.module-page, .operations-list-page, .report-page');
          const hasPageSearch = Boolean(
            pageHost?.querySelector(
              '.module-tools .pill-search, .operations-filters .pill-search, .report-filters .pill-search',
            ),
          );
          const toolbar = hasPageSearch ? null : document.createElement('div');
          if (toolbar) {
            toolbar.className = 'auto-table-toolbar';
            toolbar.innerHTML = `<label class="pill-search auto-table-search"><svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg><input placeholder="Buscar en este listado" aria-label="Buscar en este listado" /></label>`;
          }
          const input = toolbar?.querySelector('input') as HTMLInputElement | undefined;
          const pagination = document.createElement('div');
          pagination.className = 'table-pagination auto-table-pagination';
          if (toolbar) host.insertBefore(toolbar, table);
          host.appendChild(pagination);
          const render = () => {
            const filtered = rows.filter((row) =>
              (row.textContent ?? '').toLowerCase().includes(query),
            );
            const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
            page = Math.min(page, pages);
            rows.forEach((row) => {
              row.style.display = 'none';
            });
            filtered.slice((page - 1) * pageSize, page * pageSize).forEach((row) => {
              row.style.display = '';
            });
            const candidates = new Set([
              1,
              2,
              3,
              page - 1,
              page,
              page + 1,
              pages - 2,
              pages - 1,
              pages,
            ]);
            const numbers = [...candidates]
              .filter((value) => value >= 1 && value <= pages)
              .sort((a, b) => a - b);
            let previous = 0;
            const pageButtons = numbers
              .map((value) => {
                const ellipsis =
                  previous && value - previous > 1
                    ? `<span class="pagination-ellipsis" aria-hidden="true">…</span>`
                    : '';
                previous = value;
                return `${ellipsis}<button type="button" data-page="${value}" class="${value === page ? 'active' : ''}" aria-label="Página ${value}" ${value === page ? 'aria-current="page"' : ''}>${value}</button>`;
              })
              .join('');
            pagination.innerHTML = `<span aria-live="polite">${filtered.length ? `Mostrando ${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, filtered.length)} de ${filtered.length}` : 'Sin resultados'}</span><label class="pagination-size"><span>Filas</span><select aria-label="Filas por página"><option value="10" ${pageSize === 10 ? 'selected' : ''}>10</option><option value="25" ${pageSize === 25 ? 'selected' : ''}>25</option><option value="50" ${pageSize === 50 ? 'selected' : ''}>50</option><option value="100" ${pageSize === 100 ? 'selected' : ''}>100</option></select></label><nav class="pagination-pages" aria-label="Páginas de la tabla">${pageButtons}</nav>`;
            pagination
              .querySelector<HTMLSelectElement>('select')
              ?.addEventListener('change', (event) => {
                pageSize = Number((event.currentTarget as HTMLSelectElement).value);
                page = 1;
                render();
              });
            pagination.querySelectorAll<HTMLButtonElement>('button[data-page]').forEach((button) =>
              button.addEventListener('click', () => {
                page = Number(button.dataset.page);
                render();
              }),
            );
          };
          input?.addEventListener('input', () => {
            query = input.value.toLowerCase().trim();
            page = 1;
            render();
          });
          render();
          cleanups.push(() => {
            toolbar?.remove();
            pagination.remove();
            delete table.dataset.enhanced;
          });
        });
    };
    enhance();
    // El observer mira todo el body, así que dispara con cada toast y cada modal:
    // se agrupan las ráfagas en un solo frame. Solo childList/subtree — con
    // attributes:true el propio estampado volvería a dispararlo.
    let frame = 0;
    const observer = new MutationObserver(() => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        enhance();
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
      cleanups.forEach((cleanup) => cleanup());
    };
  }, []);
  return null;
}
