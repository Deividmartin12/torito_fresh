"use client";

import { Banknote, Check, CreditCard, Pencil, Plus, Search, Smartphone, X } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { createPaymentMethod, getPaymentMethods, PaymentMethod, PaymentMethodPayload, updatePaymentMethod } from "../../../lib/payment-methods";

const emptyForm = (): PaymentMethodPayload => ({ nombre: "", requiereOperacion: false, estado: true });

function MethodIcon({ name }: { name: string }) {
  const normalized = name.toUpperCase();
  const Icon = normalized.includes("EFECTIVO") ? Banknote : normalized.includes("YAPE") || normalized.includes("PLIN") ? Smartphone : CreditCard;
  return <Icon size={18} />;
}

export default function MetodosPagoPage() {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PaymentMethod | null>(null);
  const [form, setForm] = useState<PaymentMethodPayload>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setMethods(await getPaymentMethods()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudieron cargar los métodos de pago"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => methods.filter((item) => item.nombre.toLowerCase().includes(search.toLowerCase())), [methods, search]);
  function close() { setOpen(false); setEditing(null); setForm(emptyForm()); }
  function openForm(method?: PaymentMethod) {
    setError(""); setEditing(method ?? null);
    setForm(method ? { nombre: method.nombre, requiereOperacion: method.requiereOperacion, estado: method.estado } : emptyForm());
    setOpen(true);
  }
  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const saved = editing ? await updatePaymentMethod(editing.id, form) : await createPaymentMethod(form);
      setMethods((current) => editing ? current.map((item) => item.id === saved.id ? saved : item) : [...current, saved].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      setMessage(editing ? "Método de pago actualizado." : "Método de pago registrado.");
      close();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo guardar el método de pago"); }
    finally { setSaving(false); }
  }

  return <div className="module-page">
    <div className="module-head"><div className="module-title"><h1>Métodos de pago</h1><span>{methods.length} métodos registrados</span></div><button className="round-add" type="button" onClick={() => openForm()} title="Agregar método" aria-label="Agregar método"><Plus size={20} /></button></div>
    {message ? <div className="notice-success" role="status"><Check size={17} /> {message}<button type="button" onClick={() => setMessage("")} aria-label="Cerrar mensaje">×</button></div> : null}
    {error ? <div className="notice-error" role="alert">{error}<button type="button" onClick={() => void load()}>Reintentar</button></div> : null}
    <div className="module-tools"><label className="pill-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar método de pago" /></label></div>
    {loading ? <div className="table-loading"><span className="loading-spinner" /> Cargando métodos de pago...</div> : <div className="glass-table"><table><thead><tr><th>Método</th><th>Número de operación</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{visible.length ? visible.map((item) => <tr key={item.id}><td><div className="flex items-center gap-2"><MethodIcon name={item.nombre} /><strong>{item.nombre}</strong></div></td><td>{item.requiereOperacion ? "Obligatorio" : "No requerido"}</td><td><span className={`status ${item.estado ? "status-green" : "status-red"}`}>{item.estado ? "Activo" : "Inactivo"}</span></td><td><button className="icon-soft" type="button" onClick={() => openForm(item)} title="Editar método"><Pencil size={16} /></button></td></tr>) : <tr><td colSpan={4}><div className="table-empty">No hay métodos de pago que coincidan.<button type="button" onClick={() => setSearch("")}>Limpiar búsqueda</button></div></td></tr>}</tbody></table></div>}
    {open ? <div className="modal-backdrop"><section className="crud-modal" role="dialog" aria-modal="true" aria-label={editing ? "Editar método" : "Agregar método"}><div className="modal-top"><h2>{editing ? "Editar método de pago" : "Agregar método de pago"}</h2><button className="modal-close" type="button" onClick={close} disabled={saving} aria-label="Cerrar modal"><X size={18} /></button></div><form className="modal-form" onSubmit={(event) => void save(event)}>
      <label className="field-wide"><span>Nombre</span><input value={form.nombre} maxLength={50} onChange={(event) => setForm((current) => ({ ...current, nombre: event.target.value }))} placeholder="Ej. EFECTIVO, YAPE o TARJETA" required autoFocus /></label>
      <label className="check-field field-wide"><input type="checkbox" checked={form.requiereOperacion} onChange={(event) => setForm((current) => ({ ...current, requiereOperacion: event.target.checked }))} /><span>Requiere número de operación</span></label>
      <label className="check-field field-wide"><input type="checkbox" checked={form.estado} onChange={(event) => setForm((current) => ({ ...current, estado: event.target.checked }))} /><span>Método activo</span></label>
      <div className="modal-actions"><button className="btn-secondary" type="button" onClick={close} disabled={saving}>Cancelar</button><button className="btn-primary" disabled={saving}>{saving ? "Guardando..." : editing ? "Guardar cambios" : "Registrar método"}</button></div>
    </form></section></div> : null}
  </div>;
}
