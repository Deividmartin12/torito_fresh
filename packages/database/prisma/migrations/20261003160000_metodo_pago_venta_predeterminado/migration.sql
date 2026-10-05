-- Preferencia personal: los usuarios existentes siguen sin un método predeterminado.
ALTER TABLE "users" ADD COLUMN "metodo_pago_venta_id" BIGINT;

ALTER TABLE "users" ADD CONSTRAINT "users_metodo_pago_venta_id_fkey"
    FOREIGN KEY ("metodo_pago_venta_id") REFERENCES "metodo_pago"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
