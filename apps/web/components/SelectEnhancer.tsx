"use client";

import { useEffect } from "react";

export function SelectEnhancer() {
  useEffect(() => {
    const enhanced: HTMLInputElement[] = [];
    const enhance = () => {
      document.querySelectorAll<HTMLSelectElement>("select").forEach((select) => {
        if (select.dataset.searchEnhanced === "true" || select.closest(".searchable-select")) return;
        const input = document.createElement("input");
        input.className = "native-select-search";
        input.type = "search";
        input.placeholder = "Buscar opción...";
        input.setAttribute("aria-label", "Buscar opción");
        select.parentElement?.insertBefore(input, select);
        select.dataset.searchEnhanced = "true";
        input.addEventListener("input", () => {
          const query = input.value.toLowerCase().trim();
          Array.from(select.options).forEach((option) => { option.hidden = Boolean(query) && !option.text.toLowerCase().includes(query); });
        });
        enhanced.push(input);
      });
    };
    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => { observer.disconnect(); enhanced.forEach((input) => { const select = input.nextElementSibling as HTMLSelectElement | null; if (select) select.removeAttribute("data-search-enhanced"); input.remove(); }); };
  }, []);
  return null;
}
