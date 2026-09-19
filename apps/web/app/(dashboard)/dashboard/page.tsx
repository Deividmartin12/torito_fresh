'use client';

import { LayoutDashboard } from 'lucide-react';
import { puede } from '../../../lib/permissions';
import { usePermisos } from '../../../lib/useCurrentUser';
import { AdminDashboard } from './AdminDashboard';
import { DeliveryDashboard } from './DeliveryDashboard';

export default function DashboardPage() {
  const permisos = usePermisos();

  if (permisos === null) {
    return (
      <div className="dashboard-loading" role="status">
        <span className="loading-spinner" /> Cargando...
      </div>
    );
  }

  // Cuál de los dos tableros se muestra lo decide el permiso, no el nombre del rol: cada uno
  // vive de un endpoint distinto (`/reports/business` y `/reports/delivery-summary`) y sin el
  // permiso que le corresponde solo mostraría un error.
  if (puede(permisos, 'reportes.ver')) return <AdminDashboard />;
  if (puede(permisos, 'reportes.reparto')) return <DeliveryDashboard />;

  // Un rol puede no tener ninguno de los dos —por ejemplo uno de planta, que solo produce—, y
  // ahí no hay resumen que mostrar. Antes esto caía igual en el de reparto y lo primero que
  // veía la persona al entrar era un mensaje de permiso denegado sobre una pantalla vacía.
  return (
    <div className="module-page">
      <div className="dashboard-head">
        <div>
          <h1>Bienvenido</h1>
          <span className="operation-eyebrow dashboard-period-label">
            Tu rol no incluye ningún resumen
          </span>
        </div>
      </div>
      <div className="table-empty">
        <LayoutDashboard size={22} />
        <span>
          Elige una sección del menú para empezar. Si esperabas ver los números del negocio acá,
          pídele al administrador el permiso “Ver los reportes del negocio”.
        </span>
      </div>
    </div>
  );
}
