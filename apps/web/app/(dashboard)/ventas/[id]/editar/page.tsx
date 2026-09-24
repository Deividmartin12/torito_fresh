import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { OperationForm } from '../../../../../components/operations/OperationForm';
import { buttonClass } from '../../../../../components/ui/Button';

export default async function EditarVentaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="module-page standalone-operation-page">
      <div className="operation-page-head">
        <div>
          <span className="operation-eyebrow">Ventas</span>
          <h1>Editar venta</h1>
        </div>
        <Link href="/ventas" className={buttonClass('secondary', '', 'rect')}>
          <ArrowLeft size={16} /> Volver a ventas
        </Link>
      </div>
      <OperationForm saleId={id} />
    </div>
  );
}
