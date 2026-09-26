'use client';

import { ReactNode, useEffect, useState } from 'react';

const DURACION = 800;
// Cifras formateadas por `moneda`/`cantidad` (es-PE): "S/ 1,234.50", "119", "12.5 %".
const NUMERO = /\d[\d,]*(?:\.(\d+))?/;

/** Arranca rápido y frena al final, como un contador que se asienta en su valor. */
const frenar = (t: number) => 1 - (1 - t) ** 3;

function conValor(texto: string, valor: number, decimales: number) {
  const formateado = valor.toLocaleString('en-US', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
  return texto.replace(NUMERO, formateado);
}

/**
 * Una cifra que al aparecer sube contando desde cero hasta su valor. Recibe el texto ya
 * formateado ("S/ 1,234.50") y anima solo la parte numérica, así el prefijo y los decimales
 * quedan iguales. Si lo que llega no es texto ni número (un componente), lo muestra tal cual.
 */
export function CifraAnimada({ valor }: { valor: ReactNode }) {
  if (typeof valor !== 'string' && typeof valor !== 'number') return <>{valor}</>;
  return <Contador texto={String(valor)} />;
}

function Contador({ texto }: { texto: string }) {
  const coincidencia = NUMERO.exec(texto);
  const final = coincidencia ? Number(coincidencia[0].replace(/,/g, '')) : 0;
  const decimales = coincidencia?.[1]?.length ?? 0;
  const [mostrado, setMostrado] = useState(() =>
    coincidencia ? conValor(texto, 0, decimales) : texto,
  );

  useEffect(() => {
    const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!coincidencia || quieto || final === 0) {
      setMostrado(texto);
      return;
    }
    let cuadro = 0;
    const inicio = performance.now();
    const paso = (ahora: number) => {
      const avance = Math.min((ahora - inicio) / DURACION, 1);
      setMostrado(avance < 1 ? conValor(texto, final * frenar(avance), decimales) : texto);
      if (avance < 1) cuadro = requestAnimationFrame(paso);
    };
    cuadro = requestAnimationFrame(paso);
    // Con la pestaña en segundo plano el navegador pausa los cuadros de animación: sin este
    // respaldo la cifra se quedaría en cero hasta que se vuelva a mirar la pestaña.
    const respaldo = window.setTimeout(() => setMostrado(texto), DURACION + 200);
    return () => {
      cancelAnimationFrame(cuadro);
      window.clearTimeout(respaldo);
    };
    // `coincidencia`, `final` y `decimales` salen de `texto`: basta con él.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto]);

  return <span className="tabular-nums">{mostrado}</span>;
}
