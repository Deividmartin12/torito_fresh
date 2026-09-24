'use client';

import { FormEvent, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { getRolesAsignables, RolAsignable } from '../lib/roles';
import {
  CARGOS_TRABAJADOR,
  createTrabajador,
  Trabajador,
  TrabajadorPayload,
  updateTrabajador,
} from '../lib/trabajadores';
import { getMisUnidades, UnidadNegocio, UnidadOpcion } from '../lib/unidades';
import {
  soloAlfanumerico,
  soloDigitos,
  soloLetras,
  soloUsername,
  validarCelular,
  validarDocumento,
  validarEmail,
  validarNombrePersona,
  validarPassword,
  validarUsername,
} from '../lib/validacion';
import { SearchableSelect } from './SearchableSelect';
import { Button } from './ui/Button';
import {
  checkboxFieldClass,
  checkboxInputClass,
  controlClass,
  fieldErrorClass,
  fieldLabelClass,
  fieldWideClass,
  formHintClass,
  modalActionsClass,
  modalFormClass,
  modalFormSectionClass,
  modalFormSectionHintClass,
  modalFormSectionTitleClass,
} from './ui/Field';
import { Modal, ModalHeader } from './ui/Modal';
import { UnidadNegocioFormModal } from './UnidadNegocioFormModal';

type Props = {
  /** Con trabajador es edición; sin él, alta. */
  editando?: Trabajador | null;
  onClose: () => void;
  onSaved: (trabajador: Trabajador) => void;
};

type DatosForm = {
  tipoDocumento: string;
  numeroDocumento: string;
  nombres: string;
  apellidos: string;
  telefono: string;
  correo: string;
  cargo: string;
  unidadNegocioId: string;
};

/** Lo que se teclea de la cuenta de acceso. El resto (nombre, correo) lo pone el API. */
type CuentaForm = { username: string; password: string; role: string };

type FormErrors = Partial<Record<keyof DatosForm | keyof CuentaForm, string>>;

const datosVacios: DatosForm = {
  tipoDocumento: 'DNI',
  numeroDocumento: '',
  nombres: '',
  apellidos: '',
  telefono: '',
  correo: '',
  cargo: 'Vendedor',
  unidadNegocioId: '',
};

const cuentaVacia: CuentaForm = { username: '', password: '', role: 'SELLER' };

/**
 * El cargo del trabajador y el rol con el que entra al sistema son la misma decisión.
 *
 * Solo cubre los cinco cargos de siempre: un rol creado desde el panel no tiene un cargo que
 * lo sugiera, y ahí se elige a mano, que es lo correcto.
 */
const ROL_SUGERIDO: Record<string, string> = {
  Administrador: 'ADMIN',
  Almacenero: 'WAREHOUSE',
  Vendedor: 'SELLER',
  Repartidor: 'DELIVERY',
  Socio: 'SOCIO',
};

/**
 * Alta y edición de un trabajador **con su cuenta de acceso en el mismo paso**. Es un solo
 * formulario y un solo guardado: el API crea la persona y su usuario dentro de una
 * transacción, así que o quedan las dos cosas o no queda ninguna.
 *
 * Lo usan la pantalla de Trabajadores y la acción inline "+ Agregar trabajador" del combo de
 * beneficiario del formulario de gasto, para no tener que salir a Configuración a mitad de
 * registrar un pago.
 */
export function TrabajadorFormModal({ editando, onClose, onSaved }: Props) {
  const [form, setForm] = useState<DatosForm>(
    editando
      ? {
          tipoDocumento: editando.tipoDocumento,
          numeroDocumento: editando.numeroDocumento,
          nombres: editando.nombres,
          apellidos: editando.apellidos,
          telefono: editando.telefono,
          correo: editando.correo,
          cargo: editando.cargo,
          unidadNegocioId: editando.unidadNegocioId,
        }
      : datosVacios,
  );
  // Quien ya tiene acceso lo edita siempre; a quien no lo tiene se le crea marcando la
  // casilla. Así el alta corriente sigue siendo corta y la cuenta no es obligatoria.
  const [conCuenta, setConCuenta] = useState(Boolean(editando?.usuario));
  const [cuenta, setCuenta] = useState<CuentaForm>(
    editando?.usuario
      ? {
          username: editando.usuario.username ?? '',
          password: '',
          role: editando.usuario.role,
        }
      : cuentaVacia,
  );
  // Mientras nadie elija el rol a mano, lo propone el cargo. Después manda lo elegido.
  const [rolElegido, setRolElegido] = useState(Boolean(editando?.usuario));
  // Los roles salen del API: son filas editables, así que la lista no se puede escribir acá.
  const [roles, setRoles] = useState<RolAsignable[]>([]);
  const [unidades, setUnidades] = useState<UnidadOpcion[]>([]);
  const [modalUnidad, setModalUnidad] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);

  const tieneCuenta = Boolean(editando?.usuario);

  useEffect(() => {
    getMisUnidades()
      .then((lista) => {
        setUnidades(lista);
        setForm((current) =>
          current.unidadNegocioId
            ? current
            : {
                ...current,
                // La principal, que es a la que pertenece casi todo el mundo.
                unidadNegocioId: lista.find((unidad) => unidad.principal)?.id ?? lista[0]?.id ?? '',
              },
        );
      })
      .catch(() => setUnidades([]));
  }, []);

  useEffect(() => {
    getRolesAsignables()
      .then((lista) => {
        setRoles(lista);
        // Si el rol que traía la cuenta ya no está (lo desactivaron), se cae al primero de la
        // lista: es preferible a dejar el combo mostrando un valor que el API va a rechazar.
        setCuenta((actual) =>
          lista.some((rol) => rol.clave === actual.role) || !lista.length
            ? actual
            : { ...actual, role: lista[0].clave },
        );
      })
      .catch(() => setRoles([]));
  }, []);

  function updateField(field: keyof DatosForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  }

  function updateCuenta(field: keyof CuentaForm, value: string) {
    setCuenta((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  }

  /** Cambiar el cargo mueve el rol sugerido mientras nadie haya elegido uno a mano. */
  function cambiarCargo(cargo: string) {
    updateField('cargo', cargo);
    if (!rolElegido && ROL_SUGERIDO[cargo]) updateCuenta('role', ROL_SUGERIDO[cargo]);
  }

  function handleUnidadCreada(creada: UnidadNegocio) {
    setUnidades((current) => [
      ...current,
      {
        id: creada.id,
        codigo: creada.codigo,
        nombre: creada.nombre,
        principal: creada.principal,
        controlaInventario: creada.controlaInventario,
      },
    ]);
    setForm((current) => ({ ...current, unidadNegocioId: creada.id }));
    setModalUnidad(false);
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
    if (conCuenta) {
      next.username = validarUsername(cuenta.username, { requerido: true });
      // Al editar, la contraseña en blanco significa "déjala como está".
      next.password = validarPassword(cuenta.password, { requerido: !tieneCuenta });
      // El API usa este correo como el de la cuenta y lo exige único: sin correo no hay login.
      if (!form.correo.trim() && !next.correo)
        next.correo = 'El correo es obligatorio para la cuenta de acceso.';
    }
    setFieldErrors(next);
    return Object.values(next).every((mensaje) => !mensaje);
  }

  async function guardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validate()) return;
    setSaving(true);
    const payload: TrabajadorPayload = {
      tipoDocumento: form.tipoDocumento,
      numeroDocumento: form.numeroDocumento.trim(),
      nombres: form.nombres.trim(),
      apellidos: form.apellidos.trim(),
      telefono: form.telefono.trim(),
      correo: form.correo.trim(),
      cargo: form.cargo,
      ...(form.unidadNegocioId ? { unidadNegocioId: form.unidadNegocioId } : {}),
      ...(conCuenta
        ? {
            cuenta: {
              username: cuenta.username.trim(),
              role: cuenta.role,
              ...(cuenta.password ? { password: cuenta.password } : {}),
            },
          }
        : {}),
    };
    try {
      const saved = editando
        ? await updateTrabajador(editando.id, payload)
        : await createTrabajador(payload);
      toast.success(
        editando ? 'Trabajador actualizado correctamente.' : 'Trabajador registrado correctamente.',
      );
      onSaved(saved);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'No se pudo guardar el trabajador');
    } finally {
      setSaving(false);
    }
  }

  if (typeof document === 'undefined') return null;

  const titulo = editando ? 'Editar trabajador' : 'Agregar trabajador';

  return createPortal(
    <>
      <Modal onClose={onClose} closeDisabled={saving}>
        <ModalHeader title={titulo} onClose={onClose} closeDisabled={saving} />
        <form className={modalFormClass} onSubmit={(event) => void guardar(event)} noValidate>
          <label>
            <span className={fieldLabelClass}>Tipo de documento</span>
            <select
              className={controlClass}
              value={form.tipoDocumento}
              onChange={(event) => {
                const tipo = event.target.value;
                setForm((current) => ({
                  ...current,
                  tipoDocumento: tipo,
                  numeroDocumento:
                    tipo === 'DNI'
                      ? soloDigitos(current.numeroDocumento, 8)
                      : soloAlfanumerico(current.numeroDocumento, 15),
                }));
                setFieldErrors((current) => ({ ...current, numeroDocumento: undefined }));
              }}
            >
              <option value="DNI">DNI</option>
              <option value="CE">Carné de extranjería</option>
            </select>
          </label>
          <label>
            <span className={fieldLabelClass}>Número de documento</span>
            <input
              className={controlClass}
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
              maxLength={15}
              required
              autoFocus
            />
            {fieldErrors.numeroDocumento ? (
              <small className={fieldErrorClass}>{fieldErrors.numeroDocumento}</small>
            ) : null}
          </label>
          <label>
            <span className={fieldLabelClass}>Nombres</span>
            <input
              className={controlClass}
              value={form.nombres}
              onChange={(event) => updateField('nombres', soloLetras(event.target.value))}
              maxLength={100}
              required
            />
            {fieldErrors.nombres ? (
              <small className={fieldErrorClass}>{fieldErrors.nombres}</small>
            ) : null}
          </label>
          <label>
            <span className={fieldLabelClass}>Apellidos</span>
            <input
              className={controlClass}
              value={form.apellidos}
              onChange={(event) => updateField('apellidos', soloLetras(event.target.value))}
              maxLength={100}
              required
            />
            {fieldErrors.apellidos ? (
              <small className={fieldErrorClass}>{fieldErrors.apellidos}</small>
            ) : null}
          </label>
          <label>
            <span className={fieldLabelClass}>Cargo</span>
            <select
              className={controlClass}
              value={form.cargo}
              onChange={(event) => cambiarCargo(event.target.value)}
            >
              {CARGOS_TRABAJADOR.map((cargo) => (
                <option key={cargo} value={cargo}>
                  {cargo}
                </option>
              ))}
            </select>
          </label>
          {/* La unidad define dónde caen las ventas y los gastos que registre esta
                persona. Solo aparece si hay más de una: en un negocio sin puestos satélite
                sería un campo con una sola opción. */}
          {unidades.length > 1 ? (
            <label>
              <span className={fieldLabelClass}>Unidad de negocio</span>
              <SearchableSelect
                value={form.unidadNegocioId}
                onChange={(value) => updateField('unidadNegocioId', value)}
                options={unidades.map((unidad) => ({
                  value: unidad.id,
                  label: unidad.nombre,
                  hint: unidad.principal ? 'Principal' : undefined,
                }))}
                placeholder="Selecciona la unidad"
                actionLabel="+ Agregar unidad"
                onAction={() => setModalUnidad(true)}
                required
              />
            </label>
          ) : null}
          <label>
            <span className={fieldLabelClass}>Teléfono</span>
            <input
              className={controlClass}
              value={form.telefono}
              onChange={(event) => updateField('telefono', soloDigitos(event.target.value, 9))}
              inputMode="numeric"
              maxLength={9}
            />
            {fieldErrors.telefono ? (
              <small className={fieldErrorClass}>{fieldErrors.telefono}</small>
            ) : null}
          </label>
          <label>
            <span className={fieldLabelClass}>Correo</span>
            <input
              className={controlClass}
              type="email"
              value={form.correo}
              onChange={(event) => updateField('correo', event.target.value)}
              maxLength={150}
            />
            {fieldErrors.correo ? (
              <small className={fieldErrorClass}>{fieldErrors.correo}</small>
            ) : null}
          </label>

          <div className={modalFormSectionClass}>
            <strong className={modalFormSectionTitleClass}>Cuenta de acceso</strong>
            <small className={modalFormSectionHintClass}>
              {tieneCuenta
                ? 'Con estos datos entra al sistema. Se guardan junto con el trabajador.'
                : 'Con qué usuario y contraseña entrará al sistema. Se crea junto con el trabajador, en un solo guardado.'}
            </small>
          </div>
          {tieneCuenta ? null : (
            <label className={`${checkboxFieldClass} ${fieldWideClass}`}>
              <input
                className={checkboxInputClass}
                type="checkbox"
                checked={conCuenta}
                onChange={(event) => setConCuenta(event.target.checked)}
              />
              <span className="text-[13px] font-medium">Crear cuenta de acceso</span>
            </label>
          )}
          {conCuenta ? (
            <>
              <label>
                <span className={fieldLabelClass}>Usuario</span>
                <input
                  className={controlClass}
                  value={cuenta.username}
                  onChange={(event) =>
                    updateCuenta('username', soloUsername(event.target.value).slice(0, 50))
                  }
                  maxLength={50}
                  autoComplete="off"
                />
                {fieldErrors.username ? (
                  <small className={fieldErrorClass}>{fieldErrors.username}</small>
                ) : null}
              </label>
              <label>
                <span className={fieldLabelClass}>
                  {tieneCuenta ? 'Nueva contraseña' : 'Contraseña'}
                </span>
                <input
                  className={controlClass}
                  type="password"
                  value={cuenta.password}
                  onChange={(event) => updateCuenta('password', event.target.value)}
                  placeholder={tieneCuenta ? 'Dejar en blanco para no cambiarla' : undefined}
                  autoComplete="new-password"
                />
                {fieldErrors.password ? (
                  <small className={fieldErrorClass}>{fieldErrors.password}</small>
                ) : null}
              </label>
              <label>
                <span className={fieldLabelClass}>Rol</span>
                <select
                  className={controlClass}
                  value={cuenta.role}
                  onChange={(event) => {
                    setRolElegido(true);
                    updateCuenta('role', event.target.value);
                  }}
                >
                  {roles.map((rol) => (
                    <option key={rol.clave} value={rol.clave}>
                      {rol.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <p className={`${formHintClass} ${fieldWideClass}`}>
                Entra con su usuario o con el correo de arriba. El acceso se desactiva solo cuando
                se da de baja al trabajador.
              </p>
            </>
          ) : null}
          <div className={modalActionsClass}>
            <Button variant="secondary" type="button" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button disabled={saving}>
              {saving ? 'Guardando...' : editando ? 'Guardar cambios' : 'Registrar trabajador'}
            </Button>
          </div>
        </form>
      </Modal>
      {modalUnidad ? (
        <UnidadNegocioFormModal
          onClose={() => setModalUnidad(false)}
          onSaved={handleUnidadCreada}
        />
      ) : null}
    </>,
    document.body,
  );
}
