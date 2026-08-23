import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { AuthModule } from "./auth/auth.module";
import { JwtAuthGuard } from "./auth/jwt-auth.guard";
import { RolesGuard } from "./auth/roles.guard";
import { ClientsModule } from "./clients/clients.module";
import { ContainersModule } from "./containers/containers.module";
import { DeliveriesModule } from "./deliveries/deliveries.module";
import { ExpensesModule } from "./expenses/expenses.module";
import { InventoryModule } from "./inventory/inventory.module";
import { OperationsModule } from "./operations/operations.module";
import { PaymentMethodsModule } from "./payment-methods/payment-methods.module";
import { PaymentsModule } from "./payments/payments.module";
import { PrismaModule } from "./prisma/prisma.module";
import { ProductosModule } from "./productos/productos.module";
import { ProductionModule } from "./production/production.module";
import { ProveedoresModule } from "./proveedores/proveedores.module";
import { ReportsModule } from "./reports/reports.module";
import { SalesModule } from "./sales/sales.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ["../../.env", ".env"] }),
    PrismaModule,
    AuthModule,
    UsersModule,
    ClientsModule,
    ProductosModule,
    ProductionModule,
    ProveedoresModule,
    OperationsModule,
    PaymentMethodsModule,
    DeliveriesModule,
    ExpensesModule,
    SalesModule,
    PaymentsModule,
    ContainersModule,
    InventoryModule,
    ReportsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
