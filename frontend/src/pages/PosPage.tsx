import {
  Barcode,
  ChevronRight,
  Minus,
  Pill,
  Plus,
  ReceiptText,
  Search,
  ShoppingCart,
  Trash2,
  UserRound,
  WalletCards,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ActionModal, type ActionField } from "../components/ui/ActionModal";
import { api, getApiErrorMessage } from "../lib/api";
import { nullable, numeric, runApiAction } from "../lib/actionHelpers";
import {
  getAvailableStockByProduct,
  type InventoryStockRow,
} from "../lib/posInventory";

type Product = {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  salePrice: string | number;
  requiresPrescription: boolean;
  isControlled: boolean;
  isActive: boolean;
  category?: { name: string } | null;
  laboratory?: { name: string } | null;
};
type CashSession = {
  id: string;
  status: string;
  cashRegister?: { name: string } | null;
};
type Patient = {
  id: string;
  rut: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
};
type RxItem = { id: string; productId: string; remainingQuantity: number };
type Rx = {
  id: string;
  status: string;
  expirationDate?: string | null;
  patientId: string;
  patient: Patient;
  items: RxItem[];
};
type CartItem = {
  product: Product;
  quantity: number;
  stock: number;
  maxQuantity: number;
  prescriptionItemId?: string | null;
};
type PosData = {
  products: Product[];
  stockRows: InventoryStockRow[];
  cashSessions: CashSession[];
  patients: Patient[];
  prescriptions: Rx[];
};
type ItemsResponse<T> = { items?: T[] };
type SessionsResponse = { sessions?: CashSession[] };
type CheckoutValues = Record<string, string | number | boolean>;

const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});
const norm = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

const checkoutFields: ActionField[] = [
  {
    name: "paymentMethod",
    label: "Medio de pago",
    type: "select",
    required: true,
    options: [
      { value: "CASH", label: "Efectivo" },
      { value: "DEBIT_CARD", label: "Débito" },
      { value: "CREDIT_CARD", label: "Crédito" },
      { value: "BANK_TRANSFER", label: "Transferencia" },
      { value: "OTHER", label: "Otro" },
    ],
  },
  {
    name: "taxDocumentType",
    label: "Documento",
    type: "select",
    required: true,
    options: [
      { value: "RECEIPT", label: "Boleta" },
      { value: "INVOICE", label: "Factura" },
    ],
  },
  { name: "referenceCode", label: "Referencia pago" },
  { name: "customerRut", label: "RUT cliente", hint: "Obligatorio para Factura" },
  { name: "customerName", label: "Nombre cliente" },
  {
    name: "customerBusinessName",
    label: "Razón social",
    hint: "Obligatorio para Factura",
  },
  {
    name: "customerBusinessActivity",
    label: "Giro",
    hint: "Obligatorio para Factura",
  },
  {
    name: "customerAddress",
    label: "Dirección",
    hint: "Obligatorio para Factura",
  },
  { name: "notes", label: "Notas", type: "textarea" },
];

export const PosPage = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [stockRows, setStockRows] = useState<InventoryStockRow[]>([]);
  const [cashSessions, setCashSessions] = useState<CashSession[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [prescriptions, setPrescriptions] = useState<Rx[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("TODAS");
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const fetchData = useCallback(async (): Promise<PosData> => {
    const [
      productsResponse,
      stockResponse,
      sessionsResponse,
      patientsResponse,
      prescriptionsResponse,
    ] = await Promise.all([
      api.get<ItemsResponse<Product>>("/products?limit=100"),
      api.get<ItemsResponse<InventoryStockRow>>("/inventory/stock?limit=100"),
      api.get<SessionsResponse>("/cash/sessions?limit=100"),
      api.get<ItemsResponse<Patient>>("/patients?limit=100&active=true"),
      api.get<ItemsResponse<Rx>>("/prescriptions?limit=100"),
    ]);

    return {
      products: productsResponse.data.items ?? [],
      stockRows: stockResponse.data.items ?? [],
      cashSessions: sessionsResponse.data.sessions ?? [],
      patients: patientsResponse.data.items ?? [],
      prescriptions: prescriptionsResponse.data.items ?? [],
    };
  }, []);

  const applyData = useCallback((data: PosData) => {
    setProducts(data.products);
    setStockRows(data.stockRows);
    setCashSessions(data.cashSessions);
    setPatients(data.patients);
    setPrescriptions(data.prescriptions);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      applyData(await fetchData());
    } catch (requestError) {
      setError(getApiErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [applyData, fetchData]);

  useEffect(() => {
    let active = true;

    void fetchData()
      .then((data) => {
        if (active) {
          applyData(data);
          setLoading(false);
        }
      })
      .catch((requestError: unknown) => {
        if (active) {
          setError(getApiErrorMessage(requestError));
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [applyData, fetchData]);

  const stockByProduct = useMemo(
    () => getAvailableStockByProduct(stockRows),
    [stockRows],
  );

  const categories = useMemo(
    () => [
      "TODAS",
      ...Array.from(
        new Set(
          products
            .map((product) => product.category?.name)
            .filter((name): name is string => Boolean(name)),
        ),
      ).sort((a, b) => a.localeCompare(b, "es")),
    ],
    [products],
  );
  const filtered = useMemo(
    () =>
      products.filter(
        (product) =>
          product.isActive &&
          (category === "TODAS" || product.category?.name === category) &&
          (!query ||
            norm(
              [
                product.name,
                product.sku,
                product.barcode ?? "",
                product.category?.name ?? "",
                product.laboratory?.name ?? "",
              ].join(" "),
            ).includes(norm(query))),
      ),
    [products, category, query],
  );
  const openCash =
    cashSessions.find((session) => session.status === "OPEN") ?? null;
  const selectedPatient =
    patients.find((patient) => patient.id === selectedPatientId) ?? null;
  const total = cart.reduce(
    (sum, item) => sum + Number(item.product.salePrice) * item.quantity,
    0,
  );
  const units = cart.reduce((sum, item) => sum + item.quantity, 0);
  const hasAvailableStock = products.some(
    (product) =>
      product.isActive && (stockByProduct.get(product.id) ?? 0) > 0,
  );

  const needsPrescription = (product: Product) =>
    product.requiresPrescription || product.isControlled;

  const findPrescriptionItem = (product: Product): RxItem | null | undefined => {
    if (!needsPrescription(product)) return null;
    if (!selectedPatientId) return undefined;

    const now = new Date().getTime();
    const prescription = prescriptions.find(
      (candidate) =>
        candidate.patientId === selectedPatientId &&
        ["ACTIVE", "PARTIALLY_DISPENSED"].includes(candidate.status) &&
        (!candidate.expirationDate ||
          new Date(candidate.expirationDate).getTime() > now) &&
        candidate.items.some(
          (item) =>
            item.productId === product.id && item.remainingQuantity > 0,
        ),
    );
    return (
      prescription?.items.find(
        (item) => item.productId === product.id && item.remainingQuantity > 0,
      ) ?? undefined
    );
  };

  const add = (product: Product) => {
    const stock = stockByProduct.get(product.id) ?? 0;
    if (stock <= 0) return;

    const requiresRx = needsPrescription(product);
    const prescriptionItem = findPrescriptionItem(product);
    if (requiresRx && !prescriptionItem) {
      setError(
        selectedPatientId
          ? "El paciente no tiene una receta vigente con saldo para este producto."
          : "Selecciona un paciente antes de agregar medicamentos con receta o controlados.",
      );
      return;
    }

    const maxQuantity = prescriptionItem
      ? Math.min(stock, prescriptionItem.remainingQuantity)
      : stock;

    if (maxQuantity <= 0) return;

    setError("");
    setCart((current) => {
      const existing = current.find((item) => item.product.id === product.id);
      if (existing) {
        return current.map((item) =>
          item.product.id === product.id
            ? {
                ...item,
                stock,
                maxQuantity,
                quantity: Math.min(item.quantity + 1, maxQuantity),
                prescriptionItemId:
                  prescriptionItem?.id ?? item.prescriptionItemId,
              }
            : item,
        );
      }

      return [
        ...current,
        {
          product,
          quantity: 1,
          stock,
          maxQuantity,
          prescriptionItemId: prescriptionItem?.id ?? null,
        },
      ];
    });
  };

  const updateQuantity = (productId: string, quantity: number) =>
    setCart((current) =>
      current
        .map((item) => {
          if (item.product.id !== productId) return item;
          const rxItem = findPrescriptionItem(item.product);
          const maxQuantity = rxItem
            ? Math.min(item.stock, rxItem.remainingQuantity)
            : item.maxQuantity;

          return {
            ...item,
            maxQuantity,
            quantity: Math.min(Math.max(quantity, 0), maxQuantity),
          };
        })
        .filter((item) => item.quantity > 0),
    );

  const checkoutInitialValues = useMemo(
    () => ({
      paymentMethod: "CASH",
      taxDocumentType: "RECEIPT",
      customerRut: selectedPatient?.rut ?? "",
      customerName: selectedPatient
        ? `${selectedPatient.firstName} ${selectedPatient.lastName}`
        : "",
    }),
    [selectedPatient],
  );

  const checkout = async (values: CheckoutValues) => {
    if (!openCash) {
      setError("Debes abrir una caja antes de cobrar.");
      return;
    }

    const taxDocumentType = String(values.taxDocumentType);
    const customerRut =
      nullable(values.customerRut) || selectedPatient?.rut || null;
    const customerBusinessName = nullable(values.customerBusinessName);
    const customerBusinessActivity = nullable(values.customerBusinessActivity);
    const customerAddress = nullable(values.customerAddress);

    if (
      taxDocumentType === "INVOICE" &&
      (!customerRut ||
        !customerBusinessName ||
        !customerBusinessActivity ||
        !customerAddress)
    ) {
      setError(
        "Para emitir factura debes completar RUT cliente, razón social, giro y dirección.",
      );
      return;
    }

    await runApiAction(
      () =>
        api.post("/sales/checkout", {
          code: `VTA-${Date.now()}`,
          cashSessionId: openCash.id,
          patientId: selectedPatientId || null,
          customerRut,
          customerName:
            nullable(values.customerName) ||
            (selectedPatient
              ? `${selectedPatient.firstName} ${selectedPatient.lastName}`
              : null),
          customerBusinessName,
          customerBusinessActivity,
          customerAddress,
          notes: nullable(values.notes),
          taxRate: 19,
          taxDocumentType,
          items: cart.map((item) => ({
            productId: item.product.id,
            quantity: item.quantity,
            discountAmount: 0,
            prescriptionItemId: item.prescriptionItemId ?? null,
            locationId: null,
          })),
          payments: [
            {
              method: String(values.paymentMethod),
              amount: numeric(total),
              referenceCode: nullable(values.referenceCode),
            },
          ],
        }),
      setBusy,
      setError,
      async () => {
        setCart([]);
        setCheckoutOpen(false);
        await load();
      },
    );
  };

  return (
    <div className="pos-v2">
      <header className="pos-v2__header">
        <div>
          <span className="pos-v2__eyebrow">Punto de venta</span>
          <h1>POS</h1>
          <p>Venta rápida con inventario por lote, receta y control FEFO.</p>
        </div>
        <div
          className={`pos-v2__cash ${openCash ? "pos-v2__cash--open" : ""}`}
        >
          <WalletCards size={17} />
          <div>
            <span>Estado de caja</span>
            <strong>
              {openCash
                ? (openCash.cashRegister?.name ?? "Caja abierta")
                : "Sin caja abierta"}
            </strong>
          </div>
        </div>
      </header>

      {error ? <div className="alert alert--error">{error}</div> : null}

      {!loading && (!openCash || !hasAvailableStock) ? (
        <div className="alert" role="status">
          <strong>Antes de vender:</strong>{" "}
          {!openCash ? "abre una caja. " : ""}
          {!hasAvailableStock
            ? "recibe una compra con lote y cantidad para habilitar productos. "
            : ""}
          <span>
            {!openCash ? <Link to="/cash">Ir a Control de caja</Link> : null}
            {!openCash && !hasAvailableStock ? " · " : null}
            {!hasAvailableStock ? (
              <Link to="/purchases">Ir a Compras</Link>
            ) : null}
          </span>
        </div>
      ) : null}

      <section className="pos-v2__layout">
        <div className="pos-v2__catalog">
          <div className="pos-v2__toolbar">
            <div className="pos-v2__search">
              <Search size={18} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar producto, SKU o código de barras..."
              />
              <span className="pos-v2__search-code">
                <Barcode size={18} />
              </span>
            </div>
            <div className="pos-v2__category-scroll">
              {categories.map((item) => (
                <button
                  key={item}
                  className={`pos-v2__category ${
                    category === item ? "pos-v2__category--active" : ""
                  }`}
                  onClick={() => setCategory(item)}
                >
                  {item === "TODAS" ? "Todos" : item}
                </button>
              ))}
            </div>
          </div>

          <div className="pos-v2__catalog-heading">
            <div>
              <h2>Productos</h2>
              <span>{filtered.length} disponibles</span>
            </div>
            <button className="pos-v2__reload" onClick={() => void load()}>
              Actualizar
            </button>
          </div>

          {loading ? (
            <div className="pos-v2__loading">Cargando...</div>
          ) : (
            <div className="pos-v2__products">
              {filtered.map((product) => {
                const stock = stockByProduct.get(product.id) ?? 0;
                return (
                  <article
                    className={`pos-product ${
                      stock <= 0 ? "pos-product--out" : ""
                    }`}
                    key={product.id}
                  >
                    <div className="pos-product__top">
                      <div className="pos-product__icon">
                        <Pill size={21} />
                      </div>
                      <div className="pos-product__badges">
                        {product.isControlled ? (
                          <span className="pos-product__badge pos-product__badge--controlled">
                            Controlado
                          </span>
                        ) : product.requiresPrescription ? (
                          <span className="pos-product__badge pos-product__badge--rx">
                            Receta
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="pos-product__body">
                      <span className="pos-product__category">
                        {product.category?.name ?? "Producto"}
                      </span>
                      <h3>{product.name}</h3>
                      <small>{product.laboratory?.name ?? product.sku}</small>
                    </div>
                    <div className="pos-product__meta">
                      <div>
                        <span>Stock</span>
                        <strong>{stock}</strong>
                      </div>
                      <strong className="pos-product__price">
                        {clp.format(Number(product.salePrice))}
                      </strong>
                    </div>
                    <button
                      className="pos-product__add"
                      disabled={stock <= 0}
                      onClick={() => add(product)}
                    >
                      <Plus size={16} />
                      {stock <= 0 ? "Sin stock" : "Agregar"}
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <aside className="pos-v2__cart">
          <div className="pos-v2__cart-header">
            <div>
              <span className="pos-v2__eyebrow">Venta actual</span>
              <h2>Resumen</h2>
            </div>
            <div className="pos-v2__cart-count">
              <ShoppingCart size={16} />
              <span>{units}</span>
            </div>
          </div>
          <label className="pos-v2__customer">
            <span className="pos-v2__customer-icon">
              <UserRound size={17} />
            </span>
            <div>
              <strong>
                {selectedPatient
                  ? `${selectedPatient.firstName} ${selectedPatient.lastName}`
                  : "Venta directa"}
              </strong>
              <span>
                {selectedPatient ? selectedPatient.rut : "Seleccionar paciente"}
              </span>
            </div>
            <select
              value={selectedPatientId}
              onChange={(event) => {
                setSelectedPatientId(event.target.value);
                setCart([]);
              }}
            >
              <option value="">Venta directa</option>
              {patients.map((patient) => (
                <option value={patient.id} key={patient.id}>
                  {patient.rut} · {patient.firstName} {patient.lastName}
                </option>
              ))}
            </select>
          </label>

          <div className="pos-v2__cart-items">
            {cart.length ? (
              cart.map((item) => (
                <div className="pos-cart-item" key={item.product.id}>
                  <div className="pos-cart-item__main">
                    <div className="pos-cart-item__icon">
                      <Pill size={17} />
                    </div>
                    <div className="pos-cart-item__info">
                      <strong>{item.product.name}</strong>
                      <span>
                        {clp.format(Number(item.product.salePrice))} c/u
                      </span>
                    </div>
                    <button
                      className="pos-cart-item__remove"
                      onClick={() =>
                        setCart((current) =>
                          current.filter(
                            (candidate) =>
                              candidate.product.id !== item.product.id,
                          ),
                        )
                      }
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <div className="pos-cart-item__bottom">
                    <div className="pos-quantity">
                      <button
                        onClick={() =>
                          updateQuantity(item.product.id, item.quantity - 1)
                        }
                      >
                        <Minus size={14} />
                      </button>
                      <strong>{item.quantity}</strong>
                      <button
                        onClick={() =>
                          updateQuantity(item.product.id, item.quantity + 1)
                        }
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    <strong>
                      {clp.format(
                        Number(item.product.salePrice) * item.quantity,
                      )}
                    </strong>
                  </div>
                </div>
              ))
            ) : (
              <div className="pos-v2__cart-empty">
                <div>
                  <ShoppingCart size={26} />
                </div>
                <strong>Tu venta está vacía</strong>
                <span>Selecciona productos para comenzar.</span>
              </div>
            )}
          </div>

          <div className="pos-v2__cart-footer">
            <div className="pos-v2__totals">
              <div>
                <span>Productos</span>
                <strong>{units}</strong>
              </div>
              <div className="pos-v2__total">
                <span>Total</span>
                <strong>{clp.format(total)}</strong>
              </div>
            </div>
            <button
              className="pos-v2__checkout"
              disabled={!cart.length || !openCash}
              onClick={() => setCheckoutOpen(true)}
            >
              <ReceiptText size={18} />
              <span>
                {openCash ? "Continuar al pago" : "Abrir caja para cobrar"}
              </span>
              <ChevronRight size={17} />
            </button>
          </div>
        </aside>
      </section>

      <ActionModal
        open={checkoutOpen}
        title="Finalizar venta"
        description={`Total a pagar: ${clp.format(total)}`}
        fields={checkoutFields}
        initialValues={checkoutInitialValues}
        busy={busy}
        error={error}
        onClose={() => setCheckoutOpen(false)}
        onSubmit={checkout}
      />
    </div>
  );
};
