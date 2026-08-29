import { PrismaClient, Prisma, RoleName, ClientType } from '@prisma/client';
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
  const passwordHash = await bcrypt.hash('Admin12345', 10);

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@toritofresh.local' },
    update: {
      name: 'Administrador',
      passwordHash,
      active: true,
      roleId: roleByName.ADMIN.id,
    },
    create: {
      name: 'Administrador',
      email: 'admin@toritofresh.local',
      passwordHash,
      active: true,
      roleId: roleByName.ADMIN.id,
    },
  });

  const deliveryPassword = await bcrypt.hash('Reparto12345', 10);
  const deliveryUser = await prisma.user.upsert({
    where: { email: 'reparto@toritofresh.local' },
    update: {
      name: 'Repartidor demo',
      passwordHash: deliveryPassword,
      active: true,
      roleId: roleByName.DELIVERY.id,
    },
    create: {
      name: 'Repartidor demo',
      email: 'reparto@toritofresh.local',
      passwordHash: deliveryPassword,
      active: true,
      roleId: roleByName.DELIVERY.id,
    },
  });

  await prisma.client.createMany({
    data: [
      {
        name: 'Juan Perez',
        document: '45871236',
        phone: '987654321',
        address: 'Av. Los Olivos 123',
        reference: 'Frente al parque',
        type: ClientType.HOME,
      },
      {
        name: 'Restaurante El Buen Sabor',
        document: '20600123456',
        phone: '955222111',
        address: 'Jr. Comercio 450',
        reference: 'Puerta azul',
        type: ClientType.RESTAURANT,
      },
      {
        name: 'Minimarket La Esquina',
        document: '10456789123',
        phone: '944333222',
        address: 'Calle Central 890',
        reference: 'Al costado de la farmacia',
        type: ClientType.STORE,
      },
    ],
    skipDuplicates: true,
  });

  const tiposProducto = await Promise.all(
    ['Agua', 'Bidon', 'Dispensador', 'Accesorio', 'Insumo'].map((nombre) =>
      prisma.tipoProducto.upsert({
        where: { nombre },
        update: { estado: true },
        create: { nombre },
      }),
    ),
  );
  const tipoProductoPorNombre = Object.fromEntries(
    tiposProducto.map((tipo) => [tipo.nombre, tipo]),
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

  await prisma.almacen.upsert({
    where: { codigo: 'ALM-PRINCIPAL' },
    update: { nombre: 'Almacen principal', tipo: 'PRINCIPAL', estado: true },
    create: {
      codigo: 'ALM-PRINCIPAL',
      nombre: 'Almacen principal',
      tipo: 'PRINCIPAL',
    },
  });

  await Promise.all(
    [
      { codigo: 'ALM-MP', nombre: 'Materia prima e insumos', tipo: 'MATERIA_PRIMA' },
      { codigo: 'ALM-PT', nombre: 'Producto terminado', tipo: 'PRODUCTO_TERMINADO' },
      { codigo: 'ALM-ENV', nombre: 'Envases vacios y lavado', tipo: 'ENVASES' },
      { codigo: 'PLANTA-01', nombre: 'Planta de produccion', tipo: 'PLANTA' },
    ].map((almacen) =>
      prisma.almacen.upsert({
        where: { codigo: almacen.codigo },
        update: { ...almacen, estado: true },
        create: almacen,
      }),
    ),
  );

  await Promise.all([
    prisma.producto.upsert({
      where: { codigo: 'AGUA-20L' },
      update: {},
      create: {
        tipoProductoId: tipoProductoPorNombre.Agua.id,
        codigo: 'AGUA-20L',
        nombre: 'Agua purificada 20 L',
        unidadMedida: 'UNIDAD',
        capacidadLitros: 20,
        precioVenta: 12,
        costoReferencia: 5,
        controlaLote: true,
      },
    }),
    prisma.producto.upsert({
      where: { codigo: 'BIDON-20L' },
      update: {},
      create: {
        tipoProductoId: tipoProductoPorNombre.Bidon.id,
        codigo: 'BIDON-20L',
        nombre: 'Bidon retornable 20 L',
        unidadMedida: 'UNIDAD',
        capacidadLitros: 20,
        precioVenta: 25,
        costoReferencia: 18,
        esRetornable: true,
      },
    }),
    prisma.producto.upsert({
      where: { codigo: 'DISP-MANUAL' },
      update: {},
      create: {
        tipoProductoId: tipoProductoPorNombre.Dispensador.id,
        codigo: 'DISP-MANUAL',
        nombre: 'Dispensador manual',
        unidadMedida: 'UNIDAD',
        precioVenta: 18,
        costoReferencia: 10,
      },
    }),
    prisma.producto.upsert({
      where: { codigo: 'TAPA-20L' },
      update: {},
      create: {
        tipoProductoId: tipoProductoPorNombre.Insumo.id,
        codigo: 'TAPA-20L',
        nombre: 'Tapa para bidon 20 L',
        unidadMedida: 'UNIDAD',
        precioVenta: 0,
        costoReferencia: 0.12,
      },
    }),
    prisma.producto.upsert({
      where: { codigo: 'SELLO-20L' },
      update: {},
      create: {
        tipoProductoId: tipoProductoPorNombre.Insumo.id,
        codigo: 'SELLO-20L',
        nombre: 'Sello de seguridad 20 L',
        unidadMedida: 'UNIDAD',
        precioVenta: 0,
        costoReferencia: 0.08,
      },
    }),
    prisma.producto.upsert({
      where: { codigo: 'ETIQ-20L' },
      update: {},
      create: {
        tipoProductoId: tipoProductoPorNombre.Insumo.id,
        codigo: 'ETIQ-20L',
        nombre: 'Etiqueta agua 20 L',
        unidadMedida: 'UNIDAD',
        precioVenta: 0,
        costoReferencia: 0.05,
      },
    }),
    prisma.producto.upsert({
      where: { codigo: 'AGUA-TRATADA' },
      update: {},
      create: {
        tipoProductoId: tipoProductoPorNombre.Insumo.id,
        codigo: 'AGUA-TRATADA',
        nombre: 'Agua tratada a granel',
        unidadMedida: 'LITRO',
        precioVenta: 0,
        costoReferencia: 0.02,
      },
    }),
  ]);

  await prisma.trabajador.upsert({
    where: { numeroDocumento: '45870001' },
    update: {
      nombres: 'Administrador',
      apellidos: 'Torito Fresh',
      cargo: 'Administrador',
      estado: true,
      userId: adminUser.id,
    },
    create: {
      tipoDocumento: 'DNI',
      numeroDocumento: '45870001',
      nombres: 'Administrador',
      apellidos: 'Torito Fresh',
      correo: 'admin@toritofresh.local',
      cargo: 'Administrador',
      userId: adminUser.id,
    },
  });

  await prisma.trabajador.upsert({
    where: { numeroDocumento: '45870002' },
    update: {
      nombres: 'Repartidor',
      apellidos: 'Demo',
      cargo: 'Repartidor',
      estado: true,
      userId: deliveryUser.id,
    },
    create: {
      tipoDocumento: 'DNI',
      numeroDocumento: '45870002',
      nombres: 'Repartidor',
      apellidos: 'Demo',
      correo: 'reparto@toritofresh.local',
      cargo: 'Repartidor',
      userId: deliveryUser.id,
    },
  });

  await Promise.all(
    [
      {
        ruc: '20600111221',
        razonSocial: 'Aguas del Norte S.A.C.',
        nombreComercial: 'Aguas del Norte',
      },
      {
        ruc: '20600111222',
        razonSocial: 'Envases Peruanos E.I.R.L.',
        nombreComercial: 'Envases Peruanos',
      },
      {
        ruc: '20600111223',
        razonSocial: 'Suministros Lima S.A.',
        nombreComercial: 'Suministros Lima',
      },
    ].map((proveedor) =>
      prisma.proveedor.upsert({
        where: { ruc: proveedor.ruc },
        update: { ...proveedor, estado: true },
        create: proveedor,
      }),
    ),
  );

  await Promise.all(
    [
      {
        tipoDocumento: 'DNI',
        numeroDocumento: '45871236',
        nombreLegal: 'Juan Perez',
        telefono: '987654321',
        direccion: 'Av. Los Olivos 123',
      },
      {
        tipoDocumento: 'RUC',
        numeroDocumento: '20600123456',
        nombreLegal: 'Restaurante El Buen Sabor',
        telefono: '955222111',
        direccion: 'Jr. Comercio 450',
      },
      {
        tipoDocumento: 'RUC',
        numeroDocumento: '10456789123',
        nombreLegal: 'Minimarket La Esquina',
        telefono: '944333222',
        direccion: 'Calle Central 890',
      },
    ].map((cliente) =>
      prisma.cliente.upsert({
        where: { numeroDocumento: cliente.numeroDocumento },
        update: { ...cliente, estado: true },
        create: cliente,
      }),
    ),
  );

  const [almacenPrincipal, disponible, productosOperativos] = await Promise.all([
    prisma.almacen.findUniqueOrThrow({ where: { codigo: 'ALM-PRINCIPAL' } }),
    prisma.estadoInventario.findUniqueOrThrow({ where: { codigo: 'DISPONIBLE' } }),
    prisma.producto.findMany({
      where: { codigo: { in: ['AGUA-20L', 'BIDON-20L', 'DISP-MANUAL'] } },
    }),
  ]);

  for (const producto of productosOperativos) {
    const stock = await prisma.stockAlmacen.findFirst({
      where: {
        productoId: producto.id,
        almacenId: almacenPrincipal.id,
        loteId: null,
        estadoInventarioId: disponible.id,
      },
    });
    if (!stock) {
      await prisma.stockAlmacen.create({
        data: {
          productoId: producto.id,
          almacenId: almacenPrincipal.id,
          estadoInventarioId: disponible.id,
          cantidad:
            producto.codigo === 'AGUA-20L' ? 100 : producto.codigo === 'BIDON-20L' ? 40 : 24,
          stockMinimo: producto.codigo === 'AGUA-20L' ? 30 : 8,
          costoPromedio: producto.costoReferencia,
        },
      });
    }
  }

  const [almacenMateriaPrima, vacio, insumosProduccion] = await Promise.all([
    prisma.almacen.findUniqueOrThrow({ where: { codigo: 'ALM-MP' } }),
    prisma.estadoInventario.findUniqueOrThrow({ where: { codigo: 'VACIO' } }),
    prisma.producto.findMany({
      where: { codigo: { in: ['TAPA-20L', 'SELLO-20L', 'ETIQ-20L', 'AGUA-TRATADA'] } },
    }),
  ]);
  for (const producto of insumosProduccion) {
    const stock = await prisma.stockAlmacen.findFirst({
      where: {
        productoId: producto.id,
        almacenId: almacenMateriaPrima.id,
        loteId: null,
        estadoInventarioId: disponible.id,
      },
    });
    if (!stock)
      await prisma.stockAlmacen.create({
        data: {
          productoId: producto.id,
          almacenId: almacenMateriaPrima.id,
          estadoInventarioId: disponible.id,
          cantidad: producto.codigo === 'AGUA-TRATADA' ? 20000 : 1000,
          stockMinimo: 200,
          costoPromedio: producto.costoReferencia,
        },
      });
  }
  const bidon = await prisma.producto.findUniqueOrThrow({ where: { codigo: 'BIDON-20L' } });
  const emptyStock = await prisma.stockAlmacen.findFirst({
    where: {
      productoId: bidon.id,
      almacenId: almacenMateriaPrima.id,
      loteId: null,
      estadoInventarioId: vacio.id,
    },
  });
  if (!emptyStock)
    await prisma.stockAlmacen.create({
      data: {
        productoId: bidon.id,
        almacenId: almacenMateriaPrima.id,
        estadoInventarioId: vacio.id,
        cantidad: 500,
        stockMinimo: 100,
        costoPromedio: bidon.costoReferencia,
      },
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
