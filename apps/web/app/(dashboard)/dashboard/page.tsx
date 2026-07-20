import { Boxes, ShoppingCart, Truck, Users } from "lucide-react";
import Link from "next/link";

export default function DashboardPage() {
  return <div className="module-page">
    <div className="module-head"><div className="module-title"><h1>Resumen</h1><span>Hoy, 12 de julio</span></div></div>
    <div className="summary-row">
      <div className="summary-glass"><span>Ventas de hoy</span><strong>S/ 1,248</strong></div>
      <div className="summary-glass"><span>Stock disponible</span><strong>328</strong></div>
      <div className="summary-glass"><span>Por cobrar</span><strong>S/ 540</strong></div>
      <div className="summary-glass"><span>Stock bajo</span><strong>4</strong></div>
    </div>
    <div className="module-tools"><Link href="/ventas" className="btn-primary"><ShoppingCart size={16} /> Nueva venta</Link><Link href="/compras" className="btn-secondary"><Truck size={16} /> Nueva compra</Link><Link href="/clientes" className="btn-secondary"><Users size={16} /> Clientes</Link><Link href="/inventario" className="btn-secondary"><Boxes size={16} /> Stock</Link></div>
    <div className="glass-table"><table><thead><tr><th>Hora</th><th>Operacion</th><th>Referencia</th><th>Descripcion</th><th>Responsable</th><th>Estado</th></tr></thead><tbody>
      <tr><td>10:45</td><td><span className="status status-blue">VENTA</span></td><td><strong>B001-000350</strong></td><td>Venta a Juan Perez</td><td>Rosa Salazar</td><td><span className="status status-green">Confirmada</span></td></tr>
      <tr><td>09:20</td><td><span className="status status-blue">TRANSFERENCIA</span></td><td><strong>MOV-00501</strong></td><td>Almacen principal a Vehiculo 01</td><td>Carlos Medina</td><td><span className="status status-green">Confirmado</span></td></tr>
      <tr><td>08:35</td><td><span className="status status-blue">COMPRA</span></td><td><strong>F001-00120</strong></td><td>Compra a Aguas del Norte</td><td>Rosa Salazar</td><td><span className="status status-amber">Pendiente</span></td></tr>
    </tbody></table></div>
  </div>;
}
