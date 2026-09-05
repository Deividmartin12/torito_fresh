import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');
  // Desde qué dirección se puede abrir la web. Si la abres desde otra PC de la red, pon esa
  // dirección en WEB_ORIGIN (en el .env), separando por comas si hay más de una.
  const origenesWeb = (config.get<string>('WEB_ORIGIN') ?? 'http://localhost:3070')
    .split(',')
    .map((origen) => origen.trim())
    .filter(Boolean);
  app.enableCors({ origin: origenesWeb });
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
