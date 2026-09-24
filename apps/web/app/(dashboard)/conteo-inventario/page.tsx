import { CountSheet } from '../../../components/conteo/CountSheet';

export default function ConteoInventarioPage() {
  return (
    <div className="module-page operations-list-page">
      <div className="operation-list-head">
        <div>
          <span className="operation-eyebrow">Inventario</span>
          <h1>Conteo y cuadre</h1>
          <p>
            Contá lo que hay de verdad y el sistema corrige el stock, dejando cada diferencia en el
            kardex con su motivo.
          </p>
        </div>
      </div>
      <CountSheet />
    </div>
  );
}
