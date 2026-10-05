# Método de pago predeterminado

En **Ventas → Registrar una venta** o **Venta rápida**, pulsa **Ajustes de venta**, elige el
método y pulsa **Guardar ajuste**. Cada usuario guarda su propia elección; se conserva al
volver a iniciar sesión y al entrar desde otro dispositivo. Solo se ofrecen métodos activos
compartidos o asignados al trabajador de esa cuenta.

La venta rápida recupera el método predeterminado después de registrar una venta. Cambiar el
método del cobro para una venta concreta no modifica la preferencia. La edición de ventas
conserva sus métodos originales y los pagos múltiples no se reemplazan al guardar el ajuste.

**Sin método predeterminado** elimina la preferencia personal. Se mantiene el comportamiento
anterior de cada formulario: la venta completa selecciona el primer método disponible y la
venta rápida pide elegirlo. Los métodos desactivados, eliminados o reasignados a otra persona
no se usan como predeterminados.

La API usa `GET` y `PUT /operations/sale-preferences`, con el permiso `ventas.registrar`.
El cuerpo de `PUT` es `{ "metodoPagoId": "123" }` o `{ "metodoPagoId": null }` para quitarlo.
No permite modificar la preferencia de otro usuario.

Al desplegar, incluir la migración `20261003160000_metodo_pago_venta_predeterminado` con la
API y la web. Agrega una referencia opcional en usuarios sin asignar métodos automáticamente
ni modificar ventas anteriores. El servicio `migrate` de Docker Compose aplica la migración.

Verificación de persistencia, disponibilidad, permisos y validación en PostgreSQL local:

```bash
npm run build --workspace @torito/api
node apps/api/test/sale-preferences.integration.cjs
```
