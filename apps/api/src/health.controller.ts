import { Controller, Get } from '@nestjs/common';
import { Public } from './auth/public.decorator';
import { PrismaService } from './prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async check() {
    // Además de confirmar que Nest responde, verifica que la conexión necesaria a PostgreSQL
    // siga disponible. Si falla, Nest responde 500 y Docker marca el contenedor como unhealthy.
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok' };
  }
}
