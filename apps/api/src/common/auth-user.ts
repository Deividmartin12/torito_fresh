export interface AuthUser {
  userId: string;
  email: string;
  name: string;
  /**
   * Clave del rol (`ADMIN`, `SELLER`, o la que se le haya puesto a un rol creado desde el
   * panel). Ya no es un enum: los roles viven en la base y se pueden crear.
   *
   * Sirve para nombrarlo y para registrarlo, NO para decidir permisos. Para eso está
   * `permisos`: preguntar por la clave del rol es justamente lo que impedía que un rol nuevo
   * pudiera hacer nada.
   */
  role: string;
  /** Cómo se llama el rol en pantalla ("Administrador", "Vendedor"). Para los mensajes. */
  rolNombre: string;
  /**
   * Si el rol lo puede todo. Los permisos que se agreguen al catálogo mañana también quedan
   * incluidos, que es la diferencia con tener marcados todos los de hoy.
   */
  accesoTotal: boolean;
  /** Claves del catálogo que tiene otorgadas. Se leen de la base en cada petición. */
  permisos: string[];
  /**
   * Trabajador activo vinculado a la cuenta, o `null` si no tiene. Se resuelve en cada
   * petición junto con el rol, así vincular una cuenta tiene efecto sin volver a entrar.
   */
  trabajadorId: string | null;
  /**
   * Unidad de negocio del trabajador vinculado, o `null` si la cuenta no tiene ninguno.
   * Se resuelve en cada petición igual que el rol, así mover a alguien de unidad tiene
   * efecto sin volver a entrar. Al leer, `null` se trata como la unidad Principal.
   */
  unidadNegocioId: string | null;
}

/** Si esta persona tiene el permiso. El acceso total gana siempre. */
export function tienePermiso(actor: Pick<AuthUser, 'accesoTotal' | 'permisos'>, clave: string) {
  return actor.accesoTotal || actor.permisos.includes(clave);
}
