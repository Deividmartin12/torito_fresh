import { PrismaClient, RoleName, ClientType, ProductCategory } from "@prisma/client";
import * as bcrypt from "bcryptjs";

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
  const passwordHash = await bcrypt.hash("Admin12345", 10);

  await prisma.user.upsert({
    where: { email: "admin@toritofresh.local" },
    update: {
      name: "Administrador",
      passwordHash,
      active: true,
      roleId: roleByName.ADMIN.id,
    },
    create: {
      name: "Administrador",
      email: "admin@toritofresh.local",
      passwordHash,
      active: true,
      roleId: roleByName.ADMIN.id,
    },
  });

  const deliveryPassword = await bcrypt.hash("Reparto12345", 10);
  await prisma.user.upsert({
    where: { email: "reparto@toritofresh.local" },
    update: {
      name: "Repartidor demo",
      passwordHash: deliveryPassword,
      active: true,
      roleId: roleByName.DELIVERY.id,
    },
    create: {
      name: "Repartidor demo",
      email: "reparto@toritofresh.local",
      passwordHash: deliveryPassword,
      active: true,
      roleId: roleByName.DELIVERY.id,
    },
  });

  await prisma.client.createMany({
    data: [
      {
        name: "Juan Perez",
        document: "45871236",
        phone: "987654321",
        address: "Av. Los Olivos 123",
        reference: "Frente al parque",
        type: ClientType.HOME,
      },
      {
        name: "Restaurante El Buen Sabor",
        document: "20600123456",
        phone: "955222111",
        address: "Jr. Comercio 450",
        reference: "Puerta azul",
        type: ClientType.RESTAURANT,
      },
      {
        name: "Minimarket La Esquina",
        document: "10456789123",
        phone: "944333222",
        address: "Calle Central 890",
        reference: "Al costado de la farmacia",
        type: ClientType.STORE,
      },
    ],
    skipDuplicates: true,
  });

  await prisma.product.createMany({
    data: [
      {
        name: "Vidon de agua 20L",
        sku: "VIDON-20L",
        description: "Vidon retornable lleno de 20 litros",
        category: ProductCategory.WATER,
        price: 12,
        stock: 120,
        returnable: true,
      },
      {
        name: "Bidon pequeno 7L",
        sku: "BIDON-7L",
        description: "Bidon pequeno para hogares y oficinas",
        category: ProductCategory.WATER,
        price: 6,
        stock: 80,
        returnable: false,
      },
      {
        name: "Dispensador manual",
        sku: "DISP-MANUAL",
        description: "Dispensador para vidon de 20 litros",
        category: ProductCategory.DISPENSER,
        price: 18,
        stock: 25,
        returnable: false,
      },
    ],
    skipDuplicates: true,
  });

  await prisma.warehouseState.upsert({
    where: { id: "main" },
    update: { emptyContainers: 45 },
    create: { id: "main", emptyContainers: 45 },
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
