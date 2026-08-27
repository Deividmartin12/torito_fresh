'use client';

import { useEffect } from 'react';

export function TableEnhancer() {
  useEffect(() => {
    const cleanups: (() => void)[] = [];
    const enhance = () => {
      document
        .querySelectorAll<HTMLTableElement>('.glass-table table, .table-wrap table, table.table')
        .forEach((table) => {
          const host = table.parentElement;
          if (!host) return;
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
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      cleanups.forEach((cleanup) => cleanup());
    };
  }, []);
  return null;
}
