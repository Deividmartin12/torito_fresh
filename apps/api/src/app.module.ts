import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';
import { ClientsModule } from './clients/clients.module';
import { ContainersModule } from './containers/containers.module';
import { ExpensesModule } from './expenses/expenses.module';
import { OperationsModule } from './operations/operations.module';
import { PaymentMethodsModule } from './payment-methods/payment-methods.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductionModule } from './production/production.module';
import { ProveedoresModule } from './proveedores/proveedores.module';
import { ReportsModule } from './reports/reports.module';
import { TrabajadoresModule } from './trabajadores/trabajadores.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../../.env', '.env'] }),
    PrismaModule,
    AuthModule,
    ClientsModule,
    ProductionModule,
    ProveedoresModule,
    OperationsModule,
    PaymentMethodsModule,
    ExpensesModule,
    ContainersModule,
    ReportsModule,
    TrabajadoresModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
