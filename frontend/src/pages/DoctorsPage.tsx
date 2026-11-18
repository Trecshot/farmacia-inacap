import { Plus, Search, Stethoscope } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { ActionModal, type ActionField } from "../components/ui/ActionModal";
import { PageLoader } from "../components/feedback/PageLoader";
import { PageHeader } from "../components/ui/PageHeader";
import { ResponsiveTable } from "../components/ui/ResponsiveTable";
import { StatusBadge } from "../components/ui/StatusBadge";
import { useAuth } from "../context/AuthContext";
import { useResource } from "../hooks/useResource";
import { api, getApiErrorMessage } from "../lib/api";
import { nullable, runApiAction } from "../lib/actionHelpers";
import { normalizeText as norm } from "../lib/formatters";

type Doctor = {
  id: string;
  rut: string;
  firstName: string;
  lastName: string;
  specialty: string | null;
  registration: string | null;
  phone?: string | null;
  email?: string | null;
  isActive: boolean;
  _count?: { prescriptions: number };
};
type FormValues = Record<string, string | number | boolean>;

const doctorFields: ActionField[] = [
  { name: "rut", label: "RUT", required: true },
  { name: "firstName", label: "Nombres", required: true },
  { name: "lastName", label: "Apellidos", required: true },
  { name: "specialty", label: "Especialidad" },
  { name: "registration", label: "Registro profesional" },
  { name: "phone", label: "Teléfono" },
  { name: "email", label: "Correo", type: "email" },
  { name: "isActive", label: "Profesional activo", type: "checkbox" },
];

const defaultDoctorInitialValues = { isActive: true };

export const DoctorsPage = () => {
  const { hasPermission } = useAuth();
  const canCreate =
    hasPermission("doctors.create") || hasPermission("prescriptions.create");
  const canUpdate = hasPermission("doctors.update");
  const canDelete = hasPermission("doctors.delete");

  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Doctor | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  const selector = useCallback(
    (p: { items: Doctor[] }) => p.items,
    [],
  );
  const res = useResource<Doctor[], { items: Doctor[] }>(
    "/doctors?limit=100",
    selector,
  );
  const rows = useMemo(() => res.data ?? [], [res.data]);

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          !q ||
          norm(
            [
              r.firstName,
              r.lastName,
              r.rut,
              r.specialty ?? "",
              r.registration ?? "",
            ].join(" "),
          ).includes(norm(q)),
      ),
    [rows, q],
  );

  const close = () => {
    setOpen(false);
    setEditing(null);
    setActionError("");
  };

  const save = async (v: FormValues) => {
    const payload = {
      rut: String(v.rut),
      firstName: String(v.firstName),
      lastName: String(v.lastName),
      specialty: nullable(v.specialty),
      registration: nullable(v.registration),
      phone: nullable(v.phone),
      email: nullable(v.email),
      isActive: Boolean(v.isActive),
    };
    await runApiAction(
      () =>
        editing
          ? api.patch(`/doctors/${editing.id}`, payload)
          : api.post("/doctors", payload),
      setBusy,
      setActionError,
      async () => {
        await res.reload();
        close();
      },
    );
  };

  const remove = async (r: Doctor) => {
    if (!confirm(`¿Eliminar o desactivar a ${r.firstName} ${r.lastName}?`)) {
      return;
    }
    try {
      await api.delete(`/doctors/${r.id}`);
      await res.reload();
    } catch (error: unknown) {
      setActionError(getApiErrorMessage(error));
    }
  };

  const initialValues = useMemo(
    () => editing ?? defaultDoctorInitialValues,
    [editing],
  );

  return (
    <div className="module-v2">
      <PageHeader
        eyebrow="Atención clínica"
        title="Médicos"
        description="Profesionales asociados a las recetas registradas."
        actions={
          canCreate ? (
            <button
              className="button button--primary"
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              <Plus size={17} />
              Nuevo médico
            </button>
          ) : null
        }
      />
      {res.loading ? <PageLoader /> : null}
      {res.error || actionError ? (
        <div className="alert alert--error">{res.error || actionError}</div>
      ) : null}
      {!res.loading ? (
        <>
          <section className="module-v2__kpis">
            <article className="module-kpi">
              <span className="module-kpi__icon module-kpi__icon--green">
                <Stethoscope size={19} />
              </span>
              <div>
                <span>Profesionales</span>
                <strong>{rows.length}</strong>
                <small>Registrados</small>
              </div>
            </article>
            <article className="module-kpi">
              <span className="module-kpi__icon module-kpi__icon--blue">
                <Stethoscope size={19} />
              </span>
              <div>
                <span>Activos</span>
                <strong>{rows.filter((r) => r.isActive).length}</strong>
                <small>Habilitados</small>
              </div>
            </article>
            <article className="module-kpi">
              <span className="module-kpi__icon module-kpi__icon--amber">
                <Stethoscope size={19} />
              </span>
              <div>
                <span>Especialidades</span>
                <strong>
                  {new Set(rows.map((r) => r.specialty).filter(Boolean)).size}
                </strong>
                <small>Registradas</small>
              </div>
            </article>
            <article className="module-kpi">
              <span className="module-kpi__icon module-kpi__icon--violet">
                <Stethoscope size={19} />
              </span>
              <div>
                <span>Recetas</span>
                <strong>
                  {rows.reduce((s, r) => s + (r._count?.prescriptions ?? 0), 0)}
                </strong>
                <small>Asociadas</small>
              </div>
            </article>
          </section>
          <section className="module-panel">
            <div className="module-panel__header module-panel__header--filters">
              <div>
                <span className="module-panel__eyebrow">Profesionales</span>
                <h2>Médicos registrados</h2>
              </div>
              <label className="module-search">
                <Search size={16} />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Nombre, RUT o especialidad..."
                />
              </label>
            </div>
            {filtered.length ? (
              <ResponsiveTable
                rows={filtered}
                getKey={(r) => r.id}
                columns={[
                  {
                    key: "name",
                    header: "Profesional",
                    render: (r) => (
                      <div className="cell-stack">
                        <strong>
                          {r.firstName} {r.lastName}
                        </strong>
                        <span>{r.rut}</span>
                      </div>
                    ),
                  },
                  {
                    key: "specialty",
                    header: "Especialidad",
                    render: (r) => r.specialty ?? "—",
                  },
                  {
                    key: "registration",
                    header: "Registro",
                    render: (r) => r.registration ?? "—",
                  },
                  {
                    key: "status",
                    header: "Estado",
                    render: (r) => (
                      <StatusBadge value={r.isActive ? "ACTIVE" : "INACTIVE"} />
                    ),
                  },
                  {
                    key: "actions",
                    header: "Acciones",
                    render: (r) =>
                      canUpdate || canDelete ? (
                        <div className="row-actions">
                          {canUpdate ? (
                            <button
                              className="row-action"
                              onClick={() => {
                                setEditing(r);
                                setOpen(true);
                              }}
                            >
                              Editar
                            </button>
                          ) : null}
                          {canDelete ? (
                            <button
                              className="row-action row-action--danger"
                              onClick={() => void remove(r)}
                            >
                              Eliminar
                            </button>
                          ) : null}
                        </div>
                      ) : (
                        <span>—</span>
                      ),
                  },
                ]}
              />
            ) : (
              <div className="module-empty">
                <span className="module-empty__icon">
                  <Stethoscope size={27} />
                </span>
                <strong>Sin médicos</strong>
                <p>Crea el primer profesional.</p>
              </div>
            )}
          </section>
        </>
      ) : null}
      <ActionModal
        open={open}
        title={editing ? "Editar médico" : "Nuevo médico"}
        fields={doctorFields}
        initialValues={initialValues}
        busy={busy}
        error={actionError}
        onClose={close}
        onSubmit={save}
      />
    </div>
  );
};
