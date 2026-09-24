import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { OperationForm } from '../../../../components/operations/OperationForm';
import { buttonClass } from '../../../../components/ui/Button';

export default function NuevaVentaPage() {
  return (
    <div className="module-page standalone-operation-page">
      <div className="operation-page-head">
        <div>
          <h1>Nueva venta</h1>
        </div>
        <Link href="/ventas" className={buttonClass('secondary', '', 'rect')}>
          <ArrowLeft size={16} /> Volver a ventas
        </Link>
      </div>
      <OperationForm />
    </div>
  );
}
