import { Barcode, Boxes, Plus, RefreshCcw, Search } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { PageLoader } from "../components/feedback/PageLoader";
import { ActionModal, type ActionField } from "../components/ui/ActionModal";
import { PageHeader } from "../components/ui/PageHeader";
import { ResponsiveTable } from "../components/ui/ResponsiveTable";
import { StatusBadge } from "../components/ui/StatusBadge";
import { useAuth } from "../context/AuthContext";
import { useResource } from "../hooks/useResource";
import {
  nullable,
  numeric,
  optionalNumeric,
  runApiAction,
} from "../lib/actionHelpers";
import { api, getApiErrorMessage } from "../lib/api";
import { translateChoiceLabel } from "../lib/choiceLabels";
import { clp, normalizeText } from "../lib/formatters";

type Basic = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  isActive: boolean;
};

type Product = {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  description?: string | null;
  productType: string;
  prescriptionType: string;
  controlledDrugType: string;
  requiresPrescription: boolean;
  isControlled: boolean;
  isCenabast: boolean;
  concentration?: string | null;
  pharmaceuticalForm?: string | null;
  presentation?: string | null;
  purchasePrice?: number | string | null;
  salePrice: number | string;
  minimumStock: number;
  categoryId?: string;
  laboratoryId?: string | null;
  isActive: boolean;
  category: Basic;
  laboratory: Basic | null;
};

type FormValues = Record<string, string | number | boolean>;

const categoryFields: ActionField[] = [
  { name: "code", label: "Código", required: true },
  { name: "name", label: "Nombre", required: true },
  { name: "description", label: "Descripción", type: "textarea" },
];

const defaultProductInitialValues = {
  productType: "MEDICINE",
  prescriptionType: "NONE",
  controlledDrugType: "NONE",
  minimumStock: 0,
  salePrice: 0,
  isActive: true,
  requiresPrescription: false,
  isControlled: false,
  isCenabast: false,
};

export const ProductsPage = () => {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("products.create");
  const canUpdate = hasPermission("products.update");
  const canDelete = hasPermission("products.delete");

  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [modal, setModal] = useState<"product" | "category" | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  const productSelector = useCallback(
    (p: { items: Product[] }) => p.items,
    [],
  );
  const basicSelector = useCallback((p: { items: Basic[] }) => p.items, []);

  const productsRes = useResource<Product[], { items: Product[] }>(
    "/products?limit=100",
    productSelector,
  );
  const categoriesRes = useResource<Basic[], { items: Basic[] }>(
    "/categories?limit=100",
    basicSelector,
  );
  const laboratoriesRes = useResource<Basic[], { items: Basic[] }>(
    "/laboratories?limit=100&active=true",
    basicSelector,
  );

  const products = useMemo(() => productsRes.data ?? [], [productsRes.data]);
  const categories = useMemo(
    () => categoriesRes.data ?? [],
    [categoriesRes.data],
  );
  const laboratories = useMemo(
    () => laboratoriesRes.data ?? [],
    [laboratoriesRes.data],
  );

  const activeCategories = useMemo(
    () => categories.filter((c) => c.isActive),
    [categories],
  );
  const activeLaboratories = useMemo(
    () => laboratories.filter((l) => l.isActive),
    [laboratories],
  );

  const filtered = useMemo(() => {
    const q = normalizeText(query);
    return products.filter((p) => {
      if (categoryFilter !== "ALL" && p.category?.id !== categoryFilter) {
        return false;
      }
      if (!q) return true;
      return normalizeText(
        [
          p.name,
          p.sku,
          p.barcode ?? "",
          p.category?.name ?? "",
          p.laboratory?.name ?? "",
        ].join(" "),
      ).includes(q);
    });
  }, [products, query, categoryFilter]);

  const productFields = useMemo<ActionField[]>(
    () => [
      { name: "sku", label: "SKU", required: true },
      { name: "barcode", label: "Código de barras" },
      { name: "name", label: "Nombre", required: true },
      {
        name: "productType",
        label: "Tipo",
        type: "select",
        required: true,
        options: [
          "MEDICINE",
          "MEDICAL_DEVICE",
          "HYGIENE",
          "PERSONAL_CARE",
          "SUPPLEMENT",
          "DERMOCOSMETIC",
          "OTHER",
        ].map((v) => ({ value: v, label: translateChoiceLabel(v) })),
      },
      {
        name: "categoryId",
        label: "Categoría",
        type: "select",
        required: true,
        options: activeCategories.map((v) => ({ value: v.id, label: v.name })),
      },
      {
        name: "laboratoryId",
        label: "Laboratorio",
        type: "select",
        options: activeLaboratories.map((v) => ({
          value: v.id,
          label: v.name,
        })),
      },
      {
        name: "salePrice",
        label: "Precio venta",
        type: "number",
        min: 0,
        required: true,
      },
      {
        name: "purchasePrice",
        label: "Precio compra",
        type: "number",
        min: 0,
      },
      {
        name: "minimumStock",
        label: "Stock mínimo",
        type: "number",
        min: 0,
        required: true,
      },
      {
        name: "prescriptionType",
        label: "Tipo receta",
        type: "select",
        options: ["NONE", "SIMPLE", "RETAINED", "CHECK", "BALANCE_CONTROL"].map(
          (v) => ({ value: v, label: translateChoiceLabel(v) }),
        ),
      },
      {
        name: "controlledDrugType",
        label: "Tipo controlado",
        type: "select",
        options: ["NONE", "PSYCHOTROPIC", "NARCOTIC"].map((v) => ({
          value: v,
          label: translateChoiceLabel(v),
        })),
      },
      { name: "concentration", label: "Concentración" },
      { name: "pharmaceuticalForm", label: "Forma farmacéutica" },
      { name: "presentation", label: "Presentación" },
      { name: "description", label: "Descripción", type: "textarea" },
      { name: "requiresPrescription", label: "Requiere receta", type: "checkbox" },
      { name: "isControlled", label: "Medicamento controlado", type: "checkbox" },
      { name: "isCenabast", label: "Producto Cenabast", type: "checkbox" },
      { name: "isActive", label: "Activo", type: "checkbox" },
    ],
    [activeCategories, activeLaboratories],
  );

  const close = () => {
    setModal(null);
    setEditing(null);
    setActionError("");
  };

  const saveProduct = async (v: FormValues) => {
    const basePayload = {
      sku: String(v.sku),
      barcode: nullable(v.barcode),
      name: String(v.name),
      description: nullable(v.description),
      productType: String(v.productType || "MEDICINE"),
      prescriptionType: String(v.prescriptionType || "NONE"),
      controlledDrugType: String(v.controlledDrugType || "NONE"),
      requiresPrescription: Boolean(v.requiresPrescription),
      isControlled: Boolean(v.isControlled),
      isCenabast: Boolean(v.isCenabast),
      concentration: nullable(v.concentration),
      pharmaceuticalForm: nullable(v.pharmaceuticalForm),
      presentation: nullable(v.presentation),
      purchasePrice: optionalNumeric(v.purchasePrice),
      salePrice: numeric(v.salePrice),
      minimumStock: numeric(v.minimumStock),
      categoryId: String(v.categoryId),
      laboratoryId: nullable(v.laboratoryId),
      isActive: Boolean(v.isActive),
    };

    await runApiAction(
      () =>
        editing
          ? api.patch(`/products/${editing.id}`, basePayload)
          : api.post("/products", { ...basePayload, activeIngredients: [] }),
      setBusy,
      setActionError,
      async () => {
        await productsRes.reload();
        close();
      },
    );
  };

  const saveBasic = async (v: FormValues) => {
    const payload = {
      code: String(v.code),
      name: String(v.name),
      description: nullable(v.description),
      isActive: true,
    };
    await runApiAction(
      () => api.post("/categories", payload),
      setBusy,
      setActionError,
      async () => {
        await Promise.all([productsRes.reload(), categoriesRes.reload()]);
        close();
      },
    );
  };

  const deleteProduct = async (product: Product) => {
    if (!window.confirm(`¿Eliminar o desactivar ${product.name}?`)) return;
    setActionError("");
    try {
      await api.delete(`/products/${product.id}`);
      await productsRes.reload();
    } catch (error: unknown) {
      setActionError(getApiErrorMessage(error));
    }
  };

  const initial = useMemo(
    () =>
      editing
        ? {
            ...editing,
            categoryId: editing.category?.id ?? editing.categoryId ?? "",
            laboratoryId: editing.laboratory?.id ?? editing.laboratoryId ?? "",
            purchasePrice: editing.purchasePrice ?? "",
            prescriptionType: editing.prescriptionType ?? "NONE",
            controlledDrugType: editing.controlledDrugType ?? "NONE",
          }
        : defaultProductInitialValues,
    [editing],
  );

  const combinedError =
    productsRes.error ||
    categoriesRes.error ||
    laboratoriesRes.error ||
    actionError;

  return (
    <div className="module-v2">
      <PageHeader
        eyebrow="Catálogo"
        title="Productos"
        description="Medicamentos, dispositivos e insumos comercializados."
        actions={
          <div className="module-toolbar-actions">
            <button
              className="button button--secondary"
              onClick={() => void productsRes.reload()}
            >
              <RefreshCcw size={17} />
              Actualizar
            </button>
            {canCreate ? (
              <>
                <button
                  className="button button--secondary"
                  onClick={() => setModal("category")}
                >
                  <Plus size={17} />
                  Categoría
                </button>
                <button
                  className="button button--primary"
                  onClick={() => {
                    setEditing(null);
                    setModal("product");
                  }}
                >
                  <Plus size={17} />
                  Nuevo producto
                </button>
              </>
            ) : null}
          </div>
        }
      />
      {productsRes.loading ? <PageLoader /> : null}
      {combinedError ? (
        <div className="alert alert--error">{combinedError}</div>
      ) : null}
      {!productsRes.loading ? (
        <>
          <section className="module-v2__kpis">
            <article className="module-kpi">
              <span className="module-kpi__icon module-kpi__icon--green">
                <Boxes size={19} />
              </span>
              <div>
                <span>Productos</span>
                <strong>{products.length}</strong>
                <small>Catálogo total</small>
              </div>
            </article>
            <article className="module-kpi">
              <span className="module-kpi__icon module-kpi__icon--blue">
                <Boxes size={19} />
              </span>
              <div>
                <span>Activos</span>
                <strong>{products.filter((p) => p.isActive).length}</strong>
                <small>Disponibles</small>
              </div>
            </article>
            <article className="module-kpi">
              <span className="module-kpi__icon module-kpi__icon--amber">
                <Boxes size={19} />
              </span>
              <div>
                <span>Con receta</span>
                <strong>
                  {products.filter((p) => p.requiresPrescription).length}
                </strong>
                <small>Prescripción</small>
              </div>
            </article>
            <article className="module-kpi">
              <span className="module-kpi__icon module-kpi__icon--danger">
                <Boxes size={19} />
              </span>
              <div>
                <span>Controlados</span>
                <strong>{products.filter((p) => p.isControlled).length}</strong>
                <small>Control especial</small>
              </div>
            </article>
          </section>
          <section className="module-panel">
            <div className="module-panel__header module-panel__header--filters">
              <div>
                <span className="module-panel__eyebrow">Catálogo</span>
                <h2>Productos registrados</h2>
              </div>
              <div className="module-filters module-filters--wide">
                <label className="module-search">
                  <Search size={16} />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Nombre, SKU o código..."
                  />
                  <Barcode size={16} />
                </label>
                <select
                  className="module-select"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                >
                  <option value="ALL">Todas las categorías</option>
                  {activeCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
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
                        <strong>{r.name}</strong>
                        <span>{r.sku}</span>
                      </div>
                    ),
                  },
                  {
                    key: "category",
                    header: "Categoría",
                    render: (r) => r.category?.name ?? "—",
                  },
                  {
                    key: "lab",
                    header: "Laboratorio",
                    render: (r) => r.laboratory?.name ?? "—",
                  },
                  {
                    key: "price",
                    header: "Precio",
                    render: (r) => clp.format(Number(r.salePrice)),
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
                                setModal("product");
                              }}
                            >
                              Editar
                            </button>
                          ) : null}
                          {canDelete ? (
                            <button
                              className="row-action row-action--danger"
                              onClick={() => void deleteProduct(r)}
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
                  <Boxes size={27} />
                </span>
                <strong>Catálogo vacío</strong>
                <p>Crea el primer producto para comenzar.</p>
              </div>
            )}
          </section>
        </>
      ) : null}

      <ActionModal
        open={modal === "product"}
        title={editing ? "Editar producto" : "Nuevo producto"}
        fields={productFields}
        initialValues={initial}
        busy={busy}
        error={actionError}
        onClose={close}
        onSubmit={saveProduct}
      />
      <ActionModal
        open={modal === "category"}
        title="Nueva categoría"
        fields={categoryFields}
        busy={busy}
        error={actionError}
        onClose={close}
        onSubmit={saveBasic}
      />
    </div>
  );
};
