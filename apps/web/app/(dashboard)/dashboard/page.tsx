'use client';

import { useRole } from '../../../lib/useCurrentUser';
import { AdminDashboard } from './AdminDashboard';
import { DeliveryDashboard } from './DeliveryDashboard';

export default function DashboardPage() {
  const role = useRole();

  if (role === null) {
    return (
      <div className="dashboard-loading" role="status">
        <span className="loading-spinner" /> Cargando...
      </div>
    );
  }

  return role === 'DELIVERY' ? <DeliveryDashboard /> : <AdminDashboard />;
}
