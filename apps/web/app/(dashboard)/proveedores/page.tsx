"use client";

import { Pencil, Plus, Search, UserCheck, UserX, X } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Pagination } from "../../../components/Pagination";
import { api } from "../../../lib/api";

type Proveedor = {
  id: string;
  ruc: string;
  razonSocial: string;
  nombreComercial: string;
  telefono: string;
  correo: string;
  direccion: string;
  estado: boolean;
  compras: number;
  saldoPendiente: number;
};

type ProveedorForm = Pick<Proveedor, "ruc" | "razonSocial" | "nombreComercial" | "telefono" | "correo" | "direccion">;
type FormErrors = Partial<Record<keyof ProveedorForm, string>>;

const emptyForm: ProveedorForm = {
  ruc: "",
  razonSocial: "",
  nombreComercial: "",
  telefono: "",
  correo: "",
  direccion: "",
};

export default function ProveedoresPage() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [buscar, setBuscar] = useState("");
  const [estado, setEstado] = useState("Todos");
  const [pagina, setPagina] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<Proveedor | null>(null);
  const [form, setForm] = useState<ProveedorForm>(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setProveedores(await api<Proveedor[]>("/proveedores"));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudieron cargar los proveedores");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visibles = useMemo(() => {
    const term = buscar.trim().toLowerCase();
    return proveedores.filter((item) => {
      const matchesStatus = estado === "Todos" || (estado === "Activos" ? item.estado : !item.estado);
      const matchesSearch = !term || `${item.razonSocial} ${item.ruc} ${item.nombreComercial} ${item.telefono}`.toLowerCase().includes(term);
      return matchesStatus && matchesSearch;
    });
  }, [buscar, estado, proveedores]);
  const pages = Math.max(1, Math.ceil(visibles.length / pageSize));
  const currentPage = Math.min(pagina, pages);
  const paginados = visibles.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function abrir(item?: Proveedor) {
    setEditando(item ?? null);
    setForm(item ? {
      ruc: item.ruc,
      razonSocial: item.razonSocial,
      nombreComercial: item.nombreComercial,
      telefono: item.telefono,
      correo: item.correo,
      direccion: item.direccion,
    } : emptyForm);
    setFieldErrors({});
    setError("");
    setModal(true);
  }

  function updateField(field: keyof ProveedorForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  }

  function validate() {
    const next: FormErrors = {};
    if (!/^\d{11}$/.test(form.ruc.trim())) next.ruc = "Ingresa un RUC de 11 digitos.";
    if (!form.razonSocial.trim()) next.razonSocial = "Ingresa la razon social.";
    if (form.correo.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.correo.trim())) next.correo = "Ingresa un correo valido.";
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function guardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validate()) return;
    setSaving(true);
    setError("");
    const payload = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value.trim()]));
    try {
      const saved = await api<Proveedor>(editando ? `/proveedores/${editando.id}` : "/proveedores", {
        method: editando ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      setProveedores((current) => (editando
        ? current.map((item) => item.id === saved.id ? saved : item)
        : [...current, saved]
      ).sort((left, right) => left.razonSocial.localeCompare(right.razonSocial, "es")));
      setModal(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo guardar el proveedor");
    } finally {
      setSaving(false);
    }
  }

  async function cambiarEstado(item: Proveedor) {
    if (item.estado && !window.confirm(`¿Desactivar a ${item.razonSocial}?`)) return;
    setProcessingId(item.id);
    setError("");
    try {
      const updated = await api<Proveedor>(`/proveedores/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ estado: !item.estado }),
      });
      setProveedores((current) => current.map((row) => row.id === updated.id ? updated : row));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No se pudo cambiar el estado del proveedor");
    } finally {
      setProcessingId(null);
    }
  }

  return <div className="module-page">
    <div className="module-head"><div className="module-title"><h1>Proveedores</h1><span>{proveedores.length} proveedores</span></div><button type="button" className="round-add" onClick={() => abrir()} title="Agregar proveedor" aria-label="Agregar proveedor" disabled={loading}><Plus size={20} /></button></div>
    <div className="module-tools"><label className="pill-search"><Search size={17} /><input value={buscar} onChange={(event) => { setBuscar(event.target.value); setPagina(1); }} placeholder="Buscar por razon social, RUC o nombre comercial" /></label><select className="filter-pill" value={estado} onChange={(event) => { setEstado(event.target.value); setPagina(1); }} aria-label="Filtrar por estado"><option>Todos</option><option>Activos</option><option>Inactivos</option></select></div>
    {error && !modal ? <div className="notice-error" role="alert">{error}<button type="button" onClick={() => void load()}>Reintentar</button></div> : null}
    {loading ? <div className="table-loading" role="status"><span className="loading-spinner" /> Cargando proveedores...</div> : <>
      <div className="glass-table"><table><thead><tr><th>Proveedor</th><th>Contacto</th><th>Compras</th><th>Saldo pendiente</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{paginados.length ? paginados.map((item) => <tr key={item.id}><td><strong>{item.razonSocial}</strong><small>{item.ruc}{item.nombreComercial ? ` · ${item.nombreComercial}` : ""}</small></td><td>{item.telefono || "Sin telefono"}<small>{item.correo || item.direccion || "Sin datos adicionales"}</small></td><td>{item.compras}</td><td>S/ {item.saldoPendiente.toFixed(2)}</td><td><span className={item.estado ? "status status-green" : "status status-red"}>{item.estado ? "Activo" : "Inactivo"}</span></td><td><div className="row-actions"><button type="button" className="icon-soft" onClick={() => abrir(item)} title="Editar proveedor" aria-label={`Editar ${item.razonSocial}`}><Pencil size={16} /></button><button type="button" className="icon-soft" onClick={() => void cambiarEstado(item)} disabled={processingId === item.id} title={item.estado ? "Desactivar proveedor" : "Activar proveedor"} aria-label={`${item.estado ? "Desactivar" : "Activar"} ${item.razonSocial}`}>{item.estado ? <UserX size={16} /> : <UserCheck size={16} />}</button></div></td></tr>) : <tr><td colSpan={6}><div className="table-empty"><Search size={22} /><span>No hay proveedores que coincidan con los filtros.</span>{buscar || estado !== "Todos" ? <button type="button" onClick={() => { setBuscar(""); setEstado("Todos"); }}>Limpiar filtros</button> : null}</div></td></tr>}</tbody></table></div>
      <Pagination page={currentPage} pages={pages} total={visibles.length} pageSize={pageSize} onChange={setPagina} onPageSizeChange={(size) => { setPageSize(size); setPagina(1); }} />
    </>}
    {modal ? <div className="modal-backdrop"><section className="crud-modal" role="dialog" aria-modal="true" aria-labelledby="supplier-modal-title"><div className="modal-top"><h2 id="supplier-modal-title">{editando ? "Editar proveedor" : "Agregar proveedor"}</h2><button type="button" className="modal-close" onClick={() => setModal(false)} aria-label="Cerrar modal" disabled={saving}><X size={18} /></button></div><form className="modal-form" onSubmit={guardar} noValidate>
      <label><span>RUC</span><input value={form.ruc} onChange={(event) => updateField("ruc", event.target.value.replace(/\D/g, "").slice(0, 11))} inputMode="numeric" pattern="\d{11}" maxLength={11} required autoFocus />{fieldErrors.ruc ? <small className="field-error">{fieldErrors.ruc}</small> : null}</label>
      <label><span>Razon social</span><input value={form.razonSocial} onChange={(event) => updateField("razonSocial", event.target.value)} maxLength={150} required />{fieldErrors.razonSocial ? <small className="field-error">{fieldErrors.razonSocial}</small> : null}</label>
      <label><span>Nombre comercial</span><input value={form.nombreComercial} onChange={(event) => updateField("nombreComercial", event.target.value)} maxLength={150} /></label>
      <label><span>Telefono</span><input value={form.telefono} onChange={(event) => updateField("telefono", event.target.value)} inputMode="tel" maxLength={20} /></label>
      <label><span>Correo</span><input type="email" value={form.correo} onChange={(event) => updateField("correo", event.target.value)} maxLength={150} />{fieldErrors.correo ? <small className="field-error">{fieldErrors.correo}</small> : null}</label>
      <label><span>Direccion</span><input value={form.direccion} onChange={(event) => updateField("direccion", event.target.value)} maxLength={250} /></label>
      {error ? <div className="notice-error field-wide" role="alert">{error}</div> : null}
      <div className="modal-actions"><button className="btn-secondary" type="button" onClick={() => setModal(false)} disabled={saving}>Cancelar</button><button className="btn-primary" disabled={saving}>{saving ? "Guardando..." : editando ? "Guardar cambios" : "Registrar proveedor"}</button></div>
    </form></section></div> : null}
  </div>;
}
