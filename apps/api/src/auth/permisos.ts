/**
 * Catálogo de permisos: qué cosas se pueden hacer en la app, una por una.
 *
 * Antes los permisos vivían en dos listas escritas a mano —los `@Roles(RoleName.X)` de cada
 * controlador y los mapas de `apps/web/lib/permissions.ts`— y los roles eran un enum de
 * Postgres. Con eso no se podía crear un rol nuevo sin tocar el código y volver a desplegar.
 *
 * Ahora el rol es una fila de la base con una lista de permisos otorgados, y este archivo es
 * el único lugar donde se declara qué permisos existen. Es catálogo, no asignación: quién
 * tiene cada permiso se guarda en la tabla `rol_permiso` y se edita desde
 * Configuración › Roles y permisos.
 *
 * Cada permiso anota al lado los endpoints que protege, para poder encontrar su par con un
 * grep de la ruta. Qué PANTALLA destraba cada permiso no se declara acá sino en
 * `apps/web/lib/permissions.ts`: las rutas son cosa de la web y tenerlas en los dos lados
 * sería volver a la duplicación que este cambio vino a sacar.
 */

/** Una capacidad concreta: o se tiene o no se tiene. */
export type Permiso = {
  /** Identificador estable. Es lo que se guarda en `rol_permiso`; no se renombra. */
  clave: string;
  /** Cómo se lee en la pantalla de roles. */
  etiqueta: string;
  /** Qué habilita, en una línea, para quien arma el rol y no conoce el código. */
  descripcion: string;
  /**
   * Permisos que este permiso arrastra, porque sin ellos no serviría de nada.
   *
   * Registrar una venta necesita poder ver los clientes, los productos y los métodos de
   * cobro: son las listas que el propio formulario carga. Sin esto, un rol armado a mano
   * marcando solo "Registrar ventas" entra a una pantalla que no puede llenar y lo único que
   * ve es un error, sin nada que le diga qué le falta.
   *
   * Se aplican al guardar el rol, así que las casillas de la pantalla muestran exactamente
   * lo que el rol tiene: no hay permisos invisibles.
   */
  implica?: string[];
};

export type GrupoPermisos = {
  /** Mismo nombre que el grupo del menú lateral, para que el panel se lea igual que la app. */
  grupo: string;
  permisos: Permiso[];
};

export const CATALOGO_PERMISOS: GrupoPermisos[] = [
  {
    grupo: 'Principal',
    permisos: [
      {
        clave: 'dashboard.ver',
        etiqueta: 'Ver el resumen',
        descripcion: 'Entrar a la pantalla de inicio con los números del día.',
      },
      {
        clave: 'documento.consultar',
        etiqueta: 'Consultar DNI y RUC',
        descripcion:
          'Traer nombre y dirección desde el documento al cargar un cliente o un proveedor.',
        // GET /consulta-documento/dni/:numero, GET /consulta-documento/ruc/:numero
      },
    ],
  },
  {
    grupo: 'Gastos',
    permisos: [
      {
        clave: 'gastos.ver',
        etiqueta: 'Ver los gastos',
        descripcion: 'Entrar a la lista de gastos de su unidad.',
        // GET /expenses, GET /expenses/categories
      },
      {
        clave: 'gastos.registrar',
        etiqueta: 'Registrar y corregir gastos',
        descripcion: 'Dar de alta un gasto y corregir uno ya cargado.',
        implica: ['gastos.ver', 'proveedores.ver'],
        // POST /expenses, PATCH /expenses/:id
      },
      {
        clave: 'gastos.categorias.crear',
        etiqueta: 'Crear categorías de gasto',
        descripcion: 'Agregar una categoría nueva sin salir del formulario de gasto.',
        implica: ['gastos.ver'],
        // POST /expenses/categories
      },
      {
        clave: 'gastos.categorias.editar',
        etiqueta: 'Administrar categorías de gasto',
        descripcion:
          'Renombrar o eliminar categorías. Afecta los gastos de TODAS las unidades, no solo los propios.',
        implica: ['gastos.ver'],
        // PATCH /expenses/categories/:id, DELETE /expenses/categories/:id
      },
      {
        clave: 'proveedores.ver',
        etiqueta: 'Ver los proveedores',
        descripcion: 'Entrar al listado de proveedores y elegirlos en un gasto.',
        // GET /proveedores, GET /proveedores/:id
      },
      {
        clave: 'proveedores.crear',
        etiqueta: 'Crear proveedores',
        descripcion: 'Dar de alta un proveedor.',
        implica: ['proveedores.ver'],
        // POST /proveedores
      },
      {
        clave: 'proveedores.editar',
        etiqueta: 'Editar proveedores',
        descripcion: 'Corregir los datos de un proveedor ya cargado.',
        implica: ['proveedores.ver'],
        // PATCH /proveedores/:id
      },
    ],
  },
  {
    grupo: 'Producción',
    permisos: [
      {
        clave: 'produccion.gestionar',
        etiqueta: 'Registrar producción',
        descripcion: 'Crear y cerrar órdenes de producción, que es de donde nace el stock.',
        implica: ['productos.ver', 'almacenes.ver', 'lotes.ver'],
        // /production (clase entera)
      },
      {
        clave: 'lotes.ver',
        etiqueta: 'Ver los lotes producidos',
        descripcion: 'Entrar al listado de lotes con sus fechas de vencimiento.',
        // GET /operations/lots
      },
      {
        clave: 'lotes.editar',
        etiqueta: 'Corregir lotes',
        descripcion: 'Cambiar los datos de un lote ya producido.',
        implica: ['lotes.ver'],
        // PATCH /operations/lots/:id
      },
    ],
  },
  {
    grupo: 'Ventas',
    permisos: [
      {
        clave: 'clientes.ver',
        etiqueta: 'Ver los clientes',
        descripcion: 'Entrar al listado de clientes y elegirlos en una venta.',
        // GET /clients, GET /clients/:id
      },
      {
        clave: 'clientes.crear',
        etiqueta: 'Crear clientes',
        descripcion: 'Dar de alta un cliente, también desde el formulario de venta.',
        implica: ['clientes.ver'],
        // POST /clients
      },
      {
        clave: 'clientes.editar',
        etiqueta: 'Editar y desactivar clientes',
        descripcion: 'Corregir los datos de un cliente y darlo de baja.',
        implica: ['clientes.ver'],
        // PATCH /clients/:id, PATCH /clients/:id/activate, PATCH /clients/:id/deactivate
      },
      {
        clave: 'ventas.ver',
        etiqueta: 'Ver las ventas',
        descripcion: 'Entrar al listado de ventas y abrir el detalle de cada una.',
        // GET /operations/sales, GET /operations/sales/:id
      },
      {
        clave: 'ventas.registrar',
        etiqueta: 'Registrar ventas',
        descripcion:
          'Cargar una venta nueva. Para elegir a quién se le vende hace falta además "Ver los clientes".',
        // "Ver los clientes" NO va en `implica` a propósito: Almacén registra ventas y el API
        // le niega /clients, así que arrastrarlo le daría acceso a los clientes que hoy no
        // tiene. La dependencia se avisa en la descripción en vez de imponerse.
        implica: ['ventas.ver', 'productos.ver', 'stock.ver', 'metodosPago.ver'],
        // POST /operations/sales
      },
      {
        clave: 'ventas.editar',
        etiqueta: 'Corregir ventas',
        // Antes decía "Modificar o anular". Anular es otra capacidad y tiene su propio
        // permiso: son acciones con precondiciones opuestas (editar se prohíbe si hubo cobros
        // desde Cobranzas, anular se permite igual) y anular saca plata de la caja.
        descripcion: 'Modificar una venta ya registrada.',
        implica: ['ventas.ver'],
        // PATCH /operations/sales/:id
      },
      {
        clave: 'ventas.anular',
        etiqueta: 'Anular ventas',
        descripcion:
          'Dar de baja una venta entera: los productos vuelven al inventario y la plata que el cliente había pagado se le devuelve en efectivo. Queda como una devolución total y no se puede deshacer.',
        implica: ['ventas.ver', 'devoluciones.ver'],
        // POST /operations/sales/:id/anular
      },
      {
        clave: 'recargas.ver',
        etiqueta: 'Ver la frecuencia de recarga',
        descripcion: 'Entrar al tablero de clientes que ya deberían haber vuelto a comprar.',
        // GET /recargas
      },
      {
        clave: 'devoluciones.ver',
        etiqueta: 'Ver las devoluciones',
        descripcion: 'Entrar al listado de devoluciones comerciales.',
        // GET /operations/returns
      },
      {
        clave: 'devoluciones.registrar',
        etiqueta: 'Registrar devoluciones',
        descripcion: 'Cargar la devolución de una venta.',
        implica: ['devoluciones.ver', 'ventas.ver'],
        // POST /operations/returns/:type
      },
    ],
  },
  {
    grupo: 'Distribución',
    permisos: [
      {
        clave: 'envases.ver',
        etiqueta: 'Ver el retorno de envases',
        descripcion: 'Entrar al saldo de bidones pendientes por cliente.',
        // GET /containers/pending, GET /containers/movements
      },
      {
        clave: 'envases.ajustar',
        etiqueta: 'Ajustar envases',
        descripcion: 'Registrar la entrega o la devolución de bidones de un cliente.',
        implica: ['envases.ver'],
        // POST /containers/adjust
      },
      {
        clave: 'bidonesRotos.ver',
        etiqueta: 'Ver los bidones rotos',
        descripcion: 'Entrar al listado de bidones dados de baja.',
        // GET /bidones-rotos
      },
      {
        clave: 'bidonesRotos.registrar',
        etiqueta: 'Registrar bidones rotos',
        // Antes esta descripción decía "descontarlo del saldo del cliente", cosa que el código
        // nunca hizo y que además es otra cuenta: la de envases pendientes de devolver, que se
        // ajusta desde Retorno de envases. Lo que sí descuenta es el stock del almacén.
        descripcion:
          'Dar de baja un bidón roto y descontarlo del stock del almacén. Si no hay stock, la rotura queda registrada sin descontar.',
        implica: ['bidonesRotos.ver'],
        // POST /bidones-rotos
      },
    ],
  },
  {
    grupo: 'Inventario',
    permisos: [
      {
        clave: 'productos.ver',
        etiqueta: 'Ver el catálogo de productos',
        descripcion: 'Ver productos, insumos y precios para poder elegirlos en una operación.',
        // GET /operations/catalogs, GET /operations/products, GET /operations/product-types
      },
      {
        clave: 'productos.editar',
        etiqueta: 'Administrar productos',
        descripcion: 'Crear, editar y eliminar productos, insumos y tipos de producto.',
        implica: ['productos.ver'],
        // POST|PATCH|DELETE /operations/products, POST /operations/product-types
      },
      {
        clave: 'almacenes.ver',
        etiqueta: 'Ver los almacenes',
        descripcion: 'Entrar al listado de almacenes y elegirlos en una operación.',
        // GET /operations/warehouses
      },
      {
        clave: 'almacenes.crear',
        etiqueta: 'Crear almacenes',
        descripcion: 'Dar de alta un almacén, también desde el formulario de una operación.',
        implica: ['almacenes.ver'],
        // POST /operations/warehouses
      },
      {
        clave: 'stock.ver',
        etiqueta: 'Ver el stock disponible',
        descripcion: 'Consultar cuánto hay de cada producto antes de vender.',
        // GET /operations/stock
      },
      {
        clave: 'kardex.ver',
        etiqueta: 'Ver el kardex',
        descripcion: 'Entrar al historial de entradas y salidas de cada producto.',
        implica: ['productos.ver'],
        // GET /operations/movements, GET /operations/kardex
      },
      {
        clave: 'stock.ajustar',
        etiqueta: 'Cuadrar el stock con el conteo físico',
        descripcion:
          'Contar el inventario y corregir el stock a lo que hay de verdad, y cargar el inventario de arranque. Cada diferencia queda en el kardex con su motivo.',
        implica: ['stock.ver', 'productos.ver', 'almacenes.ver', 'kardex.ver'],
        // GET /conteos/hoja, POST /conteos
      },
    ],
  },
  {
    grupo: 'Caja y cuentas',
    permisos: [
      {
        clave: 'cobranzas.ver',
        etiqueta: 'Ver las cuentas por cobrar',
        descripcion: 'Consultar lo que está pendiente de cobro y de pago.',
        // GET /operations/accounts/:type
      },
      {
        clave: 'creditos.excepcion',
        etiqueta: 'Autorizar crédito por encima del límite',
        descripcion:
          'Registrar una venta a crédito a un cliente que se pasó de su límite o que tiene cuentas vencidas. La venta queda marcada con quién lo autorizó y por cuánto se pasó.',
        implica: ['ventas.registrar'],
        // Lo leen `createSale` y `updateSale` al evaluar el crédito del cliente.
        //
        // A propósito NO va en ninguna lista de ROLES_DEL_SISTEMA: solo lo tiene el
        // administrador, por su acceso total, hasta que el dueño decida dárselo a alguien.
      },
      {
        clave: 'cargaDiaria.registrar',
        etiqueta: 'Cargar totales del día',
        descripcion:
          'Registrar de una sola vez, día por día, la producción, las ventas por método de pago y el gasto total. Genera órdenes de producción, ventas y gastos reales con la fecha de cada día.',
        // GET/POST /carga-diaria
        //
        // Como `creditos.excepcion`, NO va en ninguna lista de ROLES_DEL_SISTEMA: escribe en
        // días pasados de producción, ventas y gastos a la vez, así que es de administrador
        // hasta que el dueño decida dárselo a alguien.
      },
      {
        clave: 'cobranzas.registrar',
        etiqueta: 'Registrar cobranzas',
        descripcion: 'Cobrar una cuenta pendiente y cambiarle la fecha de vencimiento.',
        implica: ['cobranzas.ver', 'metodosPago.ver'],
        // POST /operations/accounts/:type/payments, PATCH /operations/accounts/cobrar/:id/vencimiento
      },
      {
        clave: 'metodosPago.ver',
        etiqueta: 'Ver los métodos de pago',
        descripcion: 'Elegir con qué se cobra al registrar una venta o una cobranza.',
        // GET /operations/payment-methods, GET /operations/payment-method-categories
      },
      {
        clave: 'metodosPago.crearPropio',
        etiqueta: 'Crear su propio método de pago',
        descripcion: 'Agregar una cuenta o billetera propia para cobrar en ella.',
        implica: ['metodosPago.ver'],
        // POST /operations/payment-methods
      },
      {
        clave: 'metodosPago.administrar',
        etiqueta: 'Administrar todos los métodos de pago',
        descripcion: 'Crear, editar y eliminar los métodos de pago y sus categorías, de todos.',
        implica: ['metodosPago.ver'],
        // /payment-methods (clase entera)
      },
    ],
  },
  {
    grupo: 'Reportes',
    permisos: [
      {
        clave: 'reportes.ver',
        etiqueta: 'Ver los reportes del negocio',
        descripcion: 'Entrar al resumen diario y a los reportes de ventas, gastos y stock.',
        // GET /reports/business
      },
      {
        clave: 'reportes.trabajadores',
        etiqueta: 'Ver el reporte por trabajador',
        descripcion:
          'Ver cuánto vendió, cobró y recibió cada persona. Son datos del desempeño de otros.',
        implica: ['reportes.ver'],
        // GET /reports/workers
      },
      {
        clave: 'reportes.reparto',
        etiqueta: 'Ver su resumen de reparto',
        descripcion: 'Ver el propio resumen del día en la pantalla de inicio del repartidor.',
        // GET /reports/delivery-summary
      },
    ],
  },
  {
    grupo: 'Configuración',
    permisos: [
      {
        clave: 'trabajadores.ver',
        etiqueta: 'Ver los trabajadores',
        descripcion: 'Consultar el listado de personas para elegirlas en una operación.',
        // GET /trabajadores, GET /trabajadores/:id
      },
      {
        clave: 'trabajadores.administrar',
        etiqueta: 'Administrar trabajadores y cuentas',
        descripcion:
          'Dar de alta personas, vincularles una cuenta de acceso y cambiarles la contraseña.',
        implica: ['trabajadores.ver'],
        // POST /trabajadores, PATCH /trabajadores/:id, /users (clase entera)
      },
      {
        clave: 'unidades.elegir',
        etiqueta: 'Trabajar en cualquier unidad',
        descripcion:
          'Mirar y registrar en unidades distintas de la propia, y elegir cuáles ver a la vez.',
        // GET|PUT /unidades/visibles; además decide el alcance en unit-context.ts
      },
      {
        clave: 'unidades.administrar',
        etiqueta: 'Administrar unidades de negocio',
        descripcion: 'Crear y editar las unidades de negocio del sistema.',
        // GET|POST|PATCH /unidades
      },
      {
        clave: 'operaciones.atribuir',
        etiqueta: 'Registrar a nombre de otro',
        descripcion:
          'Cargar una venta o un gasto atribuido a otra persona, no a quien lo está tecleando.',
        implica: ['trabajadores.ver'],
        // Lo decide worker-context.ts al resolver el autor de la operación.
      },
      {
        clave: 'roles.administrar',
        etiqueta: 'Administrar roles y permisos',
        descripcion:
          'Crear roles, cambiar qué puede hacer cada uno y quitárselos. Es el permiso que reparte todos los demás.',
        // /roles (clase entera)
      },
    ],
  },
];

/** Todas las claves que existen, en el orden del catálogo. */
export const CLAVES_PERMISOS: string[] = CATALOGO_PERMISOS.flatMap((grupo) =>
  grupo.permisos.map((permiso) => permiso.clave),
);

const CLAVES_VALIDAS = new Set(CLAVES_PERMISOS);

/** Si la clave existe en el catálogo. Lo usa el DTO para no guardar permisos inventados. */
export function esPermisoConocido(clave: string): boolean {
  return CLAVES_VALIDAS.has(clave);
}

const IMPLICACIONES = new Map(
  CATALOGO_PERMISOS.flatMap((grupo) =>
    grupo.permisos.map((permiso) => [permiso.clave, permiso.implica ?? []] as const),
  ),
);

/**
 * Agrega los permisos que los marcados arrastran, y devuelve la lista en el orden del
 * catálogo, sin repetidos ni claves que ya no existan.
 *
 * Es transitivo —si A arrastra B y B arrastra C, marcar A trae los tres— porque las cadenas
 * son cortas pero reales: registrar una venta arrastra ver los métodos de cobro, y crear el
 * propio método de cobro también.
 */
export function expandirPermisos(claves: Iterable<string>): string[] {
  const resultado = new Set<string>();
  const pendientes = [...claves].filter((clave) => esPermisoConocido(clave));
  while (pendientes.length) {
    const clave = pendientes.pop() as string;
    if (resultado.has(clave)) continue;
    resultado.add(clave);
    for (const arrastrado of IMPLICACIONES.get(clave) ?? []) {
      if (!resultado.has(arrastrado)) pendientes.push(arrastrado);
    }
  }
  return CLAVES_PERMISOS.filter((clave) => resultado.has(clave));
}

/**
 * Los roles que trae el sistema, con los permisos con los que nacen.
 *
 * Cada lista reproduce EXACTAMENTE lo que ese rol podía hacer cuando los permisos estaban
 * escritos a mano en los `@Roles` y en `permissions.ts`, para que la migración no le quite
 * nada a nadie. De acá en adelante se editan desde el panel, no desde el código: esto solo
 * vuelve a usarse si alguien corre el seed sobre una base vacía.
 *
 * El administrador no lleva lista: tiene `accesoTotal`, que le da también los permisos que se
 * agreguen al catálogo mañana. Con una lista fija se quedaría afuera de cada función nueva.
 */
export const ROLES_DEL_SISTEMA: {
  clave: string;
  nombre: string;
  descripcion: string;
  accesoTotal?: boolean;
  permisos: string[];
}[] = [
  {
    clave: 'ADMIN',
    nombre: 'Administrador',
    descripcion: 'Ve y hace todo, en todas las unidades de negocio.',
    accesoTotal: true,
    permisos: [],
  },
  {
    clave: 'SELLER',
    nombre: 'Vendedor',
    descripcion: 'Lleva las ventas, los clientes, los gastos y la cobranza de su unidad.',
    permisos: [
      'dashboard.ver',
      'documento.consultar',
      'gastos.ver',
      'gastos.registrar',
      'gastos.categorias.crear',
      'gastos.categorias.editar',
      'proveedores.ver',
      'proveedores.crear',
      'proveedores.editar',
      'lotes.ver',
      'lotes.editar',
      'clientes.ver',
      'clientes.crear',
      'clientes.editar',
      'ventas.ver',
      'ventas.registrar',
      'ventas.editar',
      'recargas.ver',
      'devoluciones.ver',
      'devoluciones.registrar',
      'envases.ver',
      'bidonesRotos.ver',
      'bidonesRotos.registrar',
      'productos.ver',
      'productos.editar',
      'almacenes.ver',
      'almacenes.crear',
      'stock.ver',
      'kardex.ver',
      'cobranzas.ver',
      'cobranzas.registrar',
      'metodosPago.ver',
      'metodosPago.crearPropio',
      'reportes.ver',
      'reportes.trabajadores',
      'reportes.reparto',
      'trabajadores.ver',
    ],
  },
  {
    clave: 'WAREHOUSE',
    nombre: 'Almacén',
    descripcion: 'Produce, controla el stock y despacha. No toca dinero ni clientes.',
    permisos: [
      'dashboard.ver',
      'documento.consultar',
      'proveedores.ver',
      'proveedores.crear',
      'proveedores.editar',
      'produccion.gestionar',
      'lotes.ver',
      'lotes.editar',
      'ventas.ver',
      'ventas.registrar',
      'ventas.editar',
      'recargas.ver',
      'devoluciones.ver',
      'devoluciones.registrar',
      'envases.ver',
      'envases.ajustar',
      'bidonesRotos.ver',
      'bidonesRotos.registrar',
      'productos.ver',
      'productos.editar',
      'almacenes.ver',
      'almacenes.crear',
      'stock.ver',
      'stock.ajustar',
      'kardex.ver',
      'cobranzas.ver',
      'metodosPago.ver',
      'metodosPago.crearPropio',
      'reportes.ver',
      'reportes.trabajadores',
      'reportes.reparto',
      'trabajadores.ver',
    ],
  },
  {
    clave: 'DELIVERY',
    nombre: 'Repartidor',
    descripcion: 'Entrega, cobra en la puerta y recibe envases. Solo carga, no corrige.',
    permisos: [
      'dashboard.ver',
      'documento.consultar',
      'clientes.ver',
      'clientes.crear',
      'ventas.ver',
      'ventas.registrar',
      'envases.ver',
      'envases.ajustar',
      'productos.ver',
      'stock.ver',
      'metodosPago.ver',
      'metodosPago.crearPropio',
      'reportes.reparto',
    ],
  },
  {
    clave: 'SOCIO',
    nombre: 'Responsable de unidad',
    descripcion:
      'Lleva su propio puesto: sus ventas, sus gastos, sus clientes y su stock, sin ver los de la unidad principal.',
    permisos: [
      'dashboard.ver',
      'documento.consultar',
      'gastos.ver',
      'gastos.registrar',
      'gastos.categorias.crear',
      'proveedores.ver',
      'proveedores.crear',
      'proveedores.editar',
      'clientes.ver',
      'clientes.crear',
      'clientes.editar',
      'ventas.ver',
      'ventas.registrar',
      'ventas.editar',
      // El responsable de la unidad sí puede anular: es quien responde por su caja. Al
      // vendedor no se le da de fábrica, porque anular devuelve plata en efectivo; si hace
      // falta, se le tilda desde Configuración › Roles y permisos.
      'ventas.anular',
      'devoluciones.ver',
      'devoluciones.registrar',
      'envases.ver',
      'envases.ajustar',
      'productos.ver',
      'stock.ver',
      'kardex.ver',
      'cobranzas.ver',
      'cobranzas.registrar',
      'metodosPago.ver',
      'metodosPago.crearPropio',
      'reportes.ver',
      'reportes.reparto',
      'trabajadores.ver',
    ],
  },
];
