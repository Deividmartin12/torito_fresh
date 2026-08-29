import { PrismaClient, Prisma, RoleName } from '@prisma/client';
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

  await Promise.all(
    ['Servicios', 'Transporte', 'Alquiler', 'Personal', 'Mantenimiento', 'Otros'].map((nombre) =>
      prisma.$executeRaw(
        Prisma.sql`INSERT INTO categoria_gasto (nombre, created_at, updated_at) VALUES (${nombre}, NOW(), NOW()) ON CONFLICT (nombre) DO NOTHING`,
      ),
    ),
  );

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

  await Promise.all(
    ['Agua', 'Bidon', 'Dispensador', 'Accesorio', 'Insumo'].map((nombre) =>
      prisma.tipoProducto.upsert({
        where: { nombre },
        update: { estado: true },
        create: { nombre },
      }),
    ),
  );

  await Promise.all(
    [
      { nombre: 'EFECTIVO', requiereOperacion: false },
      { nombre: 'YAPE', requiereOperacion: true },
      { nombre: 'PLIN', requiereOperacion: true },
      { nombre: 'TRANSFERENCIA', requiereOperacion: true },
      { nombre: 'TARJETA', requiereOperacion: true },
      { nombre: 'DEPOSITO', requiereOperacion: true },
    ].map((metodo) =>
      prisma.metodoPago.upsert({
        where: { nombre: metodo.nombre },
        update: { requiereOperacion: metodo.requiereOperacion, estado: true },
        create: metodo,
      }),
    ),
  );

  await Promise.all(
    [
      { codigo: 'DISPONIBLE', nombre: 'Disponible', permiteVenta: true },
      { codigo: 'RESERVADO', nombre: 'Reservado', permiteVenta: false },
      { codigo: 'DANADO', nombre: 'Danado', permiteVenta: false },
      { codigo: 'CUARENTENA', nombre: 'Cuarentena', permiteVenta: false },
      { codigo: 'VENCIDO', nombre: 'Vencido', permiteVenta: false },
      { codigo: 'VACIO', nombre: 'Vacio', permiteVenta: false },
      { codigo: 'LLENO', nombre: 'Lleno', permiteVenta: true },
    ].map((estado) =>
      prisma.estadoInventario.upsert({
        where: { codigo: estado.codigo },
        update: { nombre: estado.nombre, permiteVenta: estado.permiteVenta, estado: true },
        create: estado,
      }),
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
