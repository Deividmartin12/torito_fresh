import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');
  const configuredOrigin = config.get<string>('WEB_ORIGIN') ?? 'http://localhost:3070';
  app.enableCors({
    origin: [configuredOrigin, 'http://localhost:3001', 'http://127.0.0.1:3001'],
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  await app.listen(config.get<number>('PORT') ?? 4070);
}

bootstrap();
