import { Suspense } from 'react';
import { AccountsTablePage } from '../../../components/AccountsTablePage';

export default function CuentasPagarPage() {
  return (
    <Suspense fallback={null}>
      <AccountsTablePage tipo="pagar" />
    </Suspense>
  );
}
