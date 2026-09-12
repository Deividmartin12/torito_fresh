import {
  AnalyticsPeriod,
  BusinessAnalytics,
  fillDailySeries,
  fillHourlySeries,
  fillMonthlySeries,
  groupPeriodsByWeek,
  groupPeriodsByYear,
  withWeekdayLabels,
} from './analytics';
import type { PeriodKind } from '../components/PeriodFilter';

export type SeriesGranularity = 'hora' | 'dia' | 'semana' | 'mes' | 'anio';

export type ReportSeries = {
  rows: AnalyticsPeriod[];
  granularity: SeriesGranularity;
  /** Texto para el subtítulo del gráfico: "por hora", "por día"... */
  granularityLabel: string;
  /**
   * Cada cuántos puntos se rotula el eje X. Los puntos intermedios siguen dibujándose y
   * conservan su tooltip; solo se omite su etiqueta para que el eje no se amontone.
   */
  tickEvery: number;
};

const granularityLabel: Record<SeriesGranularity, string> = {
  hora: 'por hora',
  dia: 'por día',
  semana: 'por semana',
  mes: 'por mes',
  anio: 'por año',
};

/** Días que abarca [from, to], ambos incluidos. */
export function spanInDays(from: string, to: string) {
  if (!from || !to) return 0;
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0;
  return Math.round((end - start) / 86_400_000) + 1;
}

/**
 * Granularidad del eje X según el filtro activo:
 * día → horas · semana → los 7 días · mes → sus 4-5 semanas · año → sus 12 meses.
 * En "personalizada" se decide por el largo del rango, para que un rango corto no quede
 * con un solo punto ni uno largo con cientos de barras ilegibles.
 */
export function pickGranularity(period: PeriodKind, spanDays: number): SeriesGranularity {
  if (period === 'day') return 'hora';
  if (period === 'week') return 'dia';
  if (period === 'month') return 'semana';
  if (period === 'year') return 'mes';
  if (spanDays <= 1) return 'hora';
  if (spanDays <= 14) return 'dia';
  if (spanDays <= 92) return 'semana';
  if (spanDays <= 731) return 'mes';
  return 'anio';
}

/** Cada cuántos puntos se rotula el eje X, para que las etiquetas no se solapen. */
function pickTickEvery(granularity: SeriesGranularity, points: number) {
  // En la vista por hora se rotulan las horas "notables" (00, 03, 06...) y el resto queda
  // como punto sin etiqueta; en las demás vistas hay pocos puntos y se rotulan todos.
  if (granularity === 'hora') return 3;
  if (points > 16) return Math.ceil(points / 8);
  return 1;
}

/** Serie lista para los gráficos de eje X/Y del período filtrado. */
export function buildReportSeries(
  analytics: Pick<BusinessAnalytics, 'hourly' | 'daily' | 'monthly'> | null | undefined,
  from: string,
  to: string,
  period: PeriodKind,
): ReportSeries {
  return buildSeriesAt(analytics, from, to, pickGranularity(period, spanInDays(from, to)));
}

/** Igual que `buildReportSeries`, pero con la granularidad elegida a mano. */
export function buildSeriesAt(
  analytics: Pick<BusinessAnalytics, 'hourly' | 'daily' | 'monthly'> | null | undefined,
  from: string,
  to: string,
  granularity: SeriesGranularity,
): ReportSeries {
  const daily = () => fillDailySeries(analytics?.daily ?? [], from, to);
  const rows = (() => {
    switch (granularity) {
      case 'hora':
        return fillHourlySeries(analytics?.hourly ?? [], from);
      case 'dia':
        return withWeekdayLabels(daily());
      case 'semana':
        return groupPeriodsByWeek(daily(), 'compacto');
      case 'mes':
        return fillMonthlySeries(analytics?.monthly ?? [], from, to);
      case 'anio':
        return groupPeriodsByYear(fillMonthlySeries(analytics?.monthly ?? [], from, to));
    }
  })();
  return {
    rows,
    granularity,
    granularityLabel: granularityLabel[granularity],
    tickEvery: pickTickEvery(granularity, rows.length),
  };
}
