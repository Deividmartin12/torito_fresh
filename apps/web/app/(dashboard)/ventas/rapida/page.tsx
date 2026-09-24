import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { QuickSaleForm } from '../../../../components/operations/QuickSaleForm';
import { buttonClass } from '../../../../components/ui/Button';

export default function VentaRapidaPage() {
  return (
    <div className="module-page standalone-operation-page">
      <div className="operation-page-head">
        <div>
          <h1>Venta rápida</h1>
        </div>
        <Link href="/ventas" className={buttonClass('secondary', '', 'rect')}>
          <ArrowLeft size={16} /> Volver a ventas
        </Link>
      </div>
      <QuickSaleForm />
    </div>
  );
}
