import { useMemo } from "react";
import { ActionModal, type ActionField } from "../ui/ActionModal";
import { translateChoiceLabel } from "../../lib/choiceLabels";

export type PurchaseSupplier = {
  id: string;
  businessName: string;
  rut: string;
  isActive: boolean;
};

export type PurchaseProduct = {
  id: string;
  name: string;
  sku: string;
  isActive: boolean;
  purchasePrice?: number | string | null;
};

export type PurchaseLocation = {
  id: string;
  name: string;
  isActive: boolean;
};

export type PurchaseDetail = {
  id: string;
  productId: string;
  quantityOrdered: number;
  quantityReceived: number;
  unitCost: number | string;
  product: PurchaseProduct;
};

export type PurchaseOrderItem = {
  id: string;
  code: string;
  orderDate: string;
  expectedDate?: string | null;
  totalAmount: number | string;
  status: string;
  supplier: PurchaseSupplier;
  details: PurchaseDetail[];
};

export type PurchaseModalMode =
  | "order"
  | "supplier"
  | "status"
  | "receive"
  | null;

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

type Props = {
  mode: PurchaseModalMode;
  selected: PurchaseOrderItem | null;
  receiptCode: string;
  suppliers: PurchaseSupplier[];
  products: PurchaseProduct[];
  locations: PurchaseLocation[];
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (values: Record<string, string | number | boolean>) => void | Promise<void>;
};

export const PurchaseOrderForm = ({
  mode,
  selected,
  receiptCode,
  suppliers,
  products,
  locations,
  busy,
  error,
  onClose,
  onSubmit,
}: Props) => {
  const fields = useMemo<ActionField[]>(() => {
    if (mode === "supplier") return supplierFields;
    if (mode === "order") {
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
    if (mode === "status") return statusFields;
    if (mode === "receive" && selected) {
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
  }, [mode, suppliers, products, selected, locations]);

  const initialValues = useMemo<Record<string, unknown>>(() => {
    if (mode === "order") return { taxRate: 19, quantityOrdered: 1 };
    if (mode === "receive") return { code: receiptCode };
    if (mode === "status" && selected) return { status: selected.status };
    return {};
  }, [mode, receiptCode, selected]);

  return (
    <ActionModal
      open={Boolean(mode)}
      title={
        mode === "supplier"
          ? "Nuevo proveedor"
          : mode === "order"
            ? "Nueva orden de compra"
            : mode === "status"
              ? "Cambiar estado"
              : "Recepcionar orden"
      }
      fields={fields}
      initialValues={initialValues}
      busy={busy}
      error={error}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  );
};
