import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CATALOGO_PERMISOS, CLAVES_PERMISOS, expandirPermisos } from '../auth/permisos';
import { AuthUser } from '../common/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoleDto, UpdateRoleDto } from './roles.dto';

/**
 * Los roles del sistema y lo que puede hacer cada uno.
 *
 * Además de un ABM, este servicio es el que impide dejar la app sin administrador. Un rol es
 * lo único que decide qué ve cada persona, así que un error acá no se arregla desde la app:
 * si el último rol que podía entrar a esta pantalla se queda sin el permiso, ya no hay forma
 * de devolvérselo sin meter mano en la base.
 */
@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  /** El catálogo completo, para dibujar las casillas del panel. */
  catalogo() {
    return CATALOGO_PERMISOS;
  }

  async list() {
    const roles = await this.prisma.role.findMany({
      orderBy: [{ sistema: 'desc' }, { nombre: 'asc' }],
      include: {
        permisos: { select: { clave: true } },
        users: {
          select: {
            active: true,
            trabajador: {
              select: { estado: true, unidadNegocio: { select: { id: true, nombre: true } } },
            },
          },
        },
      },
    });
    return roles.map((rol) => this.view(rol));
  }

  async get(id: string) {
    const rol = await this.prisma.role.findUnique({
      where: { id },
      include: {
        permisos: { select: { clave: true } },
        users: {
          select: {
            active: true,
            trabajador: {
              select: { estado: true, unidadNegocio: { select: { id: true, nombre: true } } },
            },
          },
        },
      },
    });
    if (!rol) throw new NotFoundException('El rol no existe');
    return this.view(rol);
  }

  async create(dto: CreateRoleDto) {
    const nombre = dto.nombre.trim();
    const clave = await this.claveLibre(nombre);
    try {
      const creado = await this.prisma.role.create({
        data: {
          clave,
          nombre,
          descripcion: dto.descripcion?.trim() || null,
          estado: dto.estado ?? true,
          // Un rol creado desde el panel nunca es del sistema ni tiene acceso total: los dos
          // son propiedades que solo se ganan por migración, no pidiéndolas en un formulario.
          sistema: false,
          accesoTotal: false,
          permisos: { create: this.permisosLimpios(dto.permisos).map((clave) => ({ clave })) },
        },
      });
      return this.get(creado.id);
    } catch (error) {
      throw this.traducirError(error);
    }
  }

  async update(id: string, dto: UpdateRoleDto, actor: AuthUser) {
    const rol = await this.prisma.role.findUnique({
      where: { id },
      include: { permisos: { select: { clave: true } }, _count: { select: { users: true } } },
    });
    if (!rol) throw new NotFoundException('El rol no existe');

    const permisos = dto.permisos ? this.permisosLimpios(dto.permisos) : null;

    // No se puede quedar sin salida: si este es el rol con el que estás entrando, no puedes
    // quitarte el permiso de administrar roles ni desactivártelo. El aviso llega antes de
    // guardar, cuando todavía se puede volver atrás.
    const esElPropio = rol.clave === actor.role;
    if (esElPropio && dto.estado === false) {
      throw new BadRequestException(
        'No puedes desactivar el rol con el que estás trabajando. Pide a otro administrador que lo haga.',
      );
    }
    if (esElPropio && !rol.accesoTotal && permisos && !permisos.includes('roles.administrar')) {
      throw new BadRequestException(
        'No puedes quitarte a ti mismo el permiso de administrar roles: después no habría forma de devolvértelo desde la app.',
      );
    }

    if (dto.estado === false) await this.exigirOtroAdministrador(rol.id);

    const data: Prisma.RoleUpdateInput = {};
    if (dto.nombre !== undefined) data.nombre = dto.nombre.trim();
    if (dto.descripcion !== undefined) data.descripcion = dto.descripcion.trim() || null;
    if (dto.estado !== undefined) data.estado = dto.estado;

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.role.update({ where: { id }, data });
        // Los permisos se reemplazan enteros en vez de comparar uno por uno: el formulario
        // manda la lista completa, así que un borrar y volver a insertar deja exactamente lo
        // que se ve en pantalla, sin diferencias raras si dos personas guardan a la vez.
        //
        // Un rol con acceso total no lleva filas: su lista es el catálogo entero y guardar
        // una copia solo conseguiría que se desactualice cuando se agregue un permiso nuevo.
        if (permisos && !rol.accesoTotal) {
          await tx.rolPermiso.deleteMany({ where: { roleId: id } });
          await tx.rolPermiso.createMany({
            data: permisos.map((clave) => ({ roleId: id, clave })),
          });
        }
      });
    } catch (error) {
      throw this.traducirError(error);
    }
    return this.get(id);
  }

  async remove(id: string, actor: AuthUser) {
    const rol = await this.prisma.role.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });
    if (!rol) throw new NotFoundException('El rol no existe');

    if (rol.sistema) {
      throw new BadRequestException(
        `"${rol.nombre}" es un rol del sistema y no se puede eliminar. Si no lo usas, desactívalo.`,
      );
    }
    if (rol.clave === actor.role) {
      throw new BadRequestException('No puedes eliminar el rol con el que estás trabajando');
    }
    if (rol._count.users > 0) {
      const personas = rol._count.users === 1 ? '1 persona' : `${rol._count.users} personas`;
      throw new BadRequestException(
        `No se puede eliminar: ${personas} entra${rol._count.users === 1 ? '' : 'n'} con este rol. Cámbiales el rol primero.`,
      );
    }

    await this.prisma.role.delete({ where: { id } });
    return { message: 'Rol eliminado' };
  }

  /**
   * Falla si al desactivar este rol nadie más podría administrar roles.
   *
   * Es la red de seguridad: sin esto, desactivar el rol del único administrador deja la app
   * sin nadie que pueda volver a activarlo, y la única salida sería un UPDATE a mano.
   */
  private async exigirOtroAdministrador(idExcluido: string) {
    const otros = await this.prisma.role.count({
      where: {
        id: { not: idExcluido },
        estado: true,
        users: { some: { active: true } },
        OR: [{ accesoTotal: true }, { permisos: { some: { clave: 'roles.administrar' } } }],
      },
    });
    if (otros === 0) {
      throw new BadRequestException(
        'Es el único rol activo que puede administrar roles. Dale ese permiso a otro rol antes de desactivar este.',
      );
    }
  }

  /**
   * Quita duplicados y claves que ya no existen, y agrega los permisos que los marcados
   * arrastran (ver `implica` en el catálogo), en el orden del catálogo.
   *
   * La expansión se guarda, no se calcula al leer: así las casillas de la pantalla muestran
   * exactamente lo que el rol tiene. Un permiso que estuviera activo sin aparecer marcado
   * sería peor que el problema que vino a resolver.
   */
  private permisosLimpios(permisos: string[]) {
    return expandirPermisos(permisos);
  }

  /**
   * Clave a partir del nombre: "Jefe de planta" → "JEFE_DE_PLANTA".
   *
   * No cambia al renombrar el rol, así que conviene que sea única desde el principio; si ya
   * existe se le agrega un número. Es lo que se guarda en el token y en `AuthUser.role`.
   */
  private async claveLibre(nombre: string) {
    const base =
      nombre
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 36) || 'ROL';
    const parecidas = await this.prisma.role.findMany({
      where: { clave: { startsWith: base } },
      select: { clave: true },
    });
    const tomadas = new Set(parecidas.map((fila) => fila.clave));
    if (!tomadas.has(base)) return base;
    for (let sufijo = 2; sufijo < 100; sufijo += 1) {
      const candidata = `${base}_${sufijo}`;
      if (!tomadas.has(candidata)) return candidata;
    }
    throw new ConflictException('Ya hay demasiados roles con un nombre parecido');
  }

  private traducirError(error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return new ConflictException('Ya existe un rol con ese nombre');
    }
    return error;
  }

  private view(rol: {
    id: string;
    clave: string;
    nombre: string;
    descripcion: string | null;
    sistema: boolean;
    accesoTotal: boolean;
    estado: boolean;
    permisos: { clave: string }[];
    users: {
      active: boolean;
      trabajador: { estado: boolean; unidadNegocio: { id: bigint; nombre: string } } | null;
    }[];
  }) {
    // Las unidades donde hay gente con este rol. Es lo que responde "¿a qué unidad de negocio
    // pertenece?" sin inventar que un rol sea de una unidad: el rol es del sistema entero y
    // son las personas las que están en un puesto u otro.
    const unidades = new Map<string, string>();
    for (const usuario of rol.users) {
      const unidad = usuario.trabajador?.unidadNegocio;
      if (unidad) unidades.set(unidad.id.toString(), unidad.nombre);
    }

    return {
      id: rol.id,
      clave: rol.clave,
      nombre: rol.nombre,
      descripcion: rol.descripcion,
      sistema: rol.sistema,
      accesoTotal: rol.accesoTotal,
      estado: rol.estado,
      // Con acceso total la lista es el catálogo entero, igual que lo que ejerce de verdad.
      permisos: rol.accesoTotal ? [...CLAVES_PERMISOS] : rol.permisos.map((fila) => fila.clave),
      usuarios: rol.users.length,
      usuariosActivos: rol.users.filter((usuario) => usuario.active).length,
      unidades: [...unidades.entries()]
        .map(([id, nombre]) => ({ id, nombre }))
        .sort((izquierda, derecha) => izquierda.nombre.localeCompare(derecha.nombre, 'es')),
    };
  }
}
