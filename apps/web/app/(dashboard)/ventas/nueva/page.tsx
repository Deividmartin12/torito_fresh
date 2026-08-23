import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { OperationForm } from "../../../../components/operations/OperationForm";

export default function NuevaVentaPage() {
  return <div className="module-page standalone-operation-page">
    <div className="operation-page-head"><div><span className="operation-eyebrow">Ventas</span><h1>Nueva venta</h1><p>Registra los productos y la salida de inventario.</p></div><Link href="/ventas" className="btn-secondary"><ArrowLeft size={16} /> Volver a ventas</Link></div>
    <OperationForm kind="sale" />
  </div>;
}
