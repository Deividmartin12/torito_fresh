import { AppShell } from "../../components/AppShell";
import { TableEnhancer } from "../../components/TableEnhancer";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <AppShell><TableEnhancer />{children}</AppShell>;
}
