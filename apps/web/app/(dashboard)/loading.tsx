/**
 * Se ve durante el hueco entre elegir una sección del menú y que esa página monte: cubre el
 * parpadeo en blanco de la transición de ruta, antes de que el propio `useEffect` de cada
 * pantalla tenga su `loading` interno. Reutiliza la misma tarjeta que ya usan los paneles
 * (`AdminDashboard`, `DeliveryDashboard`) para "preparando..." — sin estado ni interactividad,
 * no hace falta 'use client'.
 */
export default function DashboardLoading() {
  return (
    <div className="module-page">
      <div className="dashboard-loading" role="status">
        <span className="loading-spinner" /> Cargando...
      </div>
    </div>
  );
}
