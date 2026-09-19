import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { nextSequentialCode } from '../common/next-code';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateUnidadNegocioDto,
  UnidadesVisiblesDto,
  UpdateUnidadNegocioDto,
} from './unidades.dto';

type UnidadConConteo = Prisma.UnidadNegocioGetPayload<{
  include: { _count: { select: { ventas: true; gastos: true; clientes: true; almacenes: true } } };
}>;

const CON_CONTEO = {
  _count: { select: { ventas: true, gastos: true, clientes: true, almacenes: true } },
} as const;

/**
 * Alta y mantenimiento de las unidades de negocio.
 *
 * La unidad Principal no se crea ni se borra desde acá: nace en la migración y es la dueña
 * de todo lo que existía antes de que hubiera unidades. Lo que sí se hace acá es dar de alta
 * cada puesto satélite, junto con su almacén propio, que es lo que lo vuelve operativo.
 */
@Injectable()
export class UnidadesService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const rows = await this.prisma.unidadNegocio.findMany({
      orderBy: [{ principal: 'desc' }, { nombre: 'asc' }],
      include: CON_CONTEO,
    });
    return rows.map((row) => this.view(row));
  }

  /**
   * Las unidades que el actor puede elegir en el selector de reportes.
   *
   * Un ADMIN las ve todas (más la opción de consolidado, que arma el front). Cualquier otro
   * rol ve solo la suya: el selector le queda fijo y el API igual le rechazaría otra.
   */
  async propias(actor: AuthUser) {
    const rows = await this.prisma.unidadNegocio.findMany({
      where: {
        estado: true,
        ...(actor.role === 'ADMIN'
          ? {}
          : { id: actor.unidadNegocioId ? BigInt(actor.unidadNegocioId) : undefined }),
      },
      orderBy: [{ principal: 'desc' }, { nombre: 'asc' }],
      select: {
        id: true,
        codigo: true,
        nombre: true,
        principal: true,
        controlaInventario: true,
      },
    });
    return rows.map((row) => ({
      id: row.id.toString(),
      codigo: row.codigo,
      nombre: row.nombre,
      principal: row.principal,
      // Lo usa el menú: en una unidad que no lleva inventario no existen Producción, Lotes,
      // Almacenes, Kardex ni Stock, así que no se muestran.
      controlaInventario: row.controlaInventario,
    }));
  }

  async get(id: string) {
    return this.view(await this.find(id));
  }

  /**
   * Qué unidades está mirando el usuario y cuáles puede elegir.
   *
   * `todas: true` (ninguna fila guardada) no es lo mismo que tener marcadas todas las de hoy:
   * incluye también las que se creen después. Por eso se devuelve como una bandera aparte y no
   * como una lista completa.
   */
  async visibles(actor: AuthUser) {
    const [elegidas, disponibles] = await Promise.all([
      this.prisma.usuarioUnidadVisible.findMany({
        where: { userId: actor.userId },
        select: { unidadNegocioId: true },
      }),
      this.propias(actor),
    ]);
    return {
      todas: elegidas.length === 0,
      unidades: elegidas.map((fila) => fila.unidadNegocioId.toString()),
      disponibles,
    };
  }

  /** Guarda la elección. Lista vacía = todas, que es como se borra la preferencia. */
  async guardarVisibles(actor: AuthUser, dto: UnidadesVisiblesDto) {
    const pedidas = [...new Set(dto.unidades.map((id) => id.trim()).filter(Boolean))];
    const ids: bigint[] = [];
    for (const id of pedidas) {
      try {
        ids.push(BigInt(id));
      } catch {
        throw new BadRequestException('Hay una unidad de negocio inválida en la selección');
      }
    }
    if (ids.length) {
      const activas = await this.prisma.unidadNegocio.findMany({
        where: { id: { in: ids }, estado: true },
        select: { id: true },
      });
      if (activas.length !== ids.length) {
        throw new BadRequestException(
          'Alguna de las unidades seleccionadas no existe o está inactiva',
        );
      }
    }
    // Se reemplaza la selección entera en una transacción: si quedaran las filas viejas junto a
    // las nuevas, el usuario terminaría viendo unidades que acababa de desmarcar.
    await this.prisma.$transaction([
      this.prisma.usuarioUnidadVisible.deleteMany({ where: { userId: actor.userId } }),
      ...(ids.length
        ? [
            this.prisma.usuarioUnidadVisible.createMany({
              data: ids.map((unidadNegocioId) => ({ userId: actor.userId, unidadNegocioId })),
            }),
          ]
        : []),
    ]);
    return this.visibles(actor);
  }

  async create(dto: CreateUnidadNegocioDto) {
    const nombre = dto.nombre.trim();
    const codigo = await nextSequentialCode('UN', async () => {
      const ultima = await this.prisma.unidadNegocio.findFirst({
        where: { codigo: { startsWith: 'UN-' } },
        orderBy: { codigo: 'desc' },
        select: { codigo: true },
      });
      return ultima?.codigo ?? null;
    });

    const controlaInventario = dto.controlaInventario !== false;
    // La unidad que no lleva inventario también necesita su almacén: `Venta.almacenOrigenId` es
    // obligatorio y hace de ancla contable, aunque nunca se le escriba una fila de stock. Por
    // eso acá no se respeta `crearAlmacen`: sin almacén no podría registrar ni una venta.
    const crearAlmacen = !controlaInventario || dto.crearAlmacen !== false;

    try {
      const creada = await this.prisma.$transaction(async (tx) => {
        const unidad = await tx.unidadNegocio.create({
          data: { codigo, nombre, controlaInventario },
        });
        if (crearAlmacen) {
          const codigoAlmacen = await nextSequentialCode('ALM', async () => {
            const ultimo = await tx.almacen.findFirst({
              where: { codigo: { startsWith: 'ALM-' } },
              orderBy: { codigo: 'desc' },
              select: { codigo: true },
            });
            return ultimo?.codigo ?? null;
          });
          await tx.almacen.create({
            data: {
              unidadNegocioId: unidad.id,
              codigo: codigoAlmacen,
              nombre: `Almacén ${nombre}`,
            },
          });
        }
        return tx.unidadNegocio.findUniqueOrThrow({
          where: { id: unidad.id },
          include: CON_CONTEO,
        });
      });
      return this.view(creada);
    } catch (error) {
      throw this.traducirNombreDuplicado(error);
    }
  }

  async update(id: string, dto: UpdateUnidadNegocioDto) {
    const actual = await this.find(id);
    // Desactivar la Principal dejaría al negocio entero sin unidad por defecto.
    if (actual.principal && dto.estado === false) {
      throw new BadRequestException('La unidad principal no se puede desactivar');
    }
    if (
      dto.controlaInventario !== undefined &&
      dto.controlaInventario !== actual.controlaInventario
    ) {
      // La Principal es la que produce: de su almacén sale el stock de todo el negocio.
      if (actual.principal) {
        throw new BadRequestException('La unidad principal siempre lleva inventario');
      }
      // Cambiarlo con ventas hechas rompe datos en las dos direcciones. Si pasa a llevar
      // inventario, sus ventas viejas no tienen movimiento de salida y quedan ineditables de
      // golpe, y el reporte mezclaría costos de kardex con costos de referencia en la misma
      // tabla. Si deja de llevarlo, quedan filas de stock que ningún flujo puede reconciliar,
      // porque en el sistema no hay ajustes ni transferencias.
      if (actual._count.ventas > 0) {
        throw new BadRequestException(
          'Esta unidad ya tiene ventas registradas con el modo actual. Cambiarlo dejaría su inventario y sus costos inconsistentes: crea una unidad nueva.',
        );
      }
    }
    try {
      const actualizada = await this.prisma.unidadNegocio.update({
        where: { id: actual.id },
        data: {
          ...(dto.nombre !== undefined ? { nombre: dto.nombre.trim() } : {}),
          ...(dto.estado !== undefined ? { estado: dto.estado } : {}),
          ...(dto.controlaInventario !== undefined
            ? { controlaInventario: dto.controlaInventario }
            : {}),
        },
        include: CON_CONTEO,
      });
      return this.view(actualizada);
    } catch (error) {
      throw this.traducirNombreDuplicado(error);
    }
  }

  private async find(id: string) {
    let unidadId: bigint;
    try {
      unidadId = BigInt(id);
    } catch {
      throw new NotFoundException('Unidad de negocio no encontrada');
    }
    const row = await this.prisma.unidadNegocio.findUnique({
      where: { id: unidadId },
      include: CON_CONTEO,
    });
    if (!row) throw new NotFoundException('Unidad de negocio no encontrada');
    return row;
  }

  private traducirNombreDuplicado(error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return new ConflictException('Ya existe una unidad de negocio con ese nombre');
    }
    return error;
  }

  private view(row: UnidadConConteo) {
    return {
      id: row.id.toString(),
      codigo: row.codigo,
      nombre: row.nombre,
      principal: row.principal,
      estado: row.estado,
      controlaInventario: row.controlaInventario,
      // Lo que hay dentro de la unidad. Sirve para avisar en pantalla por qué una unidad con
      // operaciones no se puede eliminar (la FK es RESTRICT), si le falta el almacén, y si
      // todavía se le puede cambiar el modo (solo mientras no tenga ventas).
      ventas: row._count.ventas,
      gastos: row._count.gastos,
      clientes: row._count.clientes,
      almacenes: row._count.almacenes,
    };
  }
}
