import { IsBoolean, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { RE_RUC } from '../common/validacion';
import { EsCelular, EsEmailOpcional, EsNombreLibre } from '../common/validators';

export class CreateProveedorDto {
  @IsString()
  @Matches(RE_RUC, { message: 'El RUC debe contener exactamente 11 digitos' })
  ruc: string;

  @EsNombreLibre(150)
  razonSocial: string;

  @IsOptional()
  @EsNombreLibre(150)
  nombreComercial?: string;

  @EsCelular({ opcional: true })
  telefono?: string;

  @EsEmailOpcional(150)
  correo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  direccion?: string;
}

export class UpdateProveedorDto {
  @IsOptional()
  @IsString()
  @Matches(RE_RUC, { message: 'El RUC debe contener exactamente 11 digitos' })
  ruc?: string;

  @IsOptional()
  @EsNombreLibre(150)
  razonSocial?: string;

  @IsOptional()
  @EsNombreLibre(150)
  nombreComercial?: string;

  @EsCelular({ opcional: true })
  telefono?: string;

  @EsEmailOpcional(150)
  correo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  direccion?: string;

  @IsOptional()
  @IsBoolean()
  estado?: boolean;
}
