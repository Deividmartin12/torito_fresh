export function marginScale(values: number[]) {
  const minimum = Math.min(0, ...values);
  const maximum = Math.max(0, ...values);
  const target = maximum === minimum ? 0.25 : Math.max((maximum - minimum) / 4, 0.01);
  const power = 10 ** Math.floor(Math.log10(target));
  const factor = [1, 2, 2.5, 5, 10].find((value) => value * power >= target) ?? 10;
  const step = factor * power;
  const min = Math.floor(minimum / step) * step;
  const max = Math.ceil(maximum / step) * step || (min === 0 ? 1 : 0);
  const intervals = Math.round((max - min) / step);
  const ticks = Array.from({ length: intervals + 1 }, (_, index) =>
    Number((max - index * step).toPrecision(12)),
  );
  return { min, max, ticks };
}
