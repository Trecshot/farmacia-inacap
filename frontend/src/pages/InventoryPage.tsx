import { AlertTriangle, RefreshCcw } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { PageLoader } from "../components/feedback/PageLoader";
import {
  BatchStockTable,
  type InventoryAlertItem,
  type InventoryLocationItem,
  type InventoryStockItem,
} from "../components/inventory/BatchStockTable";
import { ActionModal, type ActionField } from "../components/ui/ActionModal";
import { PageHeader } from "../components/ui/PageHeader";
import { useAuth } from "../context/AuthContext";
import { useResource } from "../hooks/useResource";
import { nullable, numeric, runApiAction } from "../lib/actionHelpers";
import { api } from "../lib/api";
import { normalizeText } from "../lib/formatters";

type FormValues = Record<string, string | number | boolean>;

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
  const [selected, setSelected] = useState<InventoryStockItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [nowTime] = useState(() => Date.now());

  const stockSel = useCallback(
    (p: { items: InventoryStockItem[] }) => p.items,
    [],
  );
  const locSel = useCallback(
    (p: { locations: InventoryLocationItem[] }) => p.locations,
    [],
  );
  const alertSel = useCallback(
    (p: { alerts: InventoryAlertItem[] }) => p.alerts,
    [],
  );

  const stockRes = useResource<
    InventoryStockItem[],
    { items: InventoryStockItem[] }
  >("/inventory/stock?limit=100&includeExpired=true", stockSel);
  const locRes = useResource<
    InventoryLocationItem[],
    { locations: InventoryLocationItem[] }
  >("/inventory/locations", locSel);
  const alertRes = useResource<
    InventoryAlertItem[],
    { alerts: InventoryAlertItem[] }
  >("/inventory/alerts", alertSel);

  const rows = useMemo(() => stockRes.data ?? [], [stockRes.data]);
  const locations = useMemo(() => locRes.data ?? [], [locRes.data]);
  const alerts = useMemo(() => alertRes.data ?? [], [alertRes.data]);

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          !q ||
          normalizeText(
            [
              r.batch.product.name,
              r.batch.product.sku,
              r.batch.batchNumber,
              r.location.name,
            ].join(" "),
          ).includes(normalizeText(q)),
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
        (r) => new Date(r.batch.expirationDate).getTime() <= nowTime,
      ).length,
    [rows, nowTime],
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
        <BatchStockTable
          rows={rows}
          filtered={filtered}
          pendingAlertsList={pendingAlertsList}
          available={available}
          expired={expired}
          pendingAlerts={pendingAlerts}
          query={q}
          busy={busy}
          canUpdate={canUpdate}
          canAdjust={canAdjust}
          onQueryChange={setQ}
          onResolveAlert={(alertId) => void resolveAlert(alertId)}
          onOpenAdjust={(row) => {
            setSelected(row);
            setModal("adjust");
          }}
          onOpenTransfer={(row) => {
            setSelected(row);
            setModal("transfer");
          }}
        />
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
