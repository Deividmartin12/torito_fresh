import { PrismaClient, RoleName } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const roles = await Promise.all(
    Object.values(RoleName).map((name) =>
      prisma.role.upsert({
        where: { name },
        update: {},
        create: { name },
      }),
    ),
  );

  const roleByName = Object.fromEntries(roles.map((role) => [role.name, role]));

  // Usuarios de acceso. Se puede iniciar sesión con el nombre de usuario o con el correo.
  const usuarios = [
    {
      username: 'admin',
      email: 'admin@toritofresh.local',
      name: 'Administrador',
      role: RoleName.ADMIN,
      password: 'admin',
      doc: '00000001',
      cargo: 'Administrador',
    },
    {
      username: '01',
      email: '01@toritofresh.local',
      name: 'Reparto 01',
      role: RoleName.DELIVERY,
      password: '01',
      doc: '00000011',
      cargo: 'Repartidor',
    },
    {
      username: '02',
      email: '02@toritofresh.local',
      name: 'Reparto 02',
      role: RoleName.DELIVERY,
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
      },
    });
  }

  await sembrarMetodosDePago();
  await sembrarCategoriasDeGasto();
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
