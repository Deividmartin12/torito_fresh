/**
 * Reglas de validación compartidas por todos los formularios de la web.
 *
 * La idea es tener una sola fuente de verdad: los mismos patrones viven (copiados, porque
 * son paquetes separados) en `apps/api/src/common/validacion.ts` para que el API rechace lo
 * mismo que el formulario. Cada campo usa dos piezas:
 *   - un *sanitizador* en el `onChange` para no dejar teclear caracteres inválidos, y
 *   - un *validador* que se corre al enviar y devuelve el mensaje de error (o `undefined`).
 */

// --- Patrones -------------------------------------------------------------------

/** Nombre de persona: solo letras (con tildes/ñ), espacios, apóstrofe y guion. */
export const RE_NOMBRE_PERSONA = /^[\p{L}\s'’-]+$/u;
/** Nombre "libre" (empresa, producto): además de lo anterior, números y `. , & ( ) /`. */
export const RE_NOMBRE_LIBRE = /^[\p{L}\p{N}\s'’.,&()/-]+$/u;
/** Celular Perú: 9 dígitos que empiezan en 9. */
export const RE_CELULAR = /^9\d{8}$/;
export const RE_DNI = /^\d{8}$/;
export const RE_RUC = /^\d{11}$/;
/** Carné de extranjería / pasaporte: alfanumérico, 6 a 15. */
export const RE_CE = /^[A-Za-z0-9]{6,15}$/;
export const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const RE_USERNAME = /^[a-zA-Z0-9._-]+$/;

// --- Sanitizadores para `onChange` (filtrado en vivo) -------------------------

export const soloDigitos = (valor: string, max?: number) => {
  const limpio = valor.replace(/\D/g, '');
  return max ? limpio.slice(0, max) : limpio;
};

/** Deja solo lo permitido en un nombre de persona. */
export const soloLetras = (valor: string) => valor.replace(/[^\p{L}\s'’-]/gu, '');

/** Deja solo lo permitido en un nombre de empresa/producto. */
export const soloTextoNombre = (valor: string) => valor.replace(/[^\p{L}\p{N}\s'’.,&()/-]/gu, '');

export const soloAlfanumerico = (valor: string, max?: number) => {
  const limpio = valor.replace(/[^A-Za-z0-9]/g, '');
  return max ? limpio.slice(0, max) : limpio;
};

export const soloUsername = (valor: string) => valor.replace(/[^a-zA-Z0-9._-]/g, '');

// --- Validadores (se corren al enviar) ---------------------------------------

type Opcional = { requerido?: boolean };

export function validarNombrePersona(valor: string, etiqueta = 'nombre'): string | undefined {
  const limpio = valor.trim();
  if (!limpio) return `Ingresa ${etiqueta === 'nombre' ? 'el nombre' : `los ${etiqueta}`}.`;
  if (limpio.length < 2) return 'Debe tener al menos 2 letras.';
  if (!RE_NOMBRE_PERSONA.test(limpio)) return 'Usa solo letras, espacios, apóstrofe o guion.';
  return undefined;
}

export function validarNombreLibre(valor: string, etiqueta = 'el nombre'): string | undefined {
  const limpio = valor.trim();
  if (!limpio) return `Ingresa ${etiqueta}.`;
  if (limpio.length < 2) return 'Debe tener al menos 2 caracteres.';
  if (!RE_NOMBRE_LIBRE.test(limpio))
    return "Hay caracteres no permitidos (usa letras, números y . , & ( ) / - ').";
  return undefined;
}

export function validarCelular(valor: string, { requerido }: Opcional = {}): string | undefined {
  const limpio = valor.trim();
  if (!limpio) return requerido ? 'Ingresa el celular.' : undefined;
  if (!RE_CELULAR.test(limpio)) return 'El celular debe tener 9 dígitos y empezar en 9.';
  return undefined;
}

/** `tipo` es el valor del select de tipo de documento (DNI / RUC / CE / vacío). */
export function validarDocumento(
  tipo: string,
  numero: string,
  { requerido }: Opcional = {},
): string | undefined {
  const limpio = numero.trim();
  if (!limpio) return requerido ? 'Ingresa el número de documento.' : undefined;
  if (tipo === 'DNI') return RE_DNI.test(limpio) ? undefined : 'El DNI debe tener 8 dígitos.';
  if (tipo === 'RUC') return RE_RUC.test(limpio) ? undefined : 'El RUC debe tener 11 dígitos.';
  if (tipo === 'CE' || tipo === 'PAS')
    return RE_CE.test(limpio)
      ? undefined
      : 'El documento debe tener entre 6 y 15 caracteres alfanuméricos.';
  return undefined;
}

export function validarEmail(valor: string, { requerido }: Opcional = {}): string | undefined {
  const limpio = valor.trim();
  if (!limpio) return requerido ? 'Ingresa el correo.' : undefined;
  if (!RE_EMAIL.test(limpio)) return 'Ingresa un correo válido.';
  return undefined;
}

export function validarMonto(
  valor: string | number,
  { min = 0, etiqueta = 'el monto' }: { min?: number; etiqueta?: string } = {},
): string | undefined {
  const numero = typeof valor === 'number' ? valor : Number(valor);
  if (!Number.isFinite(numero)) return `Ingresa ${etiqueta}.`;
  if (numero < min)
    return min > 0
      ? `${capitalizar(etiqueta)} debe ser mayor a ${min}.`
      : `${capitalizar(etiqueta)} no puede ser negativo.`;
  return undefined;
}

export function validarEnteroPositivo(
  valor: string | number,
  etiqueta = 'la cantidad',
): string | undefined {
  const numero = typeof valor === 'number' ? valor : Number(valor);
  if (!Number.isInteger(numero) || numero < 1)
    return `${capitalizar(etiqueta)} debe ser un número entero mayor a 0.`;
  return undefined;
}

const capitalizar = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1);
