import { TrendingDown, TrendingUp } from 'lucide-react';
import { Variacion } from '../../lib/format';

const ANCHO = 300;
const ALTO = 80;

/**
 * Curva suave que pasa por todos los puntos. Cada tramo es una cúbica con los dos puntos de
 * control sobre la vertical del punto medio: da la forma redondeada del panel sin necesidad
 * de una librería, y no se sale del recorrido como haría una interpolación más libre.
 */
function curva(puntos: [number, number][]) {
  let d = `M ${puntos[0][0]} ${puntos[0][1]}`;
  for (let i = 1; i < puntos.length; i += 1) {
    const [xAnterior, yAnterior] = puntos[i - 1];
    const [x, y] = puntos[i];
    const medio = (xAnterior + x) / 2;
    d += ` C ${medio} ${yAnterior}, ${medio} ${y}, ${x} ${y}`;
  }
  return d;
}

/**
 * Tarjeta principal del panel: el número que importa, en grande, con su variación contra el
 * período anterior y la curva del período detrás. La serie es una referencia de forma, no un
 * gráfico para leer valores: para eso están las barras de abajo.
 */
export function StatHero({
  label,
  value,
  chip,
  change,
  changeCaption,
  series,
}: {
  label: string;
  value: React.ReactNode;
  chip?: string;
  change?: Variacion;
  changeCaption?: string;
  series: number[];
}) {
  // El "vs. el mes anterior" solo acompaña a un porcentaje: junto a "nuevo" o a "—" sobra.
  const pie = change?.texto.endsWith('%') ? changeCaption : undefined;
  const conCurva = series.length > 1 && series.some((punto) => punto > 0);
  let trazo = '';
  if (conCurva) {
    const maximo = Math.max(...series);
    const minimo = Math.min(...series);
    const rango = maximo - minimo || maximo || 1;
    const paso = ANCHO / (series.length - 1);
    trazo = curva(
      series.map((punto, indice) => [
        indice * paso,
        ALTO - 8 - ((punto - minimo) / rango) * (ALTO - 20),
      ]),
    );
  }

  return (
    <section
      className="relative mb-3 grid gap-1.5 rounded-container-lg bg-[linear-gradient(135deg,var(--hero-from),var(--hero-to))] p-[18px_16px] text-white tablet:p-5"
      aria-label={label}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-[13px] opacity-[0.82]">{label}</span>
        {chip ? (
          <span className="flex-none whitespace-nowrap rounded-control bg-white/[0.18] px-3 py-[5px] text-xs font-semibold">
            {chip}
          </span>
        ) : null}
      </div>
      <strong className="text-[clamp(32px,9vw,44px)] font-bold leading-[1.05]">{value}</strong>
      {change ? (
        <span className="flex items-center gap-1.5 text-[13px] opacity-90">
          {change.direccion === 'down' ? <TrendingDown size={15} /> : null}
          {change.direccion === 'up' ? <TrendingUp size={15} /> : null}
          {change.texto}
          {pie ? ` ${pie}` : ''}
        </span>
      ) : null}
      {conCurva ? (
        <svg
          className="mt-1 block h-[72px] w-full"
          viewBox={`0 0 ${ANCHO} ${ALTO}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d={`${trazo} L ${ANCHO} ${ALTO} L 0 ${ALTO} Z`} fill="rgba(255,255,255,0.16)" />
          {/* Sin esto el trazo se deformaría con el estirado horizontal del viewBox. */}
          <path
            d={trazo}
            fill="none"
            stroke="#fff"
            strokeWidth="2"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      ) : null}
    </section>
  );
}
