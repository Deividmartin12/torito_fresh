import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { OperationForm } from '../../../../components/operations/OperationForm';

export default function NuevaVentaPage() {
  return (
    <div className="module-page standalone-operation-page">
      <div className="operation-page-head">
        <div>
          <h1>Nueva venta</h1>
        </div>
        <Link href="/ventas" className="btn-secondary">
          <ArrowLeft size={16} /> Volver a ventas
        </Link>
      </div>
      <OperationForm />
    </div>
  );
}
