import {
  AlertTriangle,
  ArrowLeftRight,
  Boxes,
  CheckCircle2,
  PackageCheck,
  RefreshCcw,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { ActionModal, type ActionField } from "../components/ui/ActionModal";
import { PageLoader } from "../components/feedback/PageLoader";
import { PageHeader } from "../components/ui/PageHeader";
import { ResponsiveTable } from "../components/ui/ResponsiveTable";
import { StatusBadge } from "../components/ui/StatusBadge";
import { useAuth } from "../context/AuthContext";
import { useResource } from "../hooks/useResource";
import { api } from "../lib/api";
import { nullable, numeric, runApiAction } from "../lib/actionHelpers";
import { translateChoiceLabel } from "../lib/choiceLabels";

type Location = { id: string; code: string; name: string; isActive: boolean };
type Stock = {
  id: string;
  quantity: number;
  reservedQuantity: number;
  location: Location;
  batch: {
    id: string;
    batchNumber: string;
    expirationDate: string;
    product: { id: string; sku: string; name: string };
  };
};
type Alert = {
  id: string;
  type: string;
  status: string;
  title?: string;
  message?: string;
  product?: { name: string } | null;
  batch?: { batchNumber: string } | null;
};

type FormValues = Record<string, string | number | boolean>;

const norm = (v: string) =>
  v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const adjustFields: ActionField[] = [
  {
    name: "quantityDelta",
    label: "Ajuste (+/-)",
    type: "number",
    required: true,
  },
  { name: "reason", label: "Motivo", required: true },
];

export const InventoryPage = () => {
  const { hasPermission } = useAuth();
  const canUpdate = hasPermission("inventory.update");
  const canAdjust = hasPermission("inventory.adjust");

  const [q, setQ] = useState("");
  const [modal, setModal] = useState<"adjust" | "transfer" | null>(null);
  const [selected, setSelected] = useState<Stock | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [todayIso] = useState(() => new Date().toISOString());

  const stockSel = useCallback((p: { items: Stock[] }) => p.items, []);
  const locSel = useCallback((p: { locations: Location[] }) => p.locations, []);
  const alertSel = useCallback((p: { alerts: Alert[] }) => p.alerts, []);

  const stockRes = useResource<Stock[], { items: Stock[] }>(
    "/inventory/stock?limit=100",
    stockSel,
  );
  const locRes = useResource<Location[], { locations: Location[] }>(
    "/inventory/locations",
    locSel,
  );
  const alertRes = useResource<Alert[], { alerts: Alert[] }>(
    "/inventory/alerts",
    alertSel,
  );

  const rows = useMemo(() => stockRes.data ?? [], [stockRes.data]);
  const locations = useMemo(() => locRes.data ?? [], [locRes.data]);
  const alerts = useMemo(() => alertRes.data ?? [], [alertRes.data]);

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          !q ||
          norm(
            [
              r.batch.product.name,
              r.batch.product.sku,
              r.batch.batchNumber,
              r.location.name,
            ].join(" "),
          ).includes(norm(q)),
      ),
    [rows, q],
  );

  const available = useMemo(
    () =>
      rows.reduce((s, r) => s + Math.max(0, r.quantity - r.reservedQuantity), 0),
    [rows],
  );
  const expired = useMemo(
    () =>
      rows.filter(
        (r) => new Date(r.batch.expirationDate).toISOString() < todayIso,
      ).length,
    [rows, todayIso],
  );
  const pendingAlertsList = useMemo(
    () => alerts.filter((a) => a.status === "PENDING"),
    [alerts],
  );
  const pendingAlerts = pendingAlertsList.length;

  const close = () => {
    setModal(null);
    setSelected(null);
    setActionError("");
  };

  const reload = async () => {
    await Promise.all([stockRes.reload(), alertRes.reload()]);
  };

  const submit = async (v: FormValues) => {
    if (!selected) return;
    if (modal === "adjust") {
      await runApiAction(
        () =>
          api.post("/inventory/adjustments", {
            batchId: selected.batch.id,
            locationId: selected.location.id,
            quantityDelta: numeric(v.quantityDelta),
            reason: String(v.reason),
          }),
        setBusy,
        setActionError,
        async () => {
          await reload();
          close();
        },
      );
    }
    if (modal === "transfer") {
      await runApiAction(
        () =>
          api.post("/inventory/transfers", {
            batchId: selected.batch.id,
            originLocationId: selected.location.id,
            destinationLocationId: String(v.destinationLocationId),
            quantity: numeric(v.quantity),
            reason: nullable(v.reason),
          }),
        setBusy,
        setActionError,
        async () => {
          await reload();
          close();
        },
      );
    }
  };

  const scan = async () => {
    await runApiAction(
      () => api.post("/inventory/alerts/scan", { expiringDays: 90 }),
      setBusy,
      setActionError,
      reload,
    );
  };

  const resolveAlert = async (alertId: string) => {
    await runApiAction(
      () => api.patch(`/inventory/alerts/${alertId}/resolve`),
      setBusy,
      setActionError,
      reload,
    );
  };

  const fields = useMemo<ActionField[]>(() => {
    if (modal === "adjust") return adjustFields;
    return [
      {
        name: "destinationLocationId",
        label: "Destino",
        type: "select",
        required: true,
        options: locations
          .filter((l) => l.id !== selected?.location.id && l.isActive)
          .map((l) => ({ value: l.id, label: l.name })),
      },
      {
        name: "quantity",
        label: "Cantidad",
        type: "number",
        min: 1,
        required: true,
      },
      { name: "reason", label: "Motivo" },
    ];
  }, [modal, locations, selected?.location.id]);

  return (
    <div className="module-v2">
      <PageHeader
        eyebrow="Inventario"
        title="Stock por lote"
        description="Existencias por ubicación, lote y vencimiento con enfoque FEFO."
        actions={
          <div className="module-toolbar-actions">
            <button
              className="button button--secondary"
              onClick={() => void reload()}
            >
              <RefreshCcw size={17} />
              Actualizar
            </button>
            {canUpdate ? (
              <button
                className="button button--primary"
                disabled={busy}
                onClick={() => void scan()}
              >
                <AlertTriangle size={17} />
                Escanear alertas
              </button>
            ) : null}
          </div>
        }
      />
      {stockRes.loading ? <PageLoader /> : null}
      {stockRes.error || locRes.error || alertRes.error || actionError ? (
        <div className="alert alert--error">
          {stockRes.error || locRes.error || alertRes.error || actionError}
        </div>
      ) : null}
      {!stockRes.loading ? (
        <>
          <section className="module-v2__kpis">
            <article className="module-kpi">
              <span className="module-kpi__icon module-kpi__icon--green">
                <PackageCheck size={19} />
              </span>
              <div>
                <span>Disponible</span>
                <strong>{available}</strong>
                <small>Unidades</small>
              </div>
            </article>
            <article className="module-kpi">
              <span className="module-kpi__icon module-kpi__icon--blue">
                <Boxes size={19} />
              </span>
              <div>
                <span>Lotes</span>
                <strong>{rows.length}</strong>
                <small>Con stock</small>
              </div>
            </article>
            <article className="module-kpi">
              <span className="module-kpi__icon module-kpi__icon--amber">
                <AlertTriangle size={19} />
              </span>
              <div>
                <span>Alertas</span>
                <strong>{pendingAlerts}</strong>
                <small>Pendientes</small>
              </div>
            </article>
            <article className="module-kpi">
              <span className="module-kpi__icon module-kpi__icon--danger">
                <AlertTriangle size={19} />
              </span>
              <div>
                <span>Vencidos</span>
                <strong>{expired}</strong>
                <small>Lotes</small>
              </div>
            </article>
          </section>

          {pendingAlertsList.length ? (
            <section className="module-panel">
              <div className="module-panel__header">
                <div>
                  <span className="module-panel__eyebrow">Seguimiento</span>
                  <h2>Alertas pendientes</h2>
                </div>
              </div>
              <ResponsiveTable
                rows={pendingAlertsList}
                getKey={(a) => a.id}
                columns={[
                  {
                    key: "type",
                    header: "Tipo",
                    render: (a) => translateChoiceLabel(a.type),
                  },
                  {
                    key: "product",
                    header: "Producto / Lote",
                    render: (a) => (
                      <div className="cell-stack">
                        <strong>{a.product?.name ?? a.title ?? "Alerta"}</strong>
                        <span>
                          {a.batch?.batchNumber
                            ? `Lote ${a.batch.batchNumber}`
                            : (a.message ?? "—")}
                        </span>
                      </div>
                    ),
                  },
                  {
                    key: "status",
                    header: "Estado",
                    render: (a) => <StatusBadge value={a.status} />,
                  },
                  {
                    key: "actions",
                    header: "Acciones",
                    render: (a) =>
                      canUpdate && a.status === "PENDING" ? (
                        <div className="row-actions">
                          <button
                            className="row-action"
                            disabled={busy}
                            onClick={() => void resolveAlert(a.id)}
                          >
                            <CheckCircle2 size={12} /> Resolver
                          </button>
                        </div>
                      ) : (
                        <span>—</span>
                      ),
                  },
                ]}
              />
            </section>
          ) : null}

          <section className="module-panel">
            <div className="module-panel__header module-panel__header--filters">
              <div>
                <span className="module-panel__eyebrow">Existencias</span>
                <h2>Inventario disponible</h2>
              </div>
              <label className="module-search">
                <Search size={16} />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Producto, SKU, lote..."
                />
              </label>
            </div>
            {filtered.length ? (
              <ResponsiveTable
                rows={filtered}
                getKey={(r) => r.id}
                columns={[
                  {
                    key: "product",
                    header: "Producto",
                    render: (r) => (
                      <div className="cell-stack">
                        <strong>{r.batch.product.name}</strong>
                        <span>{r.batch.product.sku}</span>
                      </div>
                    ),
                  },
                  {
                    key: "batch",
                    header: "Lote",
                    render: (r) => r.batch.batchNumber,
                  },
                  {
                    key: "loc",
                    header: "Ubicación",
                    render: (r) => r.location.name,
                  },
                  {
                    key: "available",
                    header: "Disponible",
                    render: (r) => r.quantity - r.reservedQuantity,
                  },
                  {
                    key: "expiry",
                    header: "Vencimiento",
                    render: (r) =>
                      new Date(r.batch.expirationDate).toLocaleDateString(
                        "es-CL",
                      ),
                  },
                  {
                    key: "actions",
                    header: "Acciones",
                    render: (r) =>
                      canAdjust || canUpdate ? (
                        <div className="row-actions">
                          {canAdjust ? (
                            <button
                              className="row-action"
                              onClick={() => {
                                setSelected(r);
                                setModal("adjust");
                              }}
                            >
                              <SlidersHorizontal size={12} /> Ajustar
                            </button>
                          ) : null}
                          {canUpdate ? (
                            <button
                              className="row-action"
                              onClick={() => {
                                setSelected(r);
                                setModal("transfer");
                              }}
                            >
                              <ArrowLeftRight size={12} /> Transferir
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
                  <Boxes size={27} />
                </span>
                <strong>Sin stock</strong>
                <p>Las recepciones aparecerán aquí.</p>
              </div>
            )}
          </section>
        </>
      ) : null}
      <ActionModal
        open={Boolean(modal)}
        title={modal === "adjust" ? "Ajustar stock" : "Transferir stock"}
        fields={fields}
        busy={busy}
        error={actionError}
        onClose={close}
        onSubmit={submit}
      />
    </div>
  );
};
