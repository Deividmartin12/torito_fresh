'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import {
  createOwnPaymentMethod,
  createPaymentMethod,
  getOwnPaymentMethodCategories,
  getPaymentMethodCategories,
  PaymentMethod,
  PaymentMethodCategory,
  updatePaymentMethod,
} from '../lib/payment-methods';
import { soloTextoNombre } from '../lib/validacion';
import { PaymentMethodCategoryFormModal } from './PaymentMethodCategoryFormModal';
import { SearchableSelect } from './SearchableSelect';
import { Button } from './ui/Button';
import {
  checkboxFieldClass,
  checkboxInputClass,
  controlClass,
  fieldLabelClass,
  fieldWideClass,
  modalActionsClass,
  modalFormClass,
} from './ui/Field';
import { Modal, ModalHeader } from './ui/Modal';

type Props = {
  editando?: PaymentMethod | null;
  /**
   * `inline` = alta rápida desde los combos de venta/cobro: solo categoría y referencia, el
   * método queda a nombre del propio operador. Sin `inline` es la administración completa
   * (categoría con alta, referencia, etiqueta libre, dueño y estado).
   */
  inline?: boolean;
  trabajadores?: { id: string; nombre: string }[];
  onClose: () => void;
  onSaved: (method: PaymentMethod) => void;
};

/**
 * Alta / edición de método de pago. Un método es una categoría (YAPE) + su referencia (el
 * número) + un dueño opcional. La usan la pantalla de Métodos de pago y, como acción inline
 * "+ Agregar método de pago", los combos del formulario de venta y del modal de cobro.
 */
export function PaymentMethodFormModal({
  editando,
  inline = false,
  trabajadores,
  onClose,
  onSaved,
}: Props) {
  const [categorias, setCategorias] = useState<PaymentMethodCategory[]>([]);
  const [cargandoCategorias, setCargandoCategorias] = useState(true);
  const [categoriaModal, setCategoriaModal] = useState(false);
  const [categoriaId, setCategoriaId] = useState(editando?.categoriaId ?? '');
  const [referencia, setReferencia] = useState(editando?.referencia ?? '');
  const [nombreLibre, setNombreLibre] = useState(editando?.nombreLibre ?? '');
  const [trabajadorId, setTrabajadorId] = useState(editando?.trabajadorId ?? '');
  const [estado, setEstado] = useState(editando?.estado ?? true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (inline ? getOwnPaymentMethodCategories() : getPaymentMethodCategories())
      .then((rows) => setCategorias(rows.filter((row) => row.estado)))
      .catch((cause) =>
        toast.error(
          cause instanceof Error ? cause.message : 'No se pudieron cargar las categorías',
        ),
      )
      .finally(() => setCargandoCategorias(false));
  }, [inline]);

  const categoria = useMemo(
    () => categorias.find((item) => item.id === categoriaId) ?? null,
    [categorias, categoriaId],
  );
  const exigeReferencia = categoria?.requiereReferencia ?? false;

  async function guardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!categoriaId) {
      toast.error('Selecciona la categoría del método de pago.');
      return;
    }
    if (exigeReferencia && !referencia.trim()) {
      toast.error(`Ingresa la referencia de ${categoria?.nombre ?? 'este método'}.`);
      return;
    }
    setSaving(true);
    try {
      let saved: PaymentMethod;
      if (inline) {
        saved = await createOwnPaymentMethod({
          categoriaId,
          referencia: referencia.trim() || undefined,
        });
      } else {
        const payload = {
          categoriaId,
          referencia: referencia.trim() || undefined,
          nombre: nombreLibre.trim() || undefined,
          trabajadorId: trabajadorId || undefined,
          estado,
        };
        saved = editando
          ? await updatePaymentMethod(editando.id, payload)
          : await createPaymentMethod(payload);
      }
      toast.success(editando ? 'Método de pago actualizado.' : 'Método de pago registrado.');
      onSaved(saved);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'No se pudo guardar el método de pago');
    } finally {
      setSaving(false);
    }
  }

  function handleCategoriaCreada(nueva: PaymentMethodCategory) {
    setCategorias((current) =>
      current.some((item) => item.id === nueva.id)
        ? current
        : [...current, nueva].sort((a, b) => a.nombre.localeCompare(b.nombre)),
    );
    setCategoriaId(nueva.id);
    setCategoriaModal(false);
  }

  if (typeof document === 'undefined') return null;

  const titulo = editando ? 'Editar método de pago' : 'Agregar método de pago';

  return createPortal(
    <Modal onClose={onClose} closeDisabled={saving}>
      <ModalHeader title={titulo} onClose={onClose} closeDisabled={saving} />
      <form className={modalFormClass} onSubmit={(event) => void guardar(event)}>
        <label className={fieldWideClass}>
          <span className={fieldLabelClass}>Categoría</span>
          <SearchableSelect
            value={categoriaId}
            onChange={setCategoriaId}
            options={categorias.map((item) => ({ value: item.id, label: item.nombre }))}
            placeholder={cargandoCategorias ? 'Cargando categorías...' : 'Seleccionar categoría'}
            disabled={cargandoCategorias}
            required
            actionLabel={inline ? undefined : '+ Agregar categoría'}
            onAction={inline ? undefined : () => setCategoriaModal(true)}
          />
        </label>

        <label className={fieldWideClass}>
          <span className={fieldLabelClass}>Referencia {exigeReferencia ? '' : '(opcional)'}</span>
          <input
            className={controlClass}
            value={referencia}
            maxLength={50}
            onChange={(event) => setReferencia(event.target.value)}
            placeholder="Número de Yape/Plin o cuenta bancaria"
            required={exigeReferencia}
          />
        </label>

        {!inline ? (
          <label className={fieldWideClass}>
            <span className={fieldLabelClass}>Etiqueta (opcional)</span>
            <input
              className={controlClass}
              value={nombreLibre}
              maxLength={50}
              onChange={(event) => setNombreLibre(soloTextoNombre(event.target.value))}
              placeholder='Ej. "Yape del negocio"'
            />
          </label>
        ) : null}

        {!inline && trabajadores && trabajadores.length ? (
          <label className={fieldWideClass}>
            <span className={fieldLabelClass}>Dueño</span>
            <SearchableSelect
              value={trabajadorId}
              onChange={setTrabajadorId}
              options={trabajadores.map((item) => ({ value: item.id, label: item.nombre }))}
              placeholder="Disponible para todos"
            />
          </label>
        ) : null}

        {!inline && editando ? (
          <label className={`${checkboxFieldClass} ${fieldWideClass}`}>
            <input
              className={checkboxInputClass}
              type="checkbox"
              checked={estado}
              onChange={(event) => setEstado(event.target.checked)}
            />
            <span className="text-[13px] font-medium">Método activo</span>
          </label>
        ) : null}

        <div className={modalActionsClass}>
          <Button variant="secondary" type="button" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button disabled={saving || cargandoCategorias}>
            {saving ? 'Guardando...' : editando ? 'Guardar cambios' : 'Registrar método'}
          </Button>
        </div>
      </form>

      {categoriaModal ? (
        <PaymentMethodCategoryFormModal
          onClose={() => setCategoriaModal(false)}
          onSaved={handleCategoriaCreada}
        />
      ) : null}
    </Modal>,
    document.body,
  );
}
