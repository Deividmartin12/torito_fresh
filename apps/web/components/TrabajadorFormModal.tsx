'use client';

import { X } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import {
  CARGOS_TRABAJADOR,
  CreateTrabajadorPayload,
  createTrabajador,
  Trabajador,
} from '../lib/trabajadores';
import {
  soloAlfanumerico,
  soloDigitos,
  soloLetras,
  validarCelular,
  validarDocumento,
  validarEmail,
  validarNombrePersona,
} from '../lib/validacion';

type Props = {
  onClose: () => void;
  onSaved: (trabajador: Trabajador) => void;
};

type FormErrors = Partial<Record<keyof CreateTrabajadorPayload, string>>;

const emptyForm: CreateTrabajadorPayload = {
  tipoDocumento: 'DNI',
  numeroDocumento: '',
  nombres: '',
  apellidos: '',
  telefono: '',
  correo: '',
  cargo: 'Vendedor',
};

/**
 * Alta rápida de trabajador. La usa la acción inline "+ Agregar trabajador" del combo de
 * beneficiario en el formulario de gasto, para no tener que salir a Configuración a mitad
 * de registrar un pago. La edición sigue viviendo en la pantalla de Trabajadores.
 */
export function TrabajadorFormModal({ onClose, onSaved }: Props) {
  const [form, setForm] = useState<CreateTrabajadorPayload>(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);

  function updateField(field: keyof CreateTrabajadorPayload, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  }

  function validate() {
    const next: FormErrors = {};
    next.numeroDocumento = validarDocumento(form.tipoDocumento, form.numeroDocumento, {
      requerido: true,
    });
    next.nombres = validarNombrePersona(form.nombres, 'nombres');
    next.apellidos = validarNombrePersona(form.apellidos, 'apellidos');
    next.telefono = validarCelular(form.telefono);
    next.correo = validarEmail(form.correo);
    setFieldErrors(next);
    return Object.values(next).every((mensaje) => !mensaje);
  }

  async function guardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const saved = await createTrabajador({
        tipoDocumento: form.tipoDocumento,
        numeroDocumento: form.numeroDocumento.trim(),
        nombres: form.nombres.trim(),
        apellidos: form.apellidos.trim(),
        telefono: form.telefono.trim(),
        correo: form.correo.trim(),
        cargo: form.cargo,
      });
      toast.success('Trabajador registrado.');
      onSaved(saved);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'No se pudo guardar el trabajador');
    } finally {
      setSaving(false);
    }
  }

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <section
        className="crud-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Agregar trabajador"
      >
        <div className="modal-top">
          <h2>Agregar trabajador</h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Cerrar modal"
            disabled={saving}
          >
            <X size={18} />
          </button>
        </div>
        <form className="modal-form" onSubmit={(event) => void guardar(event)} noValidate>
          <label>
            <span>Tipo de documento</span>
            <select
              value={form.tipoDocumento}
              onChange={(event) => updateField('tipoDocumento', event.target.value)}
            >
              <option value="DNI">DNI</option>
              <option value="CE">Carné de extranjería</option>
            </select>
          </label>
          <label>
            <span>Número de documento</span>
            <input
              value={form.numeroDocumento}
              onChange={(event) =>
                updateField(
                  'numeroDocumento',
                  form.tipoDocumento === 'DNI'
                    ? soloDigitos(event.target.value, 8)
                    : soloAlfanumerico(event.target.value, 15),
                )
              }
              inputMode={form.tipoDocumento === 'DNI' ? 'numeric' : 'text'}
              required
              autoFocus
            />
            {fieldErrors.numeroDocumento ? (
              <small className="field-error">{fieldErrors.numeroDocumento}</small>
            ) : null}
          </label>
          <label>
            <span>Nombres</span>
            <input
              value={form.nombres}
              onChange={(event) => updateField('nombres', soloLetras(event.target.value))}
              maxLength={100}
              required
            />
            {fieldErrors.nombres ? (
              <small className="field-error">{fieldErrors.nombres}</small>
            ) : null}
          </label>
          <label>
            <span>Apellidos</span>
            <input
              value={form.apellidos}
              onChange={(event) => updateField('apellidos', soloLetras(event.target.value))}
              maxLength={100}
              required
            />
            {fieldErrors.apellidos ? (
              <small className="field-error">{fieldErrors.apellidos}</small>
            ) : null}
          </label>
          <label>
            <span>Cargo</span>
            <select
              value={form.cargo}
              onChange={(event) => updateField('cargo', event.target.value)}
            >
              {CARGOS_TRABAJADOR.map((cargo) => (
                <option key={cargo} value={cargo}>
                  {cargo}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Teléfono</span>
            <input
              value={form.telefono}
              onChange={(event) => updateField('telefono', soloDigitos(event.target.value, 9))}
              inputMode="numeric"
              maxLength={9}
            />
            {fieldErrors.telefono ? (
              <small className="field-error">{fieldErrors.telefono}</small>
            ) : null}
          </label>
          <label>
            <span>Correo</span>
            <input
              type="email"
              value={form.correo}
              onChange={(event) => updateField('correo', event.target.value)}
              maxLength={150}
            />
            {fieldErrors.correo ? (
              <small className="field-error">{fieldErrors.correo}</small>
            ) : null}
          </label>
          <div className="modal-actions">
            <button className="btn-secondary" type="button" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button className="btn-primary" disabled={saving}>
              {saving ? 'Guardando...' : 'Registrar trabajador'}
            </button>
          </div>
        </form>
      </section>
    </div>,
    document.body,
  );
}
