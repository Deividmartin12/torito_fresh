'use client';

import { CSSProperties } from 'react';

export type SegmentedOption = {
  value: string;
  label: string;
  disabled?: boolean;
  title?: string;
};

/**
 * Control segmentado con indicador deslizante (estilo iOS): un solo riel en cápsula, el
 * segmento activo se resalta con una pastilla que se anima hasta su posición.
 */
export function Segmented({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: SegmentedOption[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
}) {
  const activeIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  return (
    <div
      className="segmented"
      role="tablist"
      aria-label={ariaLabel}
      style={{ '--seg-count': options.length, '--seg-active': activeIndex } as CSSProperties}
    >
      <span className="segmented-thumb" aria-hidden />
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={option.value === value}
          disabled={option.disabled}
          title={option.title}
          className={option.value === value ? 'is-active' : undefined}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
