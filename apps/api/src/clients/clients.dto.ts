import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { EsCelular, EsDocumento, EsNombreLibre } from '../common/validators';

const TIPOS_DOCUMENTO = ['DNI', 'RUC', 'CE', 'PAS'] as const;

export class CreateClientDto {
  @EsNombreLibre(150)
  name: string;

  @IsOptional()
  @IsIn(TIPOS_DOCUMENTO, { message: 'Selecciona un tipo de documento válido' })
  documentType?: string;

  @IsOptional()
  @EsDocumento()
  document?: string;

  @EsCelular()
  phone: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  reference?: string;
}

export class UpdateClientDto {
  @IsOptional()
  @EsNombreLibre(150)
  name?: string;

  @IsOptional()
  @IsIn(TIPOS_DOCUMENTO, { message: 'Selecciona un tipo de documento válido' })
  documentType?: string;

  @IsOptional()
  @EsDocumento()
  document?: string;

  @EsCelular({ opcional: true })
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  reference?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
