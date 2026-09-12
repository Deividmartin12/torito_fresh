'use client';

import { X } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { consultarDni, consultarRuc } from '../lib/consulta-documento';
import { createProveedor, Proveedor, updateProveedor } from '../lib/proveedores';
import {
  RE_RUC,
  soloDigitos,
  soloTextoNombre,
  validarCelular,
  validarEmail,
  validarNombreLibre,
} from '../lib/validacion';

type Props = {
  editando?: Proveedor | null;
  onClose: () => void;
  onSaved: (proveedor: Proveedor) => void;
};

type ProveedorForm = Pick<
  Proveedor,
  'ruc' | 'razonSocial' | 'nombreComercial' | 'telefono' | 'correo' | 'direccion'
>;
type FormErrors = Partial<Record<keyof ProveedorForm, string>>;

const emptyForm: ProveedorForm = {
  ruc: '',
  razonSocial: '',
  nombreComercial: '',
  telefono: '',
  correo: '',
  direccion: '',
};

function formDe(item?: Proveedor | null): ProveedorForm {
  if (!item) return emptyForm;
  return {
    ruc: item.ruc,
    razonSocial: item.razonSocial,
    nombreComercial: item.nombreComercial,
    telefono: item.telefono,
    correo: item.correo,
    direccion: item.direccion,
  };
}

/**
 * Alta / edición de proveedor. La usan la pantalla de Proveedores y, como acción inline
 * "+ Agregar proveedor", el combo de proveedor del formulario de gasto.
 */
export function ProveedorFormModal({ editando, onClose, onSaved }: Props) {
  const [form, setForm] = useState<ProveedorForm>(() => formDe(editando));
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [buscando, setBuscando] = useState(false);

  function updateField(field: keyof ProveedorForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  }

  // Un proveedor puede ser empresa (RUC de 11 dígitos) o persona natural (se busca por su
  // DNI de 8 dígitos y el RUC "10..." se calcula en el API). El botón infiere cuál es por
  // el largo de lo que se tecleó.
  async function buscarDocumento() {
    const numero = form.ruc.trim();
    if (numero.length !== 8 && numero.length !== 11) {
      toast.error('Ingresa un DNI (8 dígitos) o un RUC (11 dígitos).');
      return;
    }
    setBuscando(true);
    try {
      if (numero.length === 8) {
        const persona = await consultarDni(numero);
        setForm((current) => ({
          ...current,
          ruc: persona.rucSugerido,
          razonSocial: soloTextoNombre(persona.nombreCompleto),
        }));
      } else {
        const empresa = await consultarRuc(numero);
        setForm((current) => ({
          ...current,
          razonSocial: soloTextoNombre(empresa.razonSocial),
          direccion: empresa.direccion || current.direccion,
        }));
      }
      setFieldErrors((current) => ({ ...current, ruc: undefined, razonSocial: undefined }));
      toast.success('Datos encontrados.');
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'No se pudo consultar el documento');
    } finally {
      setBuscando(false);
    }
  }

  function validate() {
    const next: FormErrors = {};
    if (!RE_RUC.test(form.ruc.trim())) next.ruc = 'Ingresa un RUC de 11 dígitos.';
    next.razonSocial = validarNombreLibre(form.razonSocial, 'la razón social');
    if (form.nombreComercial.trim())
      next.nombreComercial = validarNombreLibre(form.nombreComercial, 'el nombre comercial');
    next.telefono = validarCelular(form.telefono);
    next.correo = validarEmail(form.correo);
    setFieldErrors(next);
    return Object.values(next).every((mensaje) => !mensaje);
  }

  async function guardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validate()) return;
    setSaving(true);
    const payload = {
      ruc: form.ruc.trim(),
      razonSocial: form.razonSocial.trim(),
      nombreComercial: form.nombreComercial.trim(),
      telefono: form.telefono.trim(),
      correo: form.correo.trim(),
      direccion: form.direccion.trim(),
    };
    try {
      const saved = editando
        ? await updateProveedor(editando.id, payload)
        : await createProveedor(payload);
      toast.success(editando ? 'Proveedor actualizado.' : 'Proveedor registrado.');
      onSaved(saved);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'No se pudo guardar el proveedor');
    } finally {
      setSaving(false);
    }
  }

  if (typeof document === 'undefined') return null;

  const titulo = editando ? 'Editar proveedor' : 'Agregar proveedor';

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <section className="crud-modal" role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="modal-top">
          <h2>{titulo}</h2>
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
            <span>RUC o DNI</span>
            <div className="field-with-action">
              <input
                value={form.ruc}
                onChange={(event) => updateField('ruc', soloDigitos(event.target.value, 11))}
                inputMode="numeric"
                pattern="\d{11}"
                maxLength={11}
                required
                autoFocus
              />
              <button
                type="button"
                className="btn-secondary"
                onClick={() => void buscarDocumento()}
                disabled={
                  buscando || (form.ruc.trim().length !== 8 && form.ruc.trim().length !== 11)
                }
              >
                {buscando ? 'Buscando...' : 'Buscar'}
              </button>
            </div>
            {fieldErrors.ruc ? <small className="field-error">{fieldErrors.ruc}</small> : null}
          </label>
          <label>
            <span>Razon social</span>
            <input
              value={form.razonSocial}
              onChange={(event) => updateField('razonSocial', soloTextoNombre(event.target.value))}
              maxLength={150}
              required
            />
            {fieldErrors.razonSocial ? (
              <small className="field-error">{fieldErrors.razonSocial}</small>
            ) : null}
          </label>
          <label>
            <span>Nombre comercial</span>
            <input
              value={form.nombreComercial}
              onChange={(event) =>
                updateField('nombreComercial', soloTextoNombre(event.target.value))
              }
              maxLength={150}
            />
            {fieldErrors.nombreComercial ? (
              <small className="field-error">{fieldErrors.nombreComercial}</small>
            ) : null}
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
          <label>
            <span>Dirección</span>
            <input
              value={form.direccion}
              onChange={(event) => updateField('direccion', event.target.value)}
              maxLength={250}
            />
          </label>
          <div className="modal-actions">
            <button className="btn-secondary" type="button" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button className="btn-primary" disabled={saving}>
              {saving ? 'Guardando...' : editando ? 'Guardar cambios' : 'Registrar proveedor'}
            </button>
          </div>
        </form>
      </section>
    </div>,
    document.body,
  );
}
