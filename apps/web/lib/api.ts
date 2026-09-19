const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4070';

/** Si el servidor no responde en este tiempo, cortamos y avisamos (en vez de esperar para siempre). */
const TIEMPO_MAXIMO_MS = 15_000;

export type UsuarioSesion = {
  id: string;
  name: string;
  email: string;
  username?: string | null;
  /** Clave del rol. Sirve para identificarlo, NO para decidir qué se muestra: para eso está `permisos`. */
  role: string;
  /** Nombre del rol tal como se lee en pantalla ("Administrador", "Vendedor"). */
  rolNombre?: string | null;
  /**
   * Lo que esta persona puede hacer, ya resuelto por el API. Un rol con acceso total llega
   * con el catálogo entero, así que las pantallas preguntan siempre lo mismo y nunca tienen
   * que acordarse de contemplar aparte el caso del administrador.
   */
  permisos?: string[];
  /** Cargo del trabajador vinculado ("Almacenero"), distinto del rol con el que entra. */
  cargo?: string | null;
  /** Unidad de negocio a la que pertenece la persona, vía su trabajador vinculado. */
  unidadNegocioId?: string | null;
  unidad?: string | null;
};

export function obtenerToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('torito_token');
}

/**
 * Cuándo vence la sesión, leído del propio token (campo `exp`, en segundos).
 * El plazo lo define el API al firmarlo; acá no se recalcula nada para que no haya dos
 * verdades distintas sobre la misma sesión.
 */
export function obtenerVencimientoSesion() {
  const token = obtenerToken();
  if (!token) return null;
  try {
    const encodedPayload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(
      atob(
        encodedPayload.padEnd(encodedPayload.length + ((4 - (encodedPayload.length % 4)) % 4), '='),
      ),
    ) as { exp?: number };
    return payload.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * Datos del usuario guardados al iniciar sesión. Si el contenido está corrupto se limpia la
 * sesión y se devuelve `null`, para no romper la pantalla con un error de JSON.
 */
export function obtenerUsuarioGuardado(): UsuarioSesion | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('torito_user');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UsuarioSesion;
  } catch {
    limpiarSesion();
    return null;
  }
}

/** Hay sesión solo si están las dos cosas: el token y los datos del usuario. */
export function haySesion() {
  return Boolean(obtenerToken() && obtenerUsuarioGuardado());
}

export function guardarSesion(accessToken: string, user: UsuarioSesion) {
  localStorage.setItem('torito_token', accessToken);
  localStorage.setItem('torito_user', JSON.stringify(user));
}

export function limpiarSesion() {
  localStorage.removeItem('torito_token');
  localStorage.removeItem('torito_user');
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }

  const token = obtenerToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let response: Response;
  try {
    // Sin unidad pegada a la ruta: qué unidades ve cada usuario vive en la base y lo resuelve
    // el API. Antes se adjuntaba desde `localStorage`, y esa elección se heredaba entre
    // usuarios de la misma máquina.
    response = await fetch(`${API_URL}/api${path}`, {
      ...options,
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS),
    });
  } catch (causa) {
    // Acá caen los errores de red: servidor apagado, sin internet o demasiado lento.
    // Sin este bloque el usuario vería el mensaje del navegador en inglés ("Failed to fetch").
    const seAgotoElTiempo = causa instanceof DOMException && causa.name === 'TimeoutError';
    throw new Error(
      seAgotoElTiempo
        ? 'El servidor tardó demasiado en responder. Intenta de nuevo.'
        : 'No se pudo conectar con el servidor. Revisa que esté encendido e intenta de nuevo.',
    );
  }

  if (!response.ok) {
    if (
      response.status === 401 &&
      typeof window !== 'undefined' &&
      !path.startsWith('/auth/login')
    ) {
      limpiarSesion();
      window.location.replace('/login');
    }
    const body = await response.json().catch(() => ({}));
    const message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
    throw new Error(message || 'No se pudo completar la operación');
  }

  // 204 = "listo, sin contenido": no hay JSON que leer.
  if (response.status === 204) return null as T;
  return response.json();
}
