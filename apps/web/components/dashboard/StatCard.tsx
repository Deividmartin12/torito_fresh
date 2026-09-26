import Link from 'next/link';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { Variacion } from '../../lib/format';
import { CifraAnimada } from '../ui/CifraAnimada';

export type StatTone = 'blue' | 'green' | 'amber' | 'red' | 'violet';

const iconToneClass: Record<StatTone, string> = {
  blue: 'bg-status-blue-bg text-status-blue-text',
  green: 'bg-status-green-bg text-status-green-text',
  amber: 'bg-status-amber-bg text-status-amber-text',
  red: 'bg-status-red-bg text-status-red-text',
  violet: 'bg-accent-soft text-chart-4',
};

const deltaToneClass = {
  up: 'text-status-green-text',
  down: 'text-status-red-text',
  flat: 'text-muted',
};

/**
 * Mini-tarjeta de indicador: el ícono en su cuadrito de color, la cifra grande, la etiqueta
 * y la variación contra el período anterior. La usan los dos paneles y las cabeceras de
 * /ventas y /gastos, por eso vive acá y no dentro de la ruta del panel.
 */
export function StatCard({
  icon,
  label,
  value,
  detail,
  tone,
  change,
  changeCaption,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  detail?: string;
  tone: StatTone;
  change?: Variacion;
  changeCaption?: string;
  href?: string;
}) {
  // "na" es el caso sin base de comparación: no se pinta ni verde ni rojo.
  const direccion = change && change.direccion !== 'na' ? change.direccion : 'flat';
  // El "vs. el mes anterior" solo acompaña a un porcentaje. Junto a "nuevo" o a "—" sobra:
  // esas dos formas ya dicen que no había con qué comparar.
  const pie = change?.texto.endsWith('%') ? changeCaption : undefined;
  const content = (
    <>
      <div className="mb-2 flex items-center justify-between">
        <span
          className={`grid h-[38px] w-[38px] place-items-center rounded-xl ${iconToneClass[tone]}`}
        >
          {icon}
        </span>
        {change && change.direccion === 'up' ? (
          <TrendingUp className="text-status-green-text" size={16} />
        ) : null}
        {change && change.direccion === 'down' ? (
          <TrendingDown className="text-status-red-text" size={16} />
        ) : null}
      </div>
      <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-[clamp(20px,5.5vw,26px)] font-bold leading-[1.2] text-fg">
        <CifraAnimada valor={value} />
      </strong>
      <span className="text-xs text-muted">{label}</span>
      {change ? (
        <span className={`text-xs font-semibold ${deltaToneClass[direccion]}`}>
          {change.texto}
          {pie ? ` ${pie}` : ''}
        </span>
      ) : detail ? (
        <span className="text-xs text-muted">{detail}</span>
      ) : null}
    </>
  );

  const className =
    'grid content-start gap-[3px] rounded-ui border border-line bg-surface p-3.5 text-inherit no-underline';
  return href ? (
    <Link
      className={`${className} transition-transform duration-[120ms] ease hover:-translate-y-0.5`}
      href={href}
    >
      {content}
    </Link>
  ) : (
    <article className={className}>{content}</article>
  );
}
