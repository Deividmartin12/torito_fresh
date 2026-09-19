import { IsArray, IsBoolean, IsOptional, IsString, MaxLength, Matches } from 'class-validator';

export class CreateUnidadNegocioDto {
  @IsString()
  @Matches(/\S/, { message: 'El nombre de la unidad es obligatorio' })
  @MaxLength(100)
  nombre: string;

  /**
   * Si la unidad lleva stock. En `false` es un puesto que solo registra sus ventas y sus
   * gastos: sus ventas no descuentan inventario ni generan kardex. Ausente = `true`, que es
   * como se comportaron siempre todas las unidades.
   */
  @IsOptional()
  @IsBoolean()
  controlaInventario?: boolean;

  /**
   * Crear también su primer almacén. Va marcado por defecto en la UI porque una unidad que
   * lleva stock no puede registrar ni una venta sin él: el descuento no tendría de dónde. En
   * una unidad que no lleva inventario se crea igual, pero como ancla contable de la venta y
   * no como algo que el usuario administre.
   */
  @IsOptional()
  @IsBoolean()
  crearAlmacen?: boolean;
}

/**
 * Qué unidades quiere mirar el usuario (Configuración › Unidades que veo).
 *
 * La lista VACÍA significa "todas", y no es lo mismo que marcarlas una por una: con "todas",
 * una unidad creada después queda incluida sola. Por eso el front manda `[]` cuando el usuario
 * marca la casilla "Todas" en vez de mandar los ids del momento.
 */
export class UnidadesVisiblesDto {
  @IsArray()
  @IsString({ each: true })
  unidades: string[];
}

export class UpdateUnidadNegocioDto {
  @IsOptional()
  @IsString()
  @Matches(/\S/, { message: 'El nombre de la unidad es obligatorio' })
  @MaxLength(100)
  nombre?: string;

  @IsOptional()
  @IsBoolean()
  estado?: boolean;

  // Solo se puede cambiar mientras la unidad no tenga ventas (ver `UnidadesService.update`).
  @IsOptional()
  @IsBoolean()
  controlaInventario?: boolean;
}
