'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { Cliente, ClientePayload, createCliente, updateCliente } from '../lib/clients';
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
  initialDocument?: { type: 'DNI'; number: string; autoLookup?: boolean };
  onClose: () => void;
  onSaved: (cliente: Cliente) => void;
};

type CampoConError = 'name' | 'phone' | 'document' | 'creditLimit';
type FormErrors = Partial<Record<CampoConError, string>>;

/**
 * Alta / edición de cliente. La usan la pantalla de Clientes y el formulario de venta.
 * Solo nombre y celular son obligatorios; documento y dirección son opcionales.
 */
export function ClienteFormModal({ editando, initialDocument, onClose, onSaved }: Props) {
  const [form, setForm] = useState({
    name: editando?.name ?? '',
    documentType: editando?.documentType ?? initialDocument?.type ?? '',
    document: editando?.document ?? initialDocument?.number ?? '',
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
  const autoLookupDone = useRef(false);

  // El botón "Buscar" aplica solo a DNI (8 dígitos) y RUC (11 dígitos).
  const largoDocumento = form.documentType === 'DNI' ? 8 : form.documentType === 'RUC' ? 11 : 0;
  const puedeBuscar = largoDocumento > 0 && form.document.trim().length === largoDocumento;

  // Si el alta nació de una búsqueda DNI sin resultados, el formulario ya abre con el
  // documento puesto y consulta RENIEC una sola vez. Si falla, todos los campos quedan
  // editables para continuar manualmente.
  useEffect(() => {
    if (editando || !initialDocument?.autoLookup || !puedeBuscar || autoLookupDone.current) return;
    autoLookupDone.current = true;
    void buscarDocumento();
    // Los valores iniciales no cambian durante la vida del modal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editando, initialDocument?.autoLookup, puedeBuscar]);

  /** Limpia el número de documento según el tipo (DNI/RUC solo dígitos; CE alfanumérico). */
  function limpiarDocumento(valor: string, tipo: string) {
    if (tipo === 'DNI') return soloDigitos(valor, 8);
    if (tipo === 'RUC') return soloDigitos(valor, 11);
    if (tipo === 'CE' || tipo === 'PAS') return soloAlfanumerico(valor, 15);
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
    if (form.document.trim() && !form.documentType) {
      next.document = 'Selecciona el tipo de documento.';
    }
    if (
      form.creditLimit.trim() &&
      (!/^\d+(\.\d{1,2})?$/.test(form.creditLimit.trim()) ||
        !Number.isFinite(Number(form.creditLimit)))
    ) {
      next.creditLimit = 'Ingresa un límite válido, con un máximo de 2 decimales.';
    }
    setErrores(next);
    return !Object.values(next).some(Boolean);
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
    // Los eventos del portal siguen el árbol de React: no enviar también la venta
    // cuando este modal se abre dentro de OperationForm.
    event.stopPropagation();
    if (saving || buscando) return;
    if (!validar()) return;
    setSaving(true);
    try {
      const payload: ClientePayload = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        documentType: form.documentType || null,
        document: form.document.trim() || null,
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
            disabled={buscando}
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
            disabled={buscando}
            onChange={(event) => {
              const tipo = event.target.value;
              setForm((current) => ({
                ...current,
                documentType: tipo,
                document: tipo ? limpiarDocumento(current.document, tipo) : '',
              }));
              setErrores((current) => ({ ...current, document: undefined }));
            }}
          >
            <option value="">Sin documento</option>
            <option value="DNI">DNI</option>
            <option value="RUC">RUC</option>
            <option value="CE">CE</option>
            <option value="PAS">Pasaporte</option>
          </select>
        </label>
        <label>
          <span className={fieldLabelClass}>Número de documento (opcional)</span>
          <div className={fieldWithActionClass}>
            <input
              className={`${controlClass} min-w-0 flex-1`}
              value={form.document}
              disabled={buscando || !form.documentType}
              onChange={(event) =>
                actualizar('document', limpiarDocumento(event.target.value, form.documentType))
              }
              inputMode={largoDocumento ? 'numeric' : 'text'}
            />
            {form.documentType === 'DNI' || form.documentType === 'RUC' ? (
              <Button
                variant="secondary"
                className="flex-none"
                type="button"
                onClick={() => void buscarDocumento()}
                disabled={!puedeBuscar || buscando || saving}
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
            onChange={(event) => actualizar('creditLimit', event.target.value)}
            placeholder="Sin límite"
          />
          {errores.creditLimit ? (
            <small className={fieldErrorClass}>{errores.creditLimit}</small>
          ) : null}
        </label>
        <label className={fieldWideClass}>
          <span className={fieldLabelClass}>Dirección (opcional)</span>
          <input
            className={controlClass}
            value={form.address}
            disabled={buscando}
            onChange={(event) => actualizar('address', event.target.value)}
            maxLength={250}
          />
        </label>
        <div className={modalActionsClass}>
          <Button variant="secondary" type="button" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving || buscando}>
            {saving ? 'Guardando...' : editando ? 'Guardar cambios' : 'Registrar cliente'}
          </Button>
        </div>
      </form>
    </Modal>,
    document.body,
  );
}
