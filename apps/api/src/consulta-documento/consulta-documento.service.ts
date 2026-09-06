import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const BASE_URL = 'https://api.decolecta.com/v1';
const TIMEOUT_MS = 10_000;

// Pesos del dígito verificador del RUC (los 10 primeros dígitos, de izquierda a derecha).
const PESOS_RUC = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

type ConsultaDni = {
  tipo: 'DNI';
  numero: string;
  nombreCompleto: string;
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
  // RUC de persona natural que le correspondería a este DNI ("10" + DNI + verificador).
  rucSugerido: string;
};

type ConsultaRuc = {
  tipo: 'RUC';
  numero: string;
  razonSocial: string;
  direccion: string;
  estado: string;
  condicion: string;
};

/**
 * Consulta datos de personas (RENIEC) y empresas (SUNAT) a través de api.decolecta.com.
 * El token vive solo en el API; la web nunca lo ve.
 */
@Injectable()
export class ConsultaDocumentoService {
  private readonly logger = new Logger(ConsultaDocumentoService.name);

  constructor(private readonly config: ConfigService) {}

  async consultarDni(numero: string): Promise<ConsultaDni> {
    if (!/^\d{8}$/.test(numero)) {
      throw new BadRequestException('El DNI debe tener 8 dígitos');
    }
    const data = await this.pedir(`/reniec/dni?numero=${numero}`);
    return {
      tipo: 'DNI',
      numero,
      nombreCompleto: texto(data.full_name),
      nombres: texto(data.first_name),
      apellidoPaterno: texto(data.first_last_name),
      apellidoMaterno: texto(data.second_last_name),
      rucSugerido: rucDePersonaNatural(numero),
    };
  }

  async consultarRuc(numero: string): Promise<ConsultaRuc> {
    if (!/^\d{11}$/.test(numero)) {
      throw new BadRequestException('El RUC debe tener 11 dígitos');
    }
    const data = await this.pedir(`/sunat/ruc?numero=${numero}`);
    return {
      tipo: 'RUC',
      numero,
      razonSocial: texto(data.razon_social),
      direccion: texto(data.direccion),
      estado: texto(data.estado),
      condicion: texto(data.condicion),
    };
  }

  /**
   * Llama a decolecta y traduce cada situación a un error claro en español. Devuelve el
   * cuerpo JSON de la respuesta cuando todo salió bien.
   */
  private async pedir(path: string): Promise<Record<string, unknown>> {
    const token = this.config.get<string>('DECOLECTA_API_TOKEN');
    if (!token || !token.trim()) {
      throw new ServiceUnavailableException('La consulta de documentos no está configurada');
    }

    let response: Response;
    try {
      response = await fetch(`${BASE_URL}${path}`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new ServiceUnavailableException(
        'No se pudo consultar el documento. Revisa la conexión e intenta de nuevo.',
      );
    }

    if (response.ok) {
      return (await response.json()) as Record<string, unknown>;
    }

    if (response.status === 404) {
      throw new NotFoundException('No se encontró información para ese documento');
    }
    if (response.status === 422) {
      throw new BadRequestException('El número de documento no es válido');
    }
    if (response.status === 401 || response.status === 403) {
      this.logger.error(`decolecta rechazó la petición (${response.status}) en ${path}`);
      throw new ServiceUnavailableException(
        'La consulta de documentos no está disponible por ahora',
      );
    }
    this.logger.error(`decolecta respondió ${response.status} en ${path}`);
    throw new ServiceUnavailableException('La consulta de documentos falló. Intenta de nuevo.');
  }
}

function texto(value: unknown): string {
  if (typeof value !== 'string') return '';
  const limpio = value.trim();
  // decolecta usa "-" para campos vacíos (por ejemplo direcciones sin dato).
  return limpio === '-' ? '' : limpio;
}

/** RUC que le corresponde a una persona natural: "10" + DNI + dígito verificador. */
function rucDePersonaNatural(dni: string): string {
  const primeros10 = `10${dni}`;
  const suma = PESOS_RUC.reduce((total, peso, i) => total + peso * Number(primeros10[i]), 0);
  const resto = suma % 11;
  const verificador = (11 - resto) % 10;
  return `${primeros10}${verificador}`;
}
