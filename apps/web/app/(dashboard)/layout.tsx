import { AppShell } from '../../components/AppShell';
import { TableEnhancer } from '../../components/TableEnhancer';
import { UnidadProvider } from '../../components/UnidadProvider';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    // La unidad activa envuelve a todo el panel: la barra superior la muestra y cualquier
    // pantalla puede leerla, en vez de que cada una la pida por su cuenta.
    <UnidadProvider>
      <AppShell>
        <TableEnhancer />
        {children}
      </AppShell>
    </UnidadProvider>
  );
}
