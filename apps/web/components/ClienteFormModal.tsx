'use client';

import { X } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { Cliente, createCliente, updateCliente } from '../lib/clients';
import { consultarDni, consultarRuc } from '../lib/consulta-documento';

type Props = {
  editando?: Cliente | null;
  onClose: () => void;
  onSaved: (cliente: Cliente) => void;
};

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
  });
  const [saving, setSaving] = useState(false);
  const [buscando, setBuscando] = useState(false);

  // El botón "Buscar" aplica solo a DNI (8 dígitos) y RUC (11 dígitos).
  const largoDocumento = form.documentType === 'DNI' ? 8 : form.documentType === 'RUC' ? 11 : 0;
  const puedeBuscar = largoDocumento > 0 && form.document.trim().length === largoDocumento;

  async function buscarDocumento() {
    const numero = form.document.trim();
    setBuscando(true);
    try {
      if (form.documentType === 'DNI') {
        const persona = await consultarDni(numero);
        setForm((current) => ({ ...current, name: persona.nombreCompleto }));
      } else {
        const empresa = await consultarRuc(numero);
        setForm((current) => ({
          ...current,
          name: empresa.razonSocial,
          address: empresa.direccion || current.address,
        }));
      }
      toast.success('Datos encontrados.');
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'No se pudo consultar el documento');
    } finally {
      setBuscando(false);
    }
  }

  async function guardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        phone: form.phone,
        address: form.address.trim() || undefined,
        documentType: form.documentType || undefined,
        document: form.document.trim() || undefined,
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
        aria-label={editando ? 'Editar cliente' : 'Agregar cliente'}
      >
        <div className="modal-top">
          <h2>{editando ? 'Editar cliente' : 'Agregar cliente'}</h2>
          <button
            className="modal-close"
            onClick={onClose}
            disabled={saving}
            aria-label="Cerrar modal"
          >
            <X size={18} />
          </button>
        </div>
        <form className="modal-form" onSubmit={(event) => void guardar(event)}>
          <label className="field-wide">
            <span>Nombre</span>
            <input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              required
            />
          </label>
          <label className="field-wide">
            <span>Celular</span>
            <input
              value={form.phone}
              onChange={(event) => setForm({ ...form, phone: event.target.value })}
              required
            />
          </label>
          <label>
            <span>Tipo de documento (opcional)</span>
            <select
              value={form.documentType}
              onChange={(event) => setForm({ ...form, documentType: event.target.value })}
            >
              <option value="">Sin documento</option>
              <option value="DNI">DNI</option>
              <option value="RUC">RUC</option>
              <option value="CE">CE</option>
            </select>
          </label>
          <label>
            <span>Número de documento (opcional)</span>
            <div className="field-with-action">
              <input
                value={form.document}
                onChange={(event) => {
                  const bruto = event.target.value;
                  // DNI y RUC son solo dígitos (8 y 11); CE puede tener letras.
                  const limite =
                    form.documentType === 'DNI' ? 8 : form.documentType === 'RUC' ? 11 : 0;
                  const valor = limite ? bruto.replace(/\D/g, '').slice(0, limite) : bruto;
                  setForm({ ...form, document: valor });
                }}
                inputMode={form.documentType === 'CE' || !form.documentType ? 'text' : 'numeric'}
              />
              {form.documentType === 'DNI' || form.documentType === 'RUC' ? (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => void buscarDocumento()}
                  disabled={!puedeBuscar || buscando}
                >
                  {buscando ? 'Buscando...' : 'Buscar'}
                </button>
              ) : null}
            </div>
          </label>
          <label className="field-wide">
            <span>Dirección (opcional)</span>
            <input
              value={form.address}
              onChange={(event) => setForm({ ...form, address: event.target.value })}
            />
          </label>
          <div className="modal-actions">
            <button className="btn-secondary" type="button" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button className="btn-primary" disabled={saving}>
              {saving ? 'Guardando...' : editando ? 'Guardar cambios' : 'Registrar cliente'}
            </button>
          </div>
        </form>
      </section>
    </div>,
    document.body,
  );
}
