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
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
