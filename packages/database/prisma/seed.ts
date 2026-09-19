import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { ROLES_DEL_SISTEMA } from '../../../apps/api/src/auth/permisos';

const prisma = new PrismaClient();

async function main() {
  const unidadPrincipal = await sembrarUnidadPrincipal();
  const roleByName = await sembrarRoles();

  // Usuarios de acceso. Se puede iniciar sesión con el nombre de usuario o con el correo.
  const usuarios = [
    {
      username: 'admin',
      email: 'admin@toritofresh.local',
      name: 'Administrador',
      role: 'ADMIN',
      password: 'admin',
      doc: '00000001',
      cargo: 'Administrador',
    },
    {
      username: '01',
      email: '01@toritofresh.local',
      name: 'Reparto 01',
      role: 'DELIVERY',
      password: '01',
      doc: '00000011',
      cargo: 'Repartidor',
    },
    {
      username: '02',
      email: '02@toritofresh.local',
      name: 'Reparto 02',
      role: 'DELIVERY',
      password: '02',
      doc: '00000012',
      cargo: 'Repartidor',
    },
  ];

  for (const u of usuarios) {
    const passwordHash = await bcrypt.hash(u.password, 10);
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        username: u.username,
        passwordHash,
        active: true,
        roleId: roleByName[u.role].id,
      },
      create: {
        name: u.name,
        email: u.email,
        username: u.username,
        passwordHash,
        active: true,
        roleId: roleByName[u.role].id,
      },
    });

    // Cada usuario tiene un trabajador para que las operaciones (ventas, compras)
    // puedan resolver quién las registró.
    await prisma.trabajador.upsert({
      where: { numeroDocumento: u.doc },
      update: {
        nombres: u.name,
        apellidos: 'Torito Fresh',
        cargo: u.cargo,
        estado: true,
        userId: user.id,
      },
      create: {
        tipoDocumento: 'DNI',
        numeroDocumento: u.doc,
        nombres: u.name,
        apellidos: 'Torito Fresh',
        correo: u.email,
        cargo: u.cargo,
        userId: user.id,
        unidadNegocioId: unidadPrincipal.id,
      },
    });
  }

  await sembrarMetodosDePago();
  await sembrarCategoriasDeGasto();
}

/**
 * Los cinco roles que trae el sistema, con los permisos con los que nacen.
 *
 * La lista sale del mismo catálogo que usa el API (`apps/api/src/auth/permisos.ts`), para que
 * no haya dos versiones que se vayan separando. Los permisos se REEMPLAZAN enteros en cada
 * corrida: el seed reafirma el estado de fábrica, y si alguien le sacó un permiso a un rol
 * desde el panel, correr el seed se lo devuelve.
 */
async function sembrarRoles() {
  const roles = await Promise.all(
    ROLES_DEL_SISTEMA.map(async (definicion) => {
      const rol = await prisma.role.upsert({
        where: { clave: definicion.clave },
        update: {
          nombre: definicion.nombre,
          descripcion: definicion.descripcion,
          sistema: true,
          accesoTotal: definicion.accesoTotal ?? false,
        },
        create: {
          clave: definicion.clave,
          nombre: definicion.nombre,
          descripcion: definicion.descripcion,
          sistema: true,
          accesoTotal: definicion.accesoTotal ?? false,
        },
      });

      // El rol con acceso total no lleva filas: su lista es el catálogo entero, y guardar una
      // copia solo conseguiría que se desactualice al agregar un permiso nuevo.
      if (!rol.accesoTotal) {
        await prisma.rolPermiso.deleteMany({ where: { roleId: rol.id } });
        await prisma.rolPermiso.createMany({
          data: definicion.permisos.map((clave) => ({ roleId: rol.id, clave })),
        });
      }
      return rol;
    }),
  );

  return Object.fromEntries(roles.map((rol) => [rol.clave, rol]));
}

/**
 * La unidad "Principal" es la operación de siempre: la migración la crea y le asigna todo lo
 * que ya existía, y acá se reafirma para que una base sembrada desde cero también la tenga.
 * Es la unidad por defecto de cualquier trabajador que no elija otra.
 */
async function sembrarUnidadPrincipal() {
  return prisma.unidadNegocio.upsert({
    where: { codigo: 'UN-001' },
    update: { principal: true, estado: true },
    create: { codigo: 'UN-001', nombre: 'Principal', principal: true },
  });
}

/**
 * "Pago a trabajador" es una categoría fija del sistema: es la que exige un beneficiario en
 * el gasto y hace que ese pago aparezca en el reporte del trabajador. La migración ya la
 * crea; acá se reafirma para que una base sembrada desde cero también la tenga.
 */
async function sembrarCategoriasDeGasto() {
  await prisma.categoriaGasto.upsert({
    where: { nombre: 'Pago a trabajador' },
    update: { sistema: true },
    create: { nombre: 'Pago a trabajador', sistema: true },
  });
}

/**
 * Categorías de cobro y el Efectivo global. Una instalación nueva arranca solo con el
 * Efectivo (disponible para todos) para poder registrar una venta sin configurar nada;
 * cada repartidor se agrega después su propio Yape/Plin desde la app, y esos métodos
 * concretos ya no se siembran acá.
 */
async function sembrarMetodosDePago() {
  const categorias = [
    { nombre: 'EFECTIVO', icono: 'banknote', requiereReferencia: false },
    { nombre: 'YAPE', icono: 'smartphone', requiereReferencia: true },
    { nombre: 'PLIN', icono: 'smartphone', requiereReferencia: true },
    { nombre: 'TRANSFERENCIA', icono: 'landmark', requiereReferencia: true },
    { nombre: 'TARJETA', icono: 'credit-card', requiereReferencia: false },
  ];

  const creadas = await Promise.all(
    categorias.map((categoria) =>
      prisma.categoriaMetodoPago.upsert({
        where: { nombre: categoria.nombre },
        update: {},
        create: categoria,
      }),
    ),
  );

  const porNombre = Object.fromEntries(creadas.map((categoria) => [categoria.nombre, categoria]));

  // Único método sembrado: el efectivo lo cobra cualquiera, así que va sin dueño ni
  // referencia. El resto de categorías queda disponible para que el admin arme sus Yape,
  // Plin, etc. desde la pantalla de Métodos de pago.
  await crearMetodoSiFalta(porNombre.EFECTIVO.id, null, null);
}

/** `MetodoPago` ya no tiene campo único, así que el upsert se hace a mano. */
async function crearMetodoSiFalta(
  categoriaId: bigint,
  referencia: string | null,
  trabajadorId: bigint | null,
) {
  const existente = await prisma.metodoPago.findFirst({
    where: { categoriaId, referencia, trabajadorId },
  });
  if (existente) return;
  await prisma.metodoPago.create({ data: { categoriaId, referencia, trabajadorId } });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
