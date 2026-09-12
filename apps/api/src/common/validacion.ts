/**
 * Patrones de validación del API. Son una copia exacta de los de `apps/web/lib/validacion.ts`
 * (paquetes separados, no se comparte código): el formulario y el API deben rechazar lo mismo.
 * Sirven para que una llamada directa a la API no pueda meter datos sucios a la base.
 */

/** Nombre de persona: solo letras (con tildes/ñ), espacios, apóstrofe y guion. */
export const RE_NOMBRE_PERSONA = /^[\p{L}\s'’-]+$/u;
/** Nombre "libre" (empresa, producto): además de lo anterior, números y `. , & ( ) /`. */
export const RE_NOMBRE_LIBRE = /^[\p{L}\p{N}\s'’.,&()/-]+$/u;
/** Celular Perú: 9 dígitos que empiezan en 9. */
export const RE_CELULAR = /^9\d{8}$/;
export const RE_DNI = /^\d{8}$/;
export const RE_RUC = /^\d{11}$/;
/** Documento genérico (DNI 8 / RUC 11 / CE / pasaporte): alfanumérico, 6 a 15. */
export const RE_DOCUMENTO = /^[A-Za-z0-9]{6,15}$/;
export const RE_USERNAME = /^[a-zA-Z0-9._-]+$/;
/** Etiqueta de método de pago / categoría: mismo set que un nombre libre. */
export const RE_ETIQUETA_PAGO = RE_NOMBRE_LIBRE;

export const MSG_NOMBRE_PERSONA = 'Usa solo letras, espacios, apóstrofe o guion.';
export const MSG_NOMBRE_LIBRE = 'Hay caracteres no permitidos en el nombre.';
export const MSG_CELULAR = 'El celular debe tener 9 dígitos y empezar en 9.';
export const MSG_DOCUMENTO = 'El documento debe tener entre 6 y 15 caracteres alfanuméricos.';
