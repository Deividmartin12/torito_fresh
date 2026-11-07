import { useId, type ReactNode } from 'react';
import { ChartExpansion } from './ChartExpansion';

export function ChartCard({
  icon,
  title,
  subtitle,
  legend,
  children,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  legend?: ReactNode;
  children: ReactNode;
}) {
  const titleId = useId();
  const legendBlock = legend ? <div className="chart-legend">{legend}</div> : null;

  return (
    <section
      className="min-w-0 rounded-[17px] border border-line bg-surface p-[17px] [container-type:inline-size]"
      aria-labelledby={titleId}
    >
      <div className="mb-[13px] flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid h-[35px] w-[35px] flex-none place-items-center rounded-[10px] bg-surface-soft text-accent">
            {icon}
          </span>
          <div>
            <h3 className="m-0 text-base text-fg" id={titleId}>
              {title}
            </h3>
            <p className="m-0 mt-0.5 text-[11px] text-muted">{subtitle}</p>
          </div>
        </div>
        <ChartExpansion title={title} subtitle={subtitle} legend={legendBlock}>
          {children}
        </ChartExpansion>
      </div>
      {legendBlock ? <div className="mb-3">{legendBlock}</div> : null}
      {children}
    </section>
  );
}
