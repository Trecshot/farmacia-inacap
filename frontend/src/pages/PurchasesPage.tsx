import {
  Building2,
  PackageCheck,
  Plus,
  RefreshCcw,
  Search,
  ShoppingBag,
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

type Supplier = {
  id: string;
  businessName: string;
  rut: string;
  isActive: boolean;
};
type Product = {
  id: string;
  name: string;
  sku: string;
  isActive: boolean;
  purchasePrice?: number | string | null;
};
type Location = { id: string; name: string; isActive: boolean };
type Detail = {
  id: string;
  productId: string;
  quantityOrdered: number;
  quantityReceived: number;
  unitCost: number | string;
  product: Product;
};
type Order = {
  id: string;
  code: string;
  orderDate: string;
  expectedDate?: string | null;
  totalAmount: number | string;
  status: string;
  supplier: Supplier;
  details: Detail[];
};
type FormValues = Record<string, string | number | boolean>;

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});
const norm = (v: string) =>
  v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const supplierFields: ActionField[] = [
  { name: "rut", label: "RUT", required: true },
  { name: "businessName", label: "Razón social", required: true },
  { name: "tradeName", label: "Nombre fantasía" },
  { name: "contactName", label: "Contacto" },
  { name: "email", label: "Correo", type: "email" },
  { name: "phone", label: "Teléfono" },
  { name: "address", label: "Dirección" },
  { name: "commune", label: "Comuna" },
  { name: "region", label: "Región" },
];

const statusFields: ActionField[] = [
  {
    name: "status",
    label: "Estado",
    type: "select",
    required: true,
    options: ["DRAFT", "SENT", "CANCELLED"].map((v) => ({
      value: v,
      label: translateChoiceLabel(v),
    })),
  },
];

export const PurchasesPage = () => {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("purchases.create");
  const canReceive = hasPermission("purchases.receive");

  const [q, setQ] = useState("");
  const [modal, setModal] = useState<
    "order" | "supplier" | "status" | "receive" | null
  >(null);
  const [selected, setSelected] = useState<Order | null>(null);
  const [receiptCode, setReceiptCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  const orderSel = useCallback((p: { items: Order[] }) => p.items, []);
  const supSel = useCallback((p: { items: Supplier[] }) => p.items, []);
  const prodSel = useCallback((p: { items: Product[] }) => p.items, []);
  const locSel = useCallback((p: { locations: Location[] }) => p.locations, []);

  const ordersRes = useResource<Order[], { items: Order[] }>(
    "/purchases?limit=100",
    orderSel,
  );
  const suppliersRes = useResource<Supplier[], { items: Supplier[] }>(
    "/suppliers?limit=100",
    supSel,
  );
  const productsRes = useResource<Product[], { items: Product[] }>(
    "/products?limit=100",
    prodSel,
  );
  const locRes = useResource<Location[], { locations: Location[] }>(
    "/inventory/locations",
    locSel,
  );

  const orders = useMemo(() => ordersRes.data ?? [], [ordersRes.data]);
  const suppliers = useMemo(() => suppliersRes.data ?? [], [suppliersRes.data]);
  const products = useMemo(() => productsRes.data ?? [], [productsRes.data]);
  const locations = useMemo(() => locRes.data ?? [], [locRes.data]);

  const filtered = useMemo(
    () =>
      orders.filter(
        (o) =>
          !q ||
          norm(
            [o.code, o.supplier?.businessName ?? "", o.status].join(" "),
          ).includes(norm(q)),
      ),
    [orders, q],
  );

  const close = () => {
    setModal(null);
    setSelected(null);
    setActionError("");
  };

  const reload = async () => {
    await Promise.all([ordersRes.reload(), suppliersRes.reload()]);
  };

  const submit = async (v: FormValues) => {
    if (modal === "supplier") {
      await runApiAction(
        () =>
          api.post("/suppliers", {
            rut: String(v.rut),
            businessName: String(v.businessName),
            tradeName: nullable(v.tradeName),
            contactName: nullable(v.contactName),
            email: nullable(v.email),
            phone: nullable(v.phone),
            address: nullable(v.address),
            commune: nullable(v.commune),
            region: nullable(v.region),
            isActive: true,
          }),
        setBusy,
        setActionError,
        async () => {
          await suppliersRes.reload();
          close();
        },
      );
    }
    if (modal === "order") {
      await runApiAction(
        () =>
          api.post("/purchases", {
            code: String(v.code),
            supplierId: String(v.supplierId),
            expectedDate: nullable(v.expectedDate),
            notes: nullable(v.notes),
            taxRate: numeric(v.taxRate, 19),
            details: [
              {
                productId: String(v.productId),
                quantityOrdered: numeric(v.quantityOrdered),
                unitCost: numeric(v.unitCost),
              },
            ],
          }),
        setBusy,
        setActionError,
        async () => {
          await ordersRes.reload();
          close();
        },
      );
    }
    if (modal === "status" && selected) {
      await runApiAction(
        () =>
          api.patch(`/purchases/${selected.id}/status`, {
            status: String(v.status),
          }),
        setBusy,
        setActionError,
        async () => {
          await ordersRes.reload();
          close();
        },
      );
    }
    if (modal === "receive" && selected) {
      const items = selected.details
        .filter((d) => d.quantityOrdered > d.quantityReceived)
        .map((d) => ({
          productId: d.productId,
          batchNumber: String(v[`batch_${d.productId}`]),
          expirationDate: String(v[`expiry_${d.productId}`]),
          quantity: numeric(v[`qty_${d.productId}`]),
          purchasePrice: numeric(v[`price_${d.productId}`]),
          locationId: String(v[`loc_${d.productId}`]),
        }))
        .filter((i) => i.quantity > 0);
      await runApiAction(
        () =>
          api.post(`/purchases/${selected.id}/receive`, {
            code: String(v.code),
            notes: nullable(v.notes),
            items,
          }),
        setBusy,
        setActionError,
        async () => {
          await ordersRes.reload();
          close();
        },
      );
    }
  };

  const fields = useMemo<ActionField[]>(() => {
    if (modal === "supplier") return supplierFields;
    if (modal === "order") {
      return [
        { name: "code", label: "Código OC", required: true },
        {
          name: "supplierId",
          label: "Proveedor",
          type: "select",
          required: true,
          options: suppliers
            .filter((s) => s.isActive)
            .map((s) => ({ value: s.id, label: s.businessName })),
        },
        {
          name: "productId",
          label: "Producto",
          type: "select",
          required: true,
          options: products
            .filter((p) => p.isActive !== false)
            .map((p) => ({ value: p.id, label: `${p.sku} · ${p.name}` })),
        },
        {
          name: "quantityOrdered",
          label: "Cantidad",
          type: "number",
          min: 1,
          required: true,
        },
        {
          name: "unitCost",
          label: "Costo unitario",
          type: "number",
          min: 0,
          required: true,
        },
        {
          name: "taxRate",
          label: "IVA %",
          type: "number",
          min: 0,
          required: true,
        },
        { name: "expectedDate", label: "Fecha esperada", type: "date" },
        { name: "notes", label: "Notas", type: "textarea" },
      ];
    }
    if (modal === "status") return statusFields;
    if (modal === "receive" && selected) {
      const receiveFields: ActionField[] = [
        { name: "code", label: "Código recepción", required: true },
        { name: "notes", label: "Notas", type: "textarea" },
      ];
      selected.details
        .filter((d) => d.quantityOrdered > d.quantityReceived)
        .forEach((d) => {
          receiveFields.push(
            {
              name: `batch_${d.productId}`,
              label: `Lote · ${d.product.name}`,
              required: true,
            },
            {
              name: `expiry_${d.productId}`,
              label: `Vencimiento · ${d.product.name}`,
              type: "date",
              required: true,
            },
            {
              name: `qty_${d.productId}`,
              label: `Cantidad · saldo ${d.quantityOrdered - d.quantityReceived}`,
              type: "number",
              min: 1,
              required: true,
            },
            {
              name: `price_${d.productId}`,
              label: `Costo · ${d.product.name}`,
              type: "number",
              min: 0,
              required: true,
            },
            {
              name: `loc_${d.productId}`,
              label: `Ubicación · ${d.product.name}`,
              type: "select",
              required: true,
              options: locations
                .filter((l) => l.isActive)
                .map((l) => ({ value: l.id, label: l.name })),
            },
          );
        });
      return receiveFields;
    }
    return [];
  }, [modal, suppliers, products, selected, locations]);

  const initialValues = useMemo<Record<string, unknown>>(() => {
    if (modal === "order") return { taxRate: 19, quantityOrdered: 1 };
    if (modal === "receive") return { code: receiptCode };
    if (modal === "status" && selected) return { status: selected.status };
    return {};
  }, [modal, receiptCode, selected]);

  return (
    <div className="module-v2">
      <PageHeader
        eyebrow="Abastecimiento"
        title="Compras"
        description="Órdenes, proveedores y recepciones de mercadería."
        actions={
          <div className="module-toolbar-actions">
            <button
              className="button button--secondary"
              onClick={() => void reload()}
            >
              <RefreshCcw size={17} />
              Actualizar
            </button>
            {canCreate ? (
              <>
                <button
                  className="button button--secondary"
                  onClick={() => setModal("supplier")}
                >
                  <Building2 size={17} />
                  Nuevo proveedor
                </button>
                <button
                  className="button button--primary"
                  onClick={() => setModal("order")}
                >
                  <Plus size={17} />
                  Nueva orden
                </button>
              </>
            ) : null}
          </div>
        }
      />
      {ordersRes.loading ? <PageLoader /> : null}
      {ordersRes.error ||
      suppliersRes.error ||
      productsRes.error ||
      locRes.error ||
      actionError ? (
        <div className="alert alert--error">
          {ordersRes.error ||
            suppliersRes.error ||
            productsRes.error ||
            locRes.error ||
            actionError}
        </div>
      ) : null}
      {!ordersRes.loading ? (
        <>
          <section className="module-v2__kpis">
            <article className="module-kpi">
              <span className="module-kpi__icon module-kpi__icon--green">
                <ShoppingBag size={19} />
              </span>
              <div>
                <span>Órdenes</span>
                <strong>{orders.length}</strong>
                <small>Registradas</small>
              </div>
            </article>
            <article className="module-kpi">
              <span className="module-kpi__icon module-kpi__icon--amber">
                <PackageCheck size={19} />
              </span>
              <div>
                <span>Pendientes</span>
                <strong>
                  {
                    orders.filter(
                      (o) => !["RECEIVED", "CANCELLED"].includes(o.status),
                    ).length
                  }
                </strong>
                <small>Por recibir</small>
              </div>
            </article>
            <article className="module-kpi">
              <span className="module-kpi__icon module-kpi__icon--blue">
                <Building2 size={19} />
              </span>
              <div>
                <span>Proveedores</span>
                <strong>{suppliers.length}</strong>
                <small>Registrados</small>
              </div>
            </article>
            <article className="module-kpi">
              <span className="module-kpi__icon module-kpi__icon--violet">
                <ShoppingBag size={19} />
              </span>
              <div>
                <span>Total</span>
                <strong>
                  {clp.format(
                    orders.reduce((s, o) => s + Number(o.totalAmount), 0),
                  )}
                </strong>
                <small>Historial</small>
              </div>
            </article>
          </section>
          <section className="module-panel">
            <div className="module-panel__header module-panel__header--filters">
              <div>
                <span className="module-panel__eyebrow">Órdenes</span>
                <h2>Gestión de compras</h2>
              </div>
              <label className="module-search">
                <Search size={16} />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Orden o proveedor..."
                />
              </label>
            </div>
            {filtered.length ? (
              <ResponsiveTable
                rows={filtered}
                getKey={(r) => r.id}
                columns={[
                  {
                    key: "code",
                    header: "Orden",
                    render: (r) => (
                      <div className="cell-stack">
                        <strong>{r.code}</strong>
                        <span>
                          {new Date(r.orderDate).toLocaleDateString("es-CL")}
                        </span>
                      </div>
                    ),
                  },
                  {
                    key: "supplier",
                    header: "Proveedor",
                    render: (r) => r.supplier.businessName,
                  },
                  {
                    key: "total",
                    header: "Total",
                    render: (r) => clp.format(Number(r.totalAmount)),
                  },
                  {
                    key: "status",
                    header: "Estado",
                    render: (r) => <StatusBadge value={r.status} />,
                  },
                  {
                    key: "actions",
                    header: "Acciones",
                    render: (r) => {
                      const canReceiveOrder =
                        canReceive &&
                        !["RECEIVED", "CANCELLED"].includes(r.status);
                      if (!canCreate && !canReceiveOrder) {
                        return <span>—</span>;
                      }
                      return (
                        <div className="row-actions">
                          {canCreate ? (
                            <button
                              className="row-action"
                              onClick={() => {
                                setSelected(r);
                                setModal("status");
                              }}
                            >
                              Estado
                            </button>
                          ) : null}
                          {canReceiveOrder ? (
                            <button
                              className="row-action"
                              onClick={() => {
                                setSelected(r);
                                setReceiptCode(`REC-${Date.now()}`);
                                setModal("receive");
                              }}
                            >
                              Recepcionar
                            </button>
                          ) : null}
                        </div>
                      );
                    },
                  },
                ]}
              />
            ) : (
              <div className="module-empty">
                <span className="module-empty__icon">
                  <ShoppingBag size={27} />
                </span>
                <strong>Sin órdenes</strong>
                <p>Crea la primera orden de compra.</p>
              </div>
            )}
          </section>
        </>
      ) : null}
      <ActionModal
        open={Boolean(modal)}
        title={
          modal === "supplier"
            ? "Nuevo proveedor"
            : modal === "order"
              ? "Nueva orden de compra"
              : modal === "status"
                ? "Cambiar estado"
                : "Recepcionar orden"
        }
        fields={fields}
        initialValues={initialValues}
        busy={busy}
        error={actionError}
        onClose={close}
        onSubmit={submit}
      />
    </div>
  );
};
