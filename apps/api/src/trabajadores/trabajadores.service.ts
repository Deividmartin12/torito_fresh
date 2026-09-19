import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { filtroUnidad, resolverAlcanceUnidad, unidadPrincipalId } from '../common/unit-context';
import { PrismaService } from '../prisma/prisma.service';
import { DbClient, UsersService } from '../users/users.service';
import { CreateTrabajadorDto, CuentaTrabajadorDto, UpdateTrabajadorDto } from './trabajadores.dto';

/** El trabajador siempre se lee con su cuenta de acceso: la UI muestra ambas cosas juntas. */
const CON_CUENTA = {
  user: { include: { role: true } },
  unidadNegocio: { select: { id: true, nombre: true } },
} as const;
type TrabajadorConCuenta = Prisma.TrabajadorGetPayload<{ include: typeof CON_CUENTA }>;

/** Datos del trabajador de los que se deriva su cuenta de acceso. */
type DatosPersona = { nombres: string; apellidos: string; correo: string; estado: boolean };

@Injectable()
export class TrabajadoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  async list(actor: AuthUser, search?: string, active?: string, unidad?: string) {
    const alcance = await resolverAlcanceUnidad(this.prisma, actor, unidad);
    const term = search?.trim();
    const rows = await this.prisma.trabajador.findMany({
      where: {
        ...filtroUnidad(alcance),
        ...(term
          ? {
              OR: [
                { nombres: { contains: term, mode: 'insensitive' } },
                { apellidos: { contains: term, mode: 'insensitive' } },
                { numeroDocumento: { contains: term } },
                { cargo: { contains: term, mode: 'insensitive' } },
              ],
            }
          : {}),
        ...(active === 'true' ? { estado: true } : active === 'false' ? { estado: false } : {}),
      },
      orderBy: { nombres: 'asc' },
      include: CON_CUENTA,
    });
    return rows.map((row) => this.view(row));
  }

  async get(id: string, actor: AuthUser, unidad?: string) {
    const alcance = await resolverAlcanceUnidad(this.prisma, actor, unidad);
    const row = await this.find(id);
    if (alcance.tipo === 'una' && row.unidadNegocioId !== alcance.id) {
      throw new NotFoundException('Trabajador no encontrado');
    }
    return this.view(row);
  }

  /**
   * Alta del trabajador y, si viene `cuenta`, de su acceso al sistema. Las dos cosas van en
   * UNA transacción: si el documento está repetido no puede quedar suelta la cuenta de un
   * trabajador que nunca llegó a existir (antes pasaba, porque el usuario se guardaba
   * primero y nadie lo deshacía).
   */
  async create(dto: CreateTrabajadorDto) {
    const unidadNegocioId = await this.resolverUnidad(dto.unidadNegocioId);
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const userId = await this.aplicarCuenta(
          tx,
          dto,
          {
            nombres: dto.nombres,
            apellidos: dto.apellidos,
            correo: dto.correo ?? '',
            estado: true,
          },
          null,
        );
        return tx.trabajador.create({
          data: {
            ...this.createData(dto),
            unidadNegocioId,
            ...(userId ? { userId } : {}),
          },
          include: CON_CUENTA,
        });
      });
      return this.view(created);
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  /** Igual que el alta: la persona y su cuenta se guardan juntas, o no se guarda nada. */
  async update(id: string, dto: UpdateTrabajadorDto) {
    const actual = await this.find(id);
    const unidadNegocioId =
      dto.unidadNegocioId === undefined
        ? undefined
        : await this.resolverUnidad(dto.unidadNegocioId);
    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const userId = await this.aplicarCuenta(
          tx,
          dto,
          {
            nombres: dto.nombres ?? actual.nombres,
            apellidos: dto.apellidos ?? actual.apellidos,
            correo: dto.correo ?? actual.correo ?? '',
            estado: dto.estado ?? actual.estado,
          },
          actual.userId,
        );
        return tx.trabajador.update({
          where: { id: actual.id },
          data: {
            ...this.updateData(dto),
            ...(unidadNegocioId !== undefined ? { unidadNegocioId } : {}),
            // `userId: null` desvincula; `undefined` deja la cuenta como está.
            ...(userId !== undefined ? { userId } : {}),
          },
          include: CON_CUENTA,
        });
      });
      return this.view(updated);
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  /**
   * Deja la cuenta de acceso como corresponde y devuelve qué vínculo escribir en el
   * trabajador: un id, `null` para desvincular, o `undefined` para no tocarlo.
   *
   * - `cuenta` sobre alguien que ya tiene acceso → se edita esa cuenta (usuario, rol y, si
   *   vino una contraseña nueva, también la contraseña).
   * - `cuenta` sobre alguien que todavía no lo tiene → se crea la cuenta y se vincula.
   * - `userId` con valor → se vincula una cuenta que ya existe; vacío → se desvincula.
   * - Nada de eso pero cambió el estado → se activa o desactiva el acceso junto con el
   *   trabajador, para que dar de baja a alguien le cierre también el login.
   *
   * El nombre y el correo de la cuenta salen siempre de los datos de la persona: si viviera
   * cada uno por su lado, terminarían contando cosas distintas de la misma persona.
   */
  private async aplicarCuenta(
    tx: DbClient,
    dto: { userId?: string; cuenta?: CuentaTrabajadorDto; estado?: boolean },
    persona: DatosPersona,
    userIdActual: string | null,
  ): Promise<string | null | undefined> {
    if (dto.cuenta) {
      const email = persona.correo.trim().toLowerCase();
      if (!email) {
        throw new BadRequestException(
          'El correo del trabajador es obligatorio para crear su cuenta de acceso',
        );
      }
      const name = `${persona.nombres.trim()} ${persona.apellidos.trim()}`.trim();

      if (userIdActual) {
        await this.users.update(
          userIdActual,
          {
            name,
            email,
            username: dto.cuenta.username,
            role: dto.cuenta.role,
            active: persona.estado,
            // Sin contraseña nueva se queda con la que tenía: cambiarle el rol a alguien no
            // tiene por qué obligar a resetearle la clave.
            ...(dto.cuenta.password ? { password: dto.cuenta.password } : {}),
          },
          tx,
        );
        return undefined;
      }

      if (!dto.cuenta.password) {
        throw new BadRequestException('Ingresa una contraseña para la cuenta de acceso');
      }
      const creada = await this.users.create(
        {
          name,
          email,
          username: dto.cuenta.username,
          password: dto.cuenta.password,
          role: dto.cuenta.role,
          active: persona.estado,
        },
        tx,
      );
      return creada.id;
    }

    if (dto.userId !== undefined) {
      const userId = dto.userId.trim();
      if (!userId) return null;
      const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!user) throw new NotFoundException('La cuenta de acceso no existe');
      return user.id;
    }

    if (dto.estado !== undefined && userIdActual) {
      await this.users.update(userIdActual, { active: dto.estado }, tx);
    }
    return undefined;
  }

  /**
   * Unidad del trabajador. Sin valor explícito cae a la Principal, que es lo que corresponde
   * al alta de toda la vida: solo quien está armando un puesto satélite elige otra.
   */
  private async resolverUnidad(unidadNegocioId?: string): Promise<bigint> {
    const solicitada = unidadNegocioId?.toString().trim();
    if (!solicitada) return unidadPrincipalId(this.prisma);
    let id: bigint;
    try {
      id = BigInt(solicitada);
    } catch {
      throw new BadRequestException('La unidad de negocio seleccionada no es válida');
    }
    const unidad = await this.prisma.unidadNegocio.findFirst({
      where: { id, estado: true },
      select: { id: true },
    });
    if (!unidad) {
      throw new BadRequestException('La unidad de negocio seleccionada no existe o está inactiva');
    }
    return unidad.id;
  }

  private async find(id: string) {
    let trabajadorId: bigint;
    try {
      trabajadorId = BigInt(id);
    } catch {
      throw new NotFoundException('Trabajador no encontrado');
    }
    const row = await this.prisma.trabajador.findUnique({
      where: { id: trabajadorId },
      include: CON_CUENTA,
    });
    if (!row) throw new NotFoundException('Trabajador no encontrado');
    return row;
  }

  // La unidad se resuelve aparte (`resolverUnidad`) y se agrega en el `create`, porque no
  // sale del DTO tal cual: sin valor explícito cae a la Principal.
  private createData(
    dto: CreateTrabajadorDto,
  ): Omit<Prisma.TrabajadorUncheckedCreateInput, 'unidadNegocioId'> {
    return {
      tipoDocumento: dto.tipoDocumento.trim(),
      numeroDocumento: dto.numeroDocumento.trim(),
      nombres: dto.nombres.trim(),
      apellidos: dto.apellidos.trim(),
      telefono: this.optional(dto.telefono),
      correo: this.optional(dto.correo)?.toLowerCase() ?? null,
      cargo: dto.cargo,
    };
  }

  private updateData(dto: UpdateTrabajadorDto): Prisma.TrabajadorUncheckedUpdateInput {
    return {
      ...(dto.tipoDocumento !== undefined ? { tipoDocumento: dto.tipoDocumento.trim() } : {}),
      ...(dto.numeroDocumento !== undefined ? { numeroDocumento: dto.numeroDocumento.trim() } : {}),
      ...(dto.nombres !== undefined ? { nombres: dto.nombres.trim() } : {}),
      ...(dto.apellidos !== undefined ? { apellidos: dto.apellidos.trim() } : {}),
      ...(dto.telefono !== undefined ? { telefono: this.optional(dto.telefono) } : {}),
      ...(dto.correo !== undefined
        ? { correo: this.optional(dto.correo)?.toLowerCase() ?? null }
        : {}),
      ...(dto.cargo !== undefined ? { cargo: dto.cargo } : {}),
      ...(dto.estado !== undefined ? { estado: dto.estado } : {}),
    };
  }

  private optional(value: string | undefined) {
    return value === undefined ? undefined : value.trim() || null;
  }

  private view(row: TrabajadorConCuenta) {
    return {
      id: row.id.toString(),
      tipoDocumento: row.tipoDocumento,
      numeroDocumento: row.numeroDocumento,
      nombres: row.nombres,
      apellidos: row.apellidos,
      telefono: row.telefono ?? '',
      correo: row.correo ?? '',
      cargo: row.cargo,
      estado: row.estado,
      unidadNegocioId: row.unidadNegocioId.toString(),
      unidad: row.unidadNegocio?.nombre ?? null,
      userId: row.userId,
      usuario: row.user
        ? {
            id: row.user.id,
            name: row.user.name,
            username: row.user.username,
            email: row.user.email,
            role: row.user.role.clave,
            // El nombre visible viaja junto a la clave: la tabla de trabajadores lo muestra
            // tal cual, y con roles creados desde el panel ya no hay una lista de etiquetas
            // en el front de la que sacarlo.
            rolNombre: row.user.role.nombre,
            active: row.user.active,
          }
        : null,
    };
  }

  private handlePrismaError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      // `Trabajador` tiene dos columnas únicas: el documento y la cuenta vinculada.
      const campos = (error.meta?.target as string[] | undefined) ?? [];
      if (campos.some((campo) => campo.includes('user_id') || campo.includes('userId'))) {
        throw new ConflictException('Esa cuenta ya está vinculada a otro trabajador');
      }
      throw new ConflictException('Ya existe un trabajador con ese número de documento');
    }
    throw error;
  }
}
