import { redirect } from 'next/navigation';

/** La gestión de cuentas por cobrar vive ahora en "Cobranzas". */
export default function CuentasCobrarPage() {
  redirect('/cobranzas');
}
