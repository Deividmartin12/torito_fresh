'use client';

import { FormEvent, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { Cliente, createCliente, updateCliente } from '../lib/clients';
import { consultarDni, consultarRuc } from '../lib/consulta-documento';
import { Button } from './ui/Button';
import {
  controlClass,
  fieldErrorClass,
  fieldLabelClass,
  fieldWideClass,
  fieldWithActionClass,
  modalActionsClass,
  modalFormClass,
} from './ui/Field';
import { Modal, ModalHeader } from './ui/Modal';
import {
  soloAlfanumerico,
  soloDigitos,
  soloTextoNombre,
  validarCelular,
  validarDocumento,
  validarNombreLibre,
} from '../lib/validacion';

type Props = {
  editando?: Cliente | null;
  onClose: () => void;
  onSaved: (cliente: Cliente) => void;
};

type CampoConError = 'name' | 'phone' | 'document';
type FormErrors = Partial<Record<CampoConError, string>>;

/**
 * Alta / edición de cliente. La usan la pantalla de Clientes y el formulario de venta.
 * Solo nombre y celular son obligatorios; documento y dirección son opcionales.
 */
export function ClienteFormModal({ editando, onClose, onSaved }: Props) {
  const [form, setForm] = useState({
    name: editando?.name ?? '',
    documentType: editando?.documentType ?? '',
    document: editando?.document ?? '',
    phone: editando?.phone ?? '',
    address: editando?.address ?? '',
    // Texto y no número a propósito: el campo vacío significa "sin límite" y el 0 significa
    // "no se le fía". Con un número no se pueden distinguir esos dos estados.
    creditLimit:
      editando?.creditLimit === null || editando?.creditLimit === undefined
        ? ''
        : String(editando.creditLimit),
  });
  const [errores, setErrores] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [buscando, setBuscando] = useState(false);

  // El botón "Buscar" aplica solo a DNI (8 dígitos) y RUC (11 dígitos).
  const largoDocumento = form.documentType === 'DNI' ? 8 : form.documentType === 'RUC' ? 11 : 0;
  const puedeBuscar = largoDocumento > 0 && form.document.trim().length === largoDocumento;

  /** Limpia el número de documento según el tipo (DNI/RUC solo dígitos; CE alfanumérico). */
  function limpiarDocumento(valor: string, tipo: string) {
    if (tipo === 'DNI') return soloDigitos(valor, 8);
    if (tipo === 'RUC') return soloDigitos(valor, 11);
    if (tipo === 'CE') return soloAlfanumerico(valor, 15);
    return valor.slice(0, 20);
  }

  function actualizar(campo: keyof typeof form, valor: string) {
    setForm((current) => ({ ...current, [campo]: valor }));
    setErrores((current) => ({ ...current, [campo]: undefined }));
  }

  function validar() {
    const next: FormErrors = {};
    next.name = validarNombreLibre(form.name, 'el nombre');
    next.phone = validarCelular(form.phone, { requerido: true });
    next.document = validarDocumento(form.documentType, form.document);
    setErrores(next);
    return !next.name && !next.phone && !next.document;
  }

  async function buscarDocumento() {
    const numero = form.document.trim();
    setBuscando(true);
    try {
      if (form.documentType === 'DNI') {
        const persona = await consultarDni(numero);
        setForm((current) => ({ ...current, name: soloTextoNombre(persona.nombreCompleto) }));
      } else {
        const empresa = await consultarRuc(numero);
        setForm((current) => ({
          ...current,
          name: soloTextoNombre(empresa.razonSocial),
          address: empresa.direccion || current.address,
        }));
      }
      setErrores((current) => ({ ...current, name: undefined }));
      toast.success('Datos encontrados.');
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'No se pudo consultar el documento');
    } finally {
      setBuscando(false);
    }
  }

  async function guardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validar()) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        address: form.address.trim() || undefined,
        documentType: form.documentType || undefined,
        document: form.document.trim() || undefined,
        // Vacío manda null (sin límite), no undefined: undefined dejaría el límite anterior y
        // entonces no se podría sacar nunca una vez puesto.
        creditLimit: form.creditLimit.trim() === '' ? null : Number(form.creditLimit),
      };
      const saved = editando
        ? await updateCliente(editando.id, payload)
        : await createCliente(payload);
      toast.success(editando ? 'Cliente actualizado.' : 'Cliente registrado.');
      onSaved(saved);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'No se pudo guardar el cliente');
    } finally {
      setSaving(false);
    }
  }

  if (typeof document === 'undefined') return null;

  return createPortal(
    <Modal onClose={onClose} closeDisabled={saving}>
      <ModalHeader
        title={editando ? 'Editar cliente' : 'Agregar cliente'}
        onClose={onClose}
        closeDisabled={saving}
      />
      <form className={modalFormClass} onSubmit={(event) => void guardar(event)} noValidate>
        <label className={fieldWideClass}>
          <span className={fieldLabelClass}>Nombre</span>
          <input
            className={controlClass}
            value={form.name}
            onChange={(event) => actualizar('name', soloTextoNombre(event.target.value))}
            maxLength={150}
            required
          />
          {errores.name ? <small className={fieldErrorClass}>{errores.name}</small> : null}
        </label>
        <label className={fieldWideClass}>
          <span className={fieldLabelClass}>Celular</span>
          <input
            className={controlClass}
            value={form.phone}
            onChange={(event) => actualizar('phone', soloDigitos(event.target.value, 9))}
            inputMode="numeric"
            maxLength={9}
            required
          />
          {errores.phone ? <small className={fieldErrorClass}>{errores.phone}</small> : null}
        </label>
        <label>
          <span className={fieldLabelClass}>Tipo de documento (opcional)</span>
          <select
            className={controlClass}
            value={form.documentType}
            onChange={(event) => {
              const tipo = event.target.value;
              setForm((current) => ({
                ...current,
                documentType: tipo,
                document: limpiarDocumento(current.document, tipo),
              }));
              setErrores((current) => ({ ...current, document: undefined }));
            }}
          >
            <option value="">Sin documento</option>
            <option value="DNI">DNI</option>
            <option value="RUC">RUC</option>
            <option value="CE">CE</option>
          </select>
        </label>
        <label>
          <span className={fieldLabelClass}>Número de documento (opcional)</span>
          <div className={fieldWithActionClass}>
            <input
              className={`${controlClass} min-w-0 flex-1`}
              value={form.document}
              onChange={(event) =>
                actualizar('document', limpiarDocumento(event.target.value, form.documentType))
              }
              inputMode={form.documentType === 'CE' || !form.documentType ? 'text' : 'numeric'}
            />
            {form.documentType === 'DNI' || form.documentType === 'RUC' ? (
              <Button
                variant="secondary"
                className="flex-none"
                type="button"
                onClick={() => void buscarDocumento()}
                disabled={!puedeBuscar || buscando}
              >
                {buscando ? 'Buscando...' : 'Buscar'}
              </Button>
            ) : null}
          </div>
          {errores.document ? <small className={fieldErrorClass}>{errores.document}</small> : null}
        </label>
        <label>
          <span className={fieldLabelClass}>Límite de crédito (opcional)</span>
          <input
            className={controlClass}
            inputMode="decimal"
            value={form.creditLimit}
            onChange={(event) =>
              actualizar('creditLimit', event.target.value.replace(/[^0-9.]/g, ''))
            }
            placeholder="Sin límite"
          />
          <small className="auto-note">
            Vacío = se le fía sin tope. 0 = no se le vende a crédito. Igual no se le fía si tiene
            cuentas vencidas.
          </small>
        </label>
        <label className={fieldWideClass}>
          <span className={fieldLabelClass}>Dirección (opcional)</span>
          <input
            className={controlClass}
            value={form.address}
            onChange={(event) => actualizar('address', event.target.value)}
            maxLength={250}
          />
        </label>
        <div className={modalActionsClass}>
          <Button variant="secondary" type="button" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button disabled={saving}>
            {saving ? 'Guardando...' : editando ? 'Guardar cambios' : 'Registrar cliente'}
          </Button>
        </div>
      </form>
    </Modal>,
    document.body,
  );
}
