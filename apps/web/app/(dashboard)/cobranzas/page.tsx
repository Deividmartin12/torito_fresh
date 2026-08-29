import { Suspense } from 'react';
import { AccountsTablePage } from '../../../components/AccountsTablePage';

export default function CobranzasPage() {
  return (
    <Suspense fallback={null}>
      <AccountsTablePage tipo="cobrar" />
    </Suspense>
  );
}
