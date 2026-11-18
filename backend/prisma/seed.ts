import "dotenv/config";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

import { PrismaClient } from "../generated/prisma/client.js";
import { normalizeRut } from "../src/utils/rut.js";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL no está definida");
}

const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ============================================================================
// 1. ROLES Y PERMISOS
// ============================================================================

const roles = [
  { code: "ADMIN", name: "Administrador", description: "Acceso total al sistema", isSystem: true },
  { code: "VENDEDOR", name: "Vendedor / Cajero", description: "Ventas de mostrador, apertura/cierre de caja y clientes", isSystem: true },
  { code: "BODEGUERO", name: "Bodeguero / Logística", description: "Recepción de órdenes de compra, control de lotes y existencias", isSystem: true },
  { code: "TECNICO_FARMACIA", name: "Técnico en Farmacia", description: "Dispensación de recetas, control de stock y atención asistencial", isSystem: true },
  { code: "QUIMICO_FARMACEUTICO", name: "Químico Farmacéutico (DT)", description: "Dirección técnica, supervisión de controlados y auditoría sanitaria", isSystem: true },
];

const permissions = [
  ["users.read", "Ver usuarios", "users", "read"],
  ["users.create", "Crear usuarios", "users", "create"],
  ["users.update", "Editar usuarios", "users", "update"],
  ["users.delete", "Eliminar usuarios", "users", "delete"],

  ["products.read", "Ver productos", "products", "read"],
  ["products.create", "Crear productos", "products", "create"],
  ["products.update", "Editar productos", "products", "update"],
  ["products.delete", "Eliminar productos", "products", "delete"],

  ["inventory.read", "Ver inventario", "inventory", "read"],
  ["inventory.create", "Registrar inventario", "inventory", "create"],
  ["inventory.update", "Modificar inventario", "inventory", "update"],
  ["inventory.adjust", "Ajustar inventario", "inventory", "adjust"],

  ["purchases.read", "Ver compras", "purchases", "read"],
  ["purchases.create", "Crear compras", "purchases", "create"],
  ["purchases.receive", "Recepcionar compras", "purchases", "receive"],

  ["sales.read", "Ver ventas", "sales", "read"],
  ["sales.create", "Crear ventas", "sales", "create"],
  ["sales.cancel", "Anular ventas", "sales", "cancel"],

  ["cash.read", "Ver caja", "cash", "read"],
  ["cash.open", "Abrir caja", "cash", "open"],
  ["cash.close", "Cerrar caja", "cash", "close"],
  ["cash.adjust", "Ajustar caja", "cash", "adjust"],

  ["patients.read", "Ver pacientes", "patients", "read"],
  ["patients.create", "Crear pacientes", "patients", "create"],
  ["patients.update", "Editar pacientes", "patients", "update"],
  ["patients.delete", "Eliminar pacientes", "patients", "delete"],

  ["doctors.read", "Ver médicos", "doctors", "read"],
  ["doctors.create", "Crear médicos", "doctors", "create"],
  ["doctors.update", "Editar médicos", "doctors", "update"],
  ["doctors.delete", "Eliminar médicos", "doctors", "delete"],

  ["prescriptions.read", "Ver recetas", "prescriptions", "read"],
  ["prescriptions.create", "Registrar recetas", "prescriptions", "create"],
  ["prescriptions.dispense", "Dispensar recetas", "prescriptions", "dispense"],
  ["prescriptions.cancel", "Cancelar recetas", "prescriptions", "cancel"],

  ["controlled.read", "Ver controlados", "controlled", "read"],
  ["controlled.manage", "Gestionar controlados", "controlled", "manage"],

  ["agreements.read", "Ver convenios", "agreements", "read"],
  ["agreements.manage", "Gestionar convenios", "agreements", "manage"],

  ["reports.read", "Ver reportes", "reports", "read"],
  ["reports.export", "Exportar reportes", "reports", "export"],

  ["audit.read", "Ver auditoría", "audit", "read"],
  ["settings.manage", "Gestionar configuración", "settings", "manage"],
] as const;

const rolePermissionMap: Record<string, string[]> = {
  ADMIN: permissions.map(([code]) => code),

  VENDEDOR: [
    "products.read",
    "inventory.read",
    "sales.read",
    "sales.create",
    "cash.read",
    "cash.open",
    "cash.close",
    "patients.read",
    "patients.create",
    "patients.update",
    "doctors.read",
    "prescriptions.read",
  ],

  BODEGUERO: [
    "products.read",
    "inventory.read",
    "inventory.create",
    "inventory.update",
    "purchases.read",
    "purchases.receive",
    "reports.read",
  ],

  TECNICO_FARMACIA: [
    "products.read",
    "products.create",
    "inventory.read",
    "inventory.create",
    "inventory.update",
    "purchases.read",
    "patients.read",
    "patients.create",
    "patients.update",
    "doctors.read",
    "doctors.create",
    "prescriptions.read",
    "prescriptions.create",
    "prescriptions.dispense",
    "controlled.read",
  ],

  QUIMICO_FARMACEUTICO: [
    "products.read",
    "products.create",
    "products.update",
    "inventory.read",
    "inventory.create",
    "inventory.update",
    "inventory.adjust",
    "purchases.read",
    "purchases.create",
    "purchases.receive",
    "patients.read",
    "patients.create",
    "patients.update",
    "doctors.read",
    "doctors.create",
    "doctors.update",
    "doctors.delete",
    "prescriptions.read",
    "prescriptions.create",
    "prescriptions.dispense",
    "prescriptions.cancel",
    "controlled.read",
    "controlled.manage",
    "reports.read",
    "reports.export",
    "audit.read",
  ],
};

// ============================================================================
// 2. MAESTROS BASE
// ============================================================================

const inventoryLocations = [
  ["BOD-PRINCIPAL", "Bodega Principal", "WAREHOUSE"],
  ["VITRINA", "Vitrina / Sala de Ventas", "DISPLAY"],
  ["REFRIGERADOS", "Cadena de Frío (2°C a 8°C)", "REFRIGERATED"],
  ["CONTROLADOS", "Estante Bajo Llave - Psicotrópicos", "CONTROLLED"],
  ["CUARENTENA", "Área de Cuarentena y Devoluciones", "QUARANTINE"],
] as const;

const categories = [
  ["MEDICAMENTOS", "Medicamentos"],
  ["DISPOSITIVOS", "Dispositivos Médicos"],
  ["HIGIENE", "Higiene y Desinfección"],
  ["CUIDADO_PERSONAL", "Cuidado Personal"],
  ["SUPLEMENTOS", "Vitaminas y Suplementos"],
  ["DERMOCOSMETICA", "Dermocosmética"],
  ["OTROS", "Otros Insumos"],
] as const;

const laboratories = [
  ["CHILE_TEVAPHARM", "Laboratorio Chile | Teva"],
  ["ANDROMACO", "Laboratorios Andrómaco"],
  ["BAGO", "Laboratorios Bagó de Chile"],
  ["SAVAL", "Laboratorios Saval"],
  ["RECALCINE", "Corporación Farmacéutica Recalcine"],
  ["PASTEUR", "Laboratorio Pasteur"],
  ["MINTLAB", "Mintlab Farmacéutica"],
  ["ROCHE", "F. Hoffmann-La Roche"],
  ["BAYER", "Bayer Chile"],
  ["ABBOTT", "Abbott Laboratories"],
  ["EUROFARMA", "Eurofarma Chile"],
  ["GLAXOSMITHKLINE", "GlaxoSmithKline Chile (GSK)"],
  ["PFIZER", "Pfizer Chile"],
  ["NOVARTIS", "Novartis Chile"],
  ["MSD", "Merck Sharp & Dohme (MSD)"],
  ["MERCK", "Merck S.A."],
  ["SANOFI", "Sanofi Aventis"],
  ["BOEHRINGER_INGELHEIM", "Boehringer Ingelheim"],
  ["SANDERSON", "Laboratorios Sanderson (Fresenius Kabi)"],
  ["KNOP", "Laboratorios Knop"],
  ["MAVER", "Laboratorios Maver"],
  ["PRATER", "Laboratorios Prater"],
  ["OPKO", "Opko Chile"],
  ["TECNOFARMA", "Tecnofarma"],
  ["ASTRAZENECA", "AstraZeneca"],
  ["JANSSEN", "Janssen Pharmaceuticals"],
  ["GRUNENTHAL", "Grünenthal Chilena"],
  ["PHARMA_INVESTI", "Pharma Investi"],
  ["ITF_LABOMED", "ITF Labomed"],
  ["TECNOQUIMICAS", "Tecnoquímicas"],
] as const;

const activeIngredients = [
  { code: "PARACETAMOL", name: "Paracetamol", description: "Analgésico y antipirético no opiáceo de acción central" },
  { code: "IBUPROFENO", name: "Ibuprofeno", description: "Antiinflamatorio no esteroidal (AINE) derivado del ácido propiónico" },
  { code: "AMOXICILINA", name: "Amoxicilina", description: "Antibiótico bactericida betalactámico de amplio espectro" },
  { code: "CLAVULANICO", name: "Ácido Clavulánico", description: "Inhibidor de betalactamasas para potenciar antibióticos" },
  { code: "LORATADINA", name: "Loratadina", description: "Antihistamínico no sedante antagonista H1 de segunda generación" },
  { code: "OMEPRAZOL", name: "Omeprazol", description: "Inhibidor selectivo e irreversible de la bomba de protones gástrica" },
  { code: "LOSARTAN", name: "Losartán Potásico", description: "Antihipertensivo antagonista de los receptores de angiotensina II (ARA-II)" },
  { code: "METFORMINA", name: "Metformina Clorhidrato", description: "Normoglicemiante oral del grupo de las biguanidas" },
  { code: "ATORVASTATINA", name: "Atorvastatina Cálcica", description: "Hipolipemiante inhibidor de la HMG-CoA reductasa" },
  { code: "SALBUTAMOL", name: "Salbutamol Sulfato", description: "Broncodilatador agonista selectivo de receptores beta-2 adrenérgicos" },
  { code: "KETOROLACO", name: "Ketorolaco Trometamol", description: "Analgésico AINE potente para manejo de dolor moderado a severo" },
  { code: "TRAMADOL", name: "Tramadol Clorhidrato", description: "Analgésico opioide de acción central de intensidad moderada" },
  { code: "CLONAZEPAM", name: "Clonazepam", description: "Benzodiacepina de alta potencia. Psicotrópico sujeto a control legal (Lista IV)" },
  { code: "ALPRAZOLAM", name: "Alprazolam", description: "Ansiolítico benzodiacepínico. Psicotrópico sujeto a control legal (Lista IV)" },
  { code: "CLORFENAMINA", name: "Clorfenamina Maleato", description: "Antihistamínico clásico antagonista de receptores H1 de primera generación" },
];

const suppliers = [
  {
    rut: "76.123.456-0",
    businessName: "Droguería Central de Chile S.A.",
    tradeName: "Droguería Central",
    contactName: "Roberto González Larraín",
    email: "ventas@drogueriacentral.cl",
    phone: "+56 2 2345 6789",
    address: "Av. Las Industrias 1234",
    commune: "San Joaquín",
    region: "Metropolitana",
  },
  {
    rut: "76.999.888-8",
    businessName: "Droguería Difarma SpA",
    tradeName: "Difarma Logística Farmacéutica",
    contactName: "Andrea Muñoz Pavez",
    email: "pedidos@difarma.cl",
    phone: "+56 2 2987 6543",
    address: "Camino Melipilla 4500",
    commune: "Maipú",
    region: "Metropolitana",
  },
  {
    rut: "61.602.000-5",
    businessName: "Central de Abastecimiento del Sistema Nacional de Servicios de Salud (CENABAST)",
    tradeName: "CENABAST",
    contactName: "Unidad Farmacias Comunitarias",
    email: "farmaciascomunitarias@cenabast.cl",
    phone: "+56 2 2574 8000",
    address: "Av. Portales 3680",
    commune: "Estación Central",
    region: "Metropolitana",
  },
  {
    rut: "77.654.321-7",
    businessName: "Novofarma Solutions S.A.",
    tradeName: "Novofarma Operador Logístico",
    contactName: "Felipe Saavedra Cruz",
    email: "contacto@novofarma.cl",
    phone: "+56 2 2890 1200",
    address: "Parque Industrial ENEA, Los Maitenes 1500",
    commune: "Pudahuel",
    region: "Metropolitana",
  },
];

const agreements = [
  {
    code: "FONASA-MLE",
    name: "Fondo Nacional de Salud (FONASA)",
    type: "INSTITUTIONAL" as const,
    rut: "61.606.400-2",
    description: "Convenio Modalidad Libre Elección para asegurados de tramos B, C y D con aranceles y descuentos preferenciales",
    plans: [
      { code: "FONASA-GEN", name: "Copago Preferente Medicamentos Esenciales", description: "Descuento institucional en genéricos y bioequivalentes" },
    ],
  },
  {
    code: "ISAPRE-COLMENA",
    name: "Isapre Colmena Golden Cross",
    type: "ISAPRE" as const,
    rut: "96.565.410-0",
    description: "Cobertura complementaria ambulatoria en farmacias en convenio a nivel nacional",
    plans: [
      { code: "COLMENA-PREF", name: "Plan Preferente Farma 25%", description: "25% de cobertura directa en mostrador para medicamentos de uso crónico y agudo" },
    ],
  },
  {
    code: "ISAPRE-BANMEDICA",
    name: "Isapre Banmédica",
    type: "ISAPRE" as const,
    rut: "96.525.000-K",
    description: "Beneficio farmacia con validación en línea de excedentes y bonificación de medicamentos",
    plans: [
      { code: "BANMEDICA-SALUD", name: "Plan Salud Total Farma", description: "Bonificación en recetas médicas ambulatorias" },
    ],
  },
  {
    code: "ISAPRE-CONSALUD",
    name: "Isapre Consalud",
    type: "ISAPRE" as const,
    rut: "96.509.340-0",
    description: "Red de farmacias asociadas para el surtimiento de recetas y patologías GES",
    plans: [
      { code: "CONSALUD-MAS", name: "Plan Más Salud en Medicamentos", description: "Cobertura directa en patologías crónicas y genéricos" },
    ],
  },
  {
    code: "LEY-CENABAST",
    name: "Convenio Ley Cenabast para Farmacias Privadas",
    type: "CENABAST" as const,
    rut: "61.602.000-5",
    description: "Intermediación de la Ley 21.198 para expender medicamentos a la población con precio máximo fijado por decreto",
    plans: [
      { code: "CENABAST-MAX", name: "Precio Máximo Regulado al Público", description: "Venta garantizada con techo máximo fijado por CENABAST" },
    ],
  },
];

const cashRegisters = [
  {
    code: "CAJA-01",
    name: "Caja Mostrador 1 (Principal)",
    description: "Terminal POS principal con lector de código de barras e impresora térmica para boletas y facturas",
  },
  {
    code: "CAJA-02",
    name: "Caja Mostrador 2 (Rápida)",
    description: "Terminal para atención de convenios, recetas crónicas y retiro rápido",
  },
];

async function main() {
  console.log("================================================================");
  console.log(" FARMA-GESTION: REPOBLACION REALISTA DE DATOS (1 MES DE OPERACION)");
  console.log("================================================================");

  // --------------------------------------------------------------------------
  // 1. LIMPIEZA ORDENADA DE TRANSACCIONES DINAMICAS PREVIAS
  // --------------------------------------------------------------------------
  console.log("\n[1/8] Limpiando registros dinamicos de prueba previos...");
  await prisma.saleCoverage.deleteMany();
  await prisma.taxDocument.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.saleItemBatch.deleteMany();
  await prisma.saleItem.deleteMany();
  await prisma.sale.deleteMany();

  await prisma.cashMovement.deleteMany();
  await prisma.cashSession.deleteMany();

  await prisma.controlledDrugRecord.deleteMany();
  await prisma.dispensationItem.deleteMany();
  await prisma.dispensation.deleteMany();
  await prisma.prescriptionItem.deleteMany();
  await prisma.prescription.deleteMany();

  await prisma.inventoryMovement.deleteMany();
  await prisma.inventoryStock.deleteMany();
  await prisma.purchaseReceipt.deleteMany();
  await prisma.purchaseOrderDetail.deleteMany();
  await prisma.purchaseOrder.deleteMany();
  await prisma.batch.deleteMany();

  await prisma.patientCoverage.deleteMany();
  await prisma.agreementBenefit.deleteMany();
  await prisma.agreementPlan.deleteMany();
  await prisma.agreement.deleteMany();

  await prisma.productActiveIngredient.deleteMany();
  await prisma.alert.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.product.deleteMany();
  await prisma.activeIngredient.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.cashRegister.deleteMany();
  await prisma.doctor.deleteMany();
  await prisma.patient.deleteMany();

  // --------------------------------------------------------------------------
  // 2. ROLES, PERMISOS Y USUARIOS
  // --------------------------------------------------------------------------
  console.log("[2/8] Configurando roles, permisos y personal de la farmacia...");
  for (const role of roles) {
    await prisma.role.upsert({
      where: { code: role.code },
      update: role,
      create: role,
    });
  }

  for (const [code, name, module, action] of permissions) {
    await prisma.permission.upsert({
      where: { code },
      update: { name, module, action, isActive: true },
      create: { code, name, module, action, isActive: true },
    });
  }

  const allRoles = await prisma.role.findMany();
  const allPermissions = await prisma.permission.findMany();

  const roleByCode = new Map(allRoles.map((role) => [role.code, role]));
  const permissionByCode = new Map(allPermissions.map((permission) => [permission.code, permission]));

  for (const [roleCode, permissionCodes] of Object.entries(rolePermissionMap)) {
    const role = roleByCode.get(roleCode);
    if (!role) continue;

    for (const permissionCode of permissionCodes) {
      const permission = permissionByCode.get(permissionCode);
      if (!permission) continue;

      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: role.id, permissionId: permission.id },
        },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
  }

  const seedPassword = process.env.ADMIN_PASSWORD?.trim();
  if (!seedPassword || seedPassword.length < 8) {
    throw new Error(
      "ADMIN_PASSWORD debe estar definida en las variables de entorno con al menos 8 caracteres para ejecutar seed",
    );
  }
  const defaultPasswordHash = await bcrypt.hash(seedPassword, 12);

  // Usuarios del equipo de farmacia
  const usersToSeed = [
    {
      username: "admin",
      rut: "11.111.111-1",
      firstName: "Administrador",
      lastName: "General",
      email: "admin@farmaciainacap.cl",
      phone: "+56 9 1111 2222",
      roleCode: "ADMIN",
    },
    {
      username: "qf_valeria",
      rut: "14.234.567-6",
      firstName: "Valeria",
      lastName: "Tapia Castillo",
      email: "valeria.tapia@farmaciainacap.cl",
      phone: "+56 9 8234 5678",
      roleCode: "QUIMICO_FARMACEUTICO",
    },
    {
      username: "vendedor_diego",
      rut: "18.901.234-9",
      firstName: "Diego",
      lastName: "Carrasco Morales",
      email: "diego.carrasco@farmaciainacap.cl",
      phone: "+56 9 7654 3210",
      roleCode: "VENDEDOR",
    },
    {
      username: "bodeguero_mateo",
      rut: "17.890.123-0",
      firstName: "Mateo",
      lastName: "Soto Sepúlveda",
      email: "mateo.soto@farmaciainacap.cl",
      phone: "+56 9 6543 2109",
      roleCode: "BODEGUERO",
    },
    {
      username: "tec_camila",
      rut: "19.876.543-0",
      firstName: "Camila",
      lastName: "Rojas Fuentes",
      email: "camila.rojas@farmaciainacap.cl",
      phone: "+56 9 5432 1098",
      roleCode: "TECNICO_FARMACIA",
    },
  ];

  const userMap = new Map<string, string>();
  for (const u of usersToSeed) {
    const role = roleByCode.get(u.roleCode);
    if (!role) continue;

    const normRut = normalizeRut(u.rut);
    const createdUser = await prisma.user.upsert({
      where: { username: u.username },
      update: {
        rut: normRut,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        phone: u.phone,
        status: "ACTIVE",
        roleId: role.id,
      },
      create: {
        username: u.username,
        passwordHash: defaultPasswordHash,
        rut: normRut,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        phone: u.phone,
        status: "ACTIVE",
        roleId: role.id,
      },
    });
    userMap.set(u.username, createdUser.id);
  }

  // Configuración de la farmacia
  await prisma.systemSetting.upsert({
    where: { key: "pharmacy.name" },
    update: { value: "FarmaGestión - Farmacia Privada Comercial INACAP" },
    create: {
      key: "pharmacy.name",
      value: "FarmaGestión - Farmacia Privada Comercial INACAP",
      description: "Nombre comercial del establecimiento farmacéutico",
      isPublic: true,
    },
  });

  // --------------------------------------------------------------------------
  // 3. MAESTROS: UBICACIONES, CATEGORIAS, LABORATORIOS, PRINCIPIOS, PROVEEDORES
  // --------------------------------------------------------------------------
  console.log("[3/8] Poblando maestros: ubicaciones, categorías, laboratorios e insumos...");
  const locationMap = new Map<string, string>();
  for (const [code, name, type] of inventoryLocations) {
    const loc = await prisma.inventoryLocation.upsert({
      where: { code },
      update: { name, type, isActive: true },
      create: { code, name, type, isActive: true },
    });
    locationMap.set(code, loc.id);
  }

  const categoryMap = new Map<string, string>();
  for (const [code, name] of categories) {
    const cat = await prisma.category.upsert({
      where: { code },
      update: { name, isActive: true },
      create: { code, name, isActive: true },
    });
    categoryMap.set(code, cat.id);
  }

  const labMap = new Map<string, string>();
  for (const [code, name] of laboratories) {
    const lab = await prisma.laboratory.upsert({
      where: { code },
      update: { name, isActive: true },
      create: { code, name, isActive: true },
    });
    labMap.set(code, lab.id);
  }

  const activeIngMap = new Map<string, string>();
  for (const ing of activeIngredients) {
    const created = await prisma.activeIngredient.upsert({
      where: { code: ing.code },
      update: { name: ing.name, description: ing.description, isActive: true },
      create: { code: ing.code, name: ing.name, description: ing.description, isActive: true },
    });
    activeIngMap.set(ing.code, created.id);
  }

  const supplierMap = new Map<string, string>();
  for (const s of suppliers) {
    const normRut = normalizeRut(s.rut);
    const created = await prisma.supplier.upsert({
      where: { rut: normRut },
      update: {
        businessName: s.businessName,
        tradeName: s.tradeName,
        contactName: s.contactName,
        email: s.email,
        phone: s.phone,
        address: s.address,
        commune: s.commune,
        region: s.region,
        isActive: true,
      },
      create: {
        rut: normRut,
        businessName: s.businessName,
        tradeName: s.tradeName,
        contactName: s.contactName,
        email: s.email,
        phone: s.phone,
        address: s.address,
        commune: s.commune,
        region: s.region,
        isActive: true,
      },
    });
    supplierMap.set(s.businessName, created.id);
  }

  // Cajas registradoras
  const registerMap = new Map<string, string>();
  for (const reg of cashRegisters) {
    const created = await prisma.cashRegister.upsert({
      where: { code: reg.code },
      update: { name: reg.name, description: reg.description, isActive: true },
      create: { code: reg.code, name: reg.name, description: reg.description, isActive: true },
    });
    registerMap.set(reg.code, created.id);
  }

  // Convenios de salud
  const planMap = new Map<string, string>();
  for (const a of agreements) {
    const ag = await prisma.agreement.upsert({
      where: { code: a.code },
      update: {
        name: a.name,
        type: a.type,
        rut: a.rut ? normalizeRut(a.rut) : null,
        description: a.description,
        isActive: true,
      },
      create: {
        code: a.code,
        name: a.name,
        type: a.type,
        rut: a.rut ? normalizeRut(a.rut) : null,
        description: a.description,
        isActive: true,
      },
    });

    for (const plan of a.plans) {
      const p = await prisma.agreementPlan.create({
        data: {
          agreementId: ag.id,
          code: plan.code,
          name: plan.name,
          description: plan.description,
          isActive: true,
        },
      });
      planMap.set(plan.code, p.id);
    }
  }

  // --------------------------------------------------------------------------
  // 4. CATALOGO FARMACEUTICO REALISTA
  // --------------------------------------------------------------------------
  console.log("[4/8] Creando catálogo de medicamentos y productos representativos...");
  const catMed = categoryMap.get("MEDICAMENTOS")!;
  const catDisp = categoryMap.get("DISPOSITIVOS")!;
  const catHig = categoryMap.get("HIGIENE")!;
  const catSup = categoryMap.get("SUPLEMENTOS")!;
  const catDer = categoryMap.get("DERMOCOSMETICA")!;

  const productsCatalog = [
    // 1. Analgésico común (Venta Directa)
    {
      sku: "MED-PAR-500",
      barcode: "7801234500018",
      name: "Paracetamol 500 mg",
      description: "Bioequivalente. Comprimidos para el alivio del dolor de cabeza, dolor muscular y estados febriles.",
      productType: "MEDICINE" as const,
      prescriptionType: "NONE" as const,
      controlledDrugType: "NONE" as const,
      requiresPrescription: false,
      isControlled: false,
      isCenabast: false,
      concentration: "500 mg",
      pharmaceuticalForm: "Comprimido",
      presentation: "Caja x 16 comprimidos",
      purchasePrice: 650,
      salePrice: 1490,
      minimumStock: 25,
      categoryId: catMed,
      laboratoryId: labMap.get("CHILE_TEVAPHARM"),
      activeIngCodes: ["PARACETAMOL"],
    },
    // 2. Antiinflamatorio común (Venta Directa)
    {
      sku: "MED-IBU-400",
      barcode: "7801234500025",
      name: "Ibuprofeno 400 mg",
      description: "Bioequivalente. Antiinflamatorio y analgésico de acción rápida para dolencias articulares y dentales.",
      productType: "MEDICINE" as const,
      prescriptionType: "NONE" as const,
      controlledDrugType: "NONE" as const,
      requiresPrescription: false,
      isControlled: false,
      isCenabast: false,
      concentration: "400 mg",
      pharmaceuticalForm: "Comprimido recubierto",
      presentation: "Caja x 20 comprimidos",
      purchasePrice: 950,
      salePrice: 2190,
      minimumStock: 20,
      categoryId: catMed,
      laboratoryId: labMap.get("MINTLAB"),
      activeIngCodes: ["IBUPROFENO"],
    },
    // 3. Antibiótico bactericida (Receta Médica Simple)
    {
      sku: "MED-AMX-500",
      barcode: "7801234500032",
      name: "Amoval Amoxicilina 500 mg",
      description: "Antibiótico de amplio espectro para infecciones respiratorias, amigdalitis y otitis. Venta bajo receta médica simple.",
      productType: "MEDICINE" as const,
      prescriptionType: "SIMPLE" as const,
      controlledDrugType: "NONE" as const,
      requiresPrescription: true,
      isControlled: false,
      isCenabast: false,
      concentration: "500 mg",
      pharmaceuticalForm: "Cápsula",
      presentation: "Caja x 21 cápsulas",
      purchasePrice: 2450,
      salePrice: 5490,
      minimumStock: 15,
      categoryId: catMed,
      laboratoryId: labMap.get("SAVAL"),
      activeIngCodes: ["AMOXICILINA"],
    },
    // 4. Antialérgico (Venta Directa)
    {
      sku: "MED-LOR-010",
      barcode: "7801234500049",
      name: "Loratadina 10 mg",
      description: "Antialérgico sin efecto sedante para el alivio de rinitis alérgica y urticaria.",
      productType: "MEDICINE" as const,
      prescriptionType: "NONE" as const,
      controlledDrugType: "NONE" as const,
      requiresPrescription: false,
      isControlled: false,
      isCenabast: false,
      concentration: "10 mg",
      pharmaceuticalForm: "Comprimido",
      presentation: "Caja x 30 comprimidos",
      purchasePrice: 990,
      salePrice: 2290,
      minimumStock: 15,
      categoryId: catMed,
      laboratoryId: labMap.get("CHILE_TEVAPHARM"),
      activeIngCodes: ["LORATADINA"],
    },
    // 5. Protector gástrico (Venta Directa)
    {
      sku: "MED-OME-020",
      barcode: "7801234500056",
      name: "Omeprazol 20 mg",
      description: "Antiulceroso e inhibidor de acidez gástrica, reflujo gastroesofágico y gastritis.",
      productType: "MEDICINE" as const,
      prescriptionType: "NONE" as const,
      controlledDrugType: "NONE" as const,
      requiresPrescription: false,
      isControlled: false,
      isCenabast: false,
      concentration: "20 mg",
      pharmaceuticalForm: "Cápsula gastrorresistente",
      presentation: "Caja x 28 cápsulas",
      purchasePrice: 1400,
      salePrice: 3290,
      minimumStock: 20,
      categoryId: catMed,
      laboratoryId: labMap.get("PASTEUR"),
      activeIngCodes: ["OMEPRAZOL"],
    },
    // 6. Antihipertensivo crónico Cenabast (Receta Simple / Cenabast)
    {
      sku: "MED-LOS-050",
      barcode: "7801234500063",
      name: "Losartán Potásico 50 mg",
      description: "Tratamiento de la hipertensión arterial esencial. Medicamento acogido al convenio Ley CENABAST.",
      productType: "MEDICINE" as const,
      prescriptionType: "SIMPLE" as const,
      controlledDrugType: "NONE" as const,
      requiresPrescription: true,
      isControlled: false,
      isCenabast: true,
      cenabastMaxPrice: 1890,
      concentration: "50 mg",
      pharmaceuticalForm: "Comprimido recubierto",
      presentation: "Caja x 30 comprimidos",
      purchasePrice: 720,
      salePrice: 1690,
      minimumStock: 30,
      categoryId: catMed,
      laboratoryId: labMap.get("ANDROMACO"),
      activeIngCodes: ["LOSARTAN"],
    },
    // 7. Antidiabético crónico Cenabast (Receta Simple / Cenabast)
    {
      sku: "MED-MET-850",
      barcode: "7801234500070",
      name: "Metformina Clorhidrato 850 mg",
      description: "Tratamiento de primera línea para Diabetes Mellitus Tipo 2. Medicamento acogido a Ley CENABAST.",
      productType: "MEDICINE" as const,
      prescriptionType: "SIMPLE" as const,
      controlledDrugType: "NONE" as const,
      requiresPrescription: true,
      isControlled: false,
      isCenabast: true,
      cenabastMaxPrice: 2200,
      concentration: "850 mg",
      pharmaceuticalForm: "Comprimido",
      presentation: "Caja x 30 comprimidos",
      purchasePrice: 890,
      salePrice: 1990,
      minimumStock: 30,
      categoryId: catMed,
      laboratoryId: labMap.get("CHILE_TEVAPHARM"),
      activeIngCodes: ["METFORMINA"],
    },
    // 8. Hipolipemiante crónico (Receta Simple)
    {
      sku: "MED-ATO-020",
      barcode: "7801234500087",
      name: "Lipitor Atorvastatina 20 mg",
      description: "Reducción del colesterol total y LDL en hipercolesterolemia y prevención cardiovascular.",
      productType: "MEDICINE" as const,
      prescriptionType: "SIMPLE" as const,
      controlledDrugType: "NONE" as const,
      requiresPrescription: true,
      isControlled: false,
      isCenabast: false,
      concentration: "20 mg",
      pharmaceuticalForm: "Comprimido recubierto",
      presentation: "Caja x 30 comprimidos",
      purchasePrice: 4200,
      salePrice: 8990,
      minimumStock: 15,
      categoryId: catMed,
      laboratoryId: labMap.get("PFIZER"),
      activeIngCodes: ["ATORVASTATINA"],
    },
    // 9. Broncodilatador para asma (Receta Simple)
    {
      sku: "MED-SAL-100",
      barcode: "7801234500094",
      name: "Aerolin Salbutamol Inhalador 100 mcg",
      description: "Inhalador presurizado de dosis medida para el alivio rápido del broncoespasmo en asma.",
      productType: "MEDICINE" as const,
      prescriptionType: "SIMPLE" as const,
      controlledDrugType: "NONE" as const,
      requiresPrescription: true,
      isControlled: false,
      isCenabast: false,
      concentration: "100 mcg / dosis",
      pharmaceuticalForm: "Aerosol para inhalación",
      presentation: "Frasco presurizado x 200 dosis",
      purchasePrice: 2100,
      salePrice: 4690,
      minimumStock: 15,
      categoryId: catMed,
      laboratoryId: labMap.get("GLAXOSMITHKLINE"),
      activeIngCodes: ["SALBUTAMOL"],
    },
    // 10. Psicotrópico controlado Lista IV (Receta Retenida con Control de Saldo)
    {
      sku: "MED-CLO-002",
      barcode: "7801234500100",
      name: "Ravotril Clonazepam 2 mg",
      description: "Tratamiento de trastornos de pánico, ansiedad y crisis convulsivas. Psicotrópico sujeto a Libro de Controlados.",
      productType: "MEDICINE" as const,
      prescriptionType: "RETAINED" as const,
      controlledDrugType: "PSYCHOTROPIC" as const,
      requiresPrescription: true,
      isControlled: true,
      isCenabast: false,
      concentration: "2 mg",
      pharmaceuticalForm: "Comprimido birranurado",
      presentation: "Caja x 30 comprimidos",
      purchasePrice: 3800,
      salePrice: 7990,
      minimumStock: 10,
      categoryId: catMed,
      laboratoryId: labMap.get("ROCHE"),
      activeIngCodes: ["CLONAZEPAM"],
    },
    // 11. Psicotrópico controlado Lista IV (Receta Retenida)
    {
      sku: "MED-ALP-005",
      barcode: "7801234500117",
      name: "Alprazolam 0.5 mg",
      description: "Bioequivalente. Ansiolítico para cuadros de angustia y ansiedad generalizada. Venta bajo receta médica retenida.",
      productType: "MEDICINE" as const,
      prescriptionType: "RETAINED" as const,
      controlledDrugType: "PSYCHOTROPIC" as const,
      requiresPrescription: true,
      isControlled: true,
      isCenabast: false,
      concentration: "0.5 mg",
      pharmaceuticalForm: "Comprimido ranurado",
      presentation: "Caja x 30 comprimidos",
      purchasePrice: 1950,
      salePrice: 4490,
      minimumStock: 10,
      categoryId: catMed,
      laboratoryId: labMap.get("BAGO"),
      activeIngCodes: ["ALPRAZOLAM"],
    },
    // 12. Analgésico sublingual potente (Receta Simple)
    {
      sku: "MED-KET-010",
      barcode: "7801234500124",
      name: "Doloten Ketorolaco Trometamol 10 mg",
      description: "Comprimidos sublinguales de absorción inmediata para dolor agudo postoperatorio o traumático.",
      productType: "MEDICINE" as const,
      prescriptionType: "SIMPLE" as const,
      controlledDrugType: "NONE" as const,
      requiresPrescription: true,
      isControlled: false,
      isCenabast: false,
      concentration: "10 mg",
      pharmaceuticalForm: "Comprimido sublingual",
      presentation: "Caja x 10 comprimidos sublinguales",
      purchasePrice: 1600,
      salePrice: 3790,
      minimumStock: 12,
      categoryId: catMed,
      laboratoryId: labMap.get("RECALCINE"),
      activeIngCodes: ["KETOROLACO"],
    },
    // 13. Dispositivo médico: Termómetro digital
    {
      sku: "DIS-TER-DIG",
      barcode: "7801234500131",
      name: "Termómetro Digital Clínico Punta Flexible",
      description: "Termómetro médico digital con alarma de fiebre y memoria de última medición. Libre de mercurio.",
      productType: "MEDICAL_DEVICE" as const,
      prescriptionType: "NONE" as const,
      controlledDrugType: "NONE" as const,
      requiresPrescription: false,
      isControlled: false,
      isCenabast: false,
      concentration: null,
      pharmaceuticalForm: "Dispositivo",
      presentation: "Estuche individual con batería incluida",
      purchasePrice: 1850,
      salePrice: 3990,
      minimumStock: 8,
      categoryId: catDisp,
      laboratoryId: null,
      activeIngCodes: [],
    },
    // 14. Dispositivo médico: Suero fisiológico
    {
      sku: "DIS-SUE-500",
      barcode: "7801234500148",
      name: "Suero Fisiológico 0.9% 500 mL",
      description: "Solución isotónica estéril de cloruro de sodio al 0.9% para lavado de heridas y nebulizaciones.",
      productType: "MEDICAL_DEVICE" as const,
      prescriptionType: "NONE" as const,
      controlledDrugType: "NONE" as const,
      requiresPrescription: false,
      isControlled: false,
      isCenabast: false,
      concentration: "0.9%",
      pharmaceuticalForm: "Solución estéril",
      presentation: "Matraz plástico x 500 mL",
      purchasePrice: 1100,
      salePrice: 2490,
      minimumStock: 15,
      categoryId: catDisp,
      laboratoryId: labMap.get("SANDERSON"),
      activeIngCodes: [],
    },
    // 15. Higiene: Alcohol Gel
    {
      sku: "HIG-ALC-340",
      barcode: "7801234500155",
      name: "Alcohol Gel Antiséptico 70% 340 mL",
      description: "Gel antibacterial y sanitizante de manos con glicerina humectante y válvula dosificadora.",
      productType: "HYGIENE" as const,
      prescriptionType: "NONE" as const,
      controlledDrugType: "NONE" as const,
      requiresPrescription: false,
      isControlled: false,
      isCenabast: false,
      concentration: "70% v/v",
      pharmaceuticalForm: "Gel tópico",
      presentation: "Botella con dosificador pump x 340 mL",
      purchasePrice: 1250,
      salePrice: 2790,
      minimumStock: 15,
      categoryId: catHig,
      laboratoryId: null,
      activeIngCodes: [],
    },
    // 16. Suplemento: Vitamina C + Zinc
    {
      sku: "SUP-VIT-020",
      barcode: "7801234500162",
      name: "Redoxon Vitamina C 1000 mg + Zinc",
      description: "Comprimidos efervescentes sabor naranja para fortalecimiento del sistema inmunológico.",
      productType: "SUPPLEMENT" as const,
      prescriptionType: "NONE" as const,
      controlledDrugType: "NONE" as const,
      requiresPrescription: false,
      isControlled: false,
      isCenabast: false,
      concentration: "1000 mg / 10 mg",
      pharmaceuticalForm: "Comprimido efervescente",
      presentation: "Tubo x 20 comprimidos efervescentes",
      purchasePrice: 3100,
      salePrice: 6490,
      minimumStock: 10,
      categoryId: catSup,
      laboratoryId: labMap.get("BAYER"),
      activeIngCodes: [],
    },
  ];

  const productMap = new Map<string, any>();
  for (const p of productsCatalog) {
    const createdProduct = await prisma.product.create({
      data: {
        sku: p.sku,
        barcode: p.barcode,
        name: p.name,
        description: p.description,
        productType: p.productType,
        prescriptionType: p.prescriptionType,
        controlledDrugType: p.controlledDrugType,
        requiresPrescription: p.requiresPrescription,
        isControlled: p.isControlled,
        isCenabast: p.isCenabast,
        cenabastMaxPrice: p.cenabastMaxPrice ?? null,
        concentration: p.concentration,
        pharmaceuticalForm: p.pharmaceuticalForm,
        presentation: p.presentation,
        purchasePrice: p.purchasePrice,
        salePrice: p.salePrice,
        minimumStock: p.minimumStock,
        categoryId: p.categoryId,
        laboratoryId: p.laboratoryId ?? null,
        isActive: true,
      },
    });

    for (const code of p.activeIngCodes) {
      const activeId = activeIngMap.get(code);
      if (activeId) {
        await prisma.productActiveIngredient.create({
          data: {
            productId: createdProduct.id,
            activeIngredientId: activeId,
          },
        });
      }
    }

    productMap.set(p.sku, createdProduct);
  }

  // --------------------------------------------------------------------------
  // 5. MEDICOS Y PACIENTES CON COBERTURAS REALISTAS
  // --------------------------------------------------------------------------
  console.log("[5/8] Registrando médicos prescriptores, pacientes y coberturas de salud...");
  const doctorsData = [
    {
      rut: "9.876.543-3",
      firstName: "Carlos",
      lastName: "Morales Rivas",
      specialty: "Medicina General y Familiar",
      registration: "COLMED-42918",
      phone: "+56 9 9123 4567",
      email: "dr.morales@centromedico.cl",
    },
    {
      rut: "8.765.432-K",
      firstName: "Marcela",
      lastName: "Contreras Vidal",
      specialty: "Pediatría y Broncopulmonar Infantil",
      registration: "SIS-87412",
      phone: "+56 9 8234 5678",
      email: "dra.contreras@clinicapediatrica.cl",
    },
    {
      rut: "13.456.789-9",
      firstName: "Andrés",
      lastName: "Fuenzalida Becker",
      specialty: "Psiquiatría Adultos",
      registration: "SIS-65120",
      phone: "+56 9 7345 6789",
      email: "dr.fuenzalida@saludmental.cl",
    },
  ];

  const doctorMap = new Map<string, string>();
  for (const d of doctorsData) {
    const doc = await prisma.doctor.create({
      data: {
        rut: normalizeRut(d.rut),
        firstName: d.firstName,
        lastName: d.lastName,
        specialty: d.specialty,
        registration: d.registration,
        phone: d.phone,
        email: d.email,
        isActive: true,
      },
    });
    doctorMap.set(d.rut, doc.id);
  }

  const patientsData = [
    {
      rut: "12.345.678-5",
      firstName: "Juan Pablo",
      lastName: "Pérez González",
      birthDate: new Date("1984-05-14T00:00:00.000Z"),
      phone: "+56 9 8765 4321",
      email: "juan.perez@gmail.com",
      address: "Av. Providencia 1420, Depto 502, Providencia",
      planCode: "FONASA-GEN",
      isPrimary: true,
    },
    {
      rut: "15.234.567-4",
      firstName: "María Ignacia",
      lastName: "Silva Valenzuela",
      birthDate: new Date("1991-09-22T00:00:00.000Z"),
      phone: "+56 9 7654 3210",
      email: "maria.silva@outlook.cl",
      address: "Hernando de Aguirre 890, Las Condes",
      planCode: "COLMENA-PREF",
      isPrimary: true,
    },
    {
      rut: "16.456.789-3",
      firstName: "Roberto Carlos",
      lastName: "Lagos Pino",
      birthDate: new Date("1968-03-30T00:00:00.000Z"),
      phone: "+56 9 6543 2109",
      email: "roberto.lagos@vtr.net",
      address: "Pajaritos 3100, Casa 14, Maipú",
      planCode: "BANMEDICA-SALUD",
      isPrimary: true,
    },
    {
      rut: "17.890.123-0",
      firstName: "Daniela Paz",
      lastName: "Castro Miranda",
      birthDate: new Date("1995-11-08T00:00:00.000Z"),
      phone: "+56 9 5432 1098",
      email: "daniela.castro@inacap.cl",
      address: "Gran Avenida 5200, San Miguel",
      planCode: "CONSALUD-MAS",
      isPrimary: true,
    },
  ];

  const patientMap = new Map<string, any>();
  const patientCoverageMap = new Map<string, string>();
  for (const p of patientsData) {
    const pat = await prisma.patient.create({
      data: {
        rut: normalizeRut(p.rut),
        firstName: p.firstName,
        lastName: p.lastName,
        birthDate: p.birthDate,
        phone: p.phone,
        email: p.email,
        address: p.address,
        isActive: true,
      },
    });
    patientMap.set(p.rut, pat);

    const planId = planMap.get(p.planCode);
    if (planId) {
      const cov = await prisma.patientCoverage.create({
        data: {
          patientId: pat.id,
          agreementPlanId: planId,
          beneficiaryCode: `BEN-${p.rut.replace(/[^0-9]/g, "")}`,
          status: "ACTIVE",
          isPrimary: p.isPrimary,
        },
      });
      patientCoverageMap.set(pat.id, cov.id);
    }
  }

  // --------------------------------------------------------------------------
  // 6. HISTORIAL DE COMPRAS, LOTES Y MOVIMIENTOS DE INVENTARIO (1 MES)
  // --------------------------------------------------------------------------
  console.log("[6/8] Registrando historial de órdenes de compra, recepciones y lotes (1 mes)...");
  const bodId = locationMap.get("BOD-PRINCIPAL")!;
  const vitId = locationMap.get("VITRINA")!;
  const conId = locationMap.get("CONTROLADOS")!;
  const adminId = userMap.get("admin")!;
  const bodegueroId = userMap.get("bodeguero_mateo")!;

  const supCentralId = supplierMap.get("Droguería Central de Chile S.A.")!;
  const supDifarmaId = supplierMap.get("Droguería Difarma SpA")!;
  const supCenabastId = supplierMap.get("Central de Abastecimiento del Sistema Nacional de Servicios de Salud (CENABAST)")!;

  // Fecha hace 28 días (Apertura)
  const date28DaysAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);
  const po1 = await prisma.purchaseOrder.create({
    data: {
      code: "OC-2026-001",
      orderDate: date28DaysAgo,
      expectedDate: new Date(date28DaysAgo.getTime() + 2 * 24 * 60 * 60 * 1000),
      supplierId: supCentralId,
      createdById: adminId,
      status: "RECEIVED",
      subtotal: 408950,
      taxAmount: 77700,
      totalAmount: 486650,
      notes: "Surtimiento inicial de apertura de farmacia - analgésicos, antibióticos y gastroprotectores",
      details: {
        create: [
          { productId: productMap.get("MED-PAR-500")!.id, quantityOrdered: 85, quantityReceived: 85, unitCost: 650, subtotal: 55250 },
          { productId: productMap.get("MED-IBU-400")!.id, quantityOrdered: 70, quantityReceived: 70, unitCost: 950, subtotal: 66500 },
          { productId: productMap.get("MED-AMX-500")!.id, quantityOrdered: 55, quantityReceived: 55, unitCost: 2450, subtotal: 134750 },
          { productId: productMap.get("MED-LOR-010")!.id, quantityOrdered: 55, quantityReceived: 55, unitCost: 990, subtotal: 54450 },
          { productId: productMap.get("MED-OME-020")!.id, quantityOrdered: 70, quantityReceived: 70, unitCost: 1400, subtotal: 98000 },
        ],
      },
    },
  });

  const receipt1 = await prisma.purchaseReceipt.create({
    data: {
      code: "REC-2026-001",
      purchaseOrderId: po1.id,
      receivedById: bodegueroId,
      receivedAt: new Date(date28DaysAgo.getTime() + 2 * 24 * 60 * 60 * 1000),
      notes: "Mercadería recibida conforme, control de temperatura y sellos intactos",
    },
  });

  // Fecha hace 18 días (Convenio Cenabast)
  const date18DaysAgo = new Date(Date.now() - 18 * 24 * 60 * 60 * 1000);
  const po2 = await prisma.purchaseOrder.create({
    data: {
      code: "OC-2026-002",
      orderDate: date18DaysAgo,
      expectedDate: new Date(date18DaysAgo.getTime() + 3 * 24 * 60 * 60 * 1000),
      supplierId: supCenabastId,
      createdById: adminId,
      status: "RECEIVED",
      subtotal: 152950,
      taxAmount: 29060,
      totalAmount: 182010,
      notes: "Adquisición directa CENABAST medicamentos crónicos hipertensión y diabetes",
      details: {
        create: [
          { productId: productMap.get("MED-LOS-050")!.id, quantityOrdered: 95, quantityReceived: 95, unitCost: 720, subtotal: 68400 },
          { productId: productMap.get("MED-MET-850")!.id, quantityOrdered: 95, quantityReceived: 95, unitCost: 890, subtotal: 84550 },
        ],
      },
    },
  });

  const receipt2 = await prisma.purchaseReceipt.create({
    data: {
      code: "REC-2026-002",
      purchaseOrderId: po2.id,
      receivedById: bodegueroId,
      receivedAt: new Date(date18DaysAgo.getTime() + 3 * 24 * 60 * 60 * 1000),
      notes: "Recepción de medicamentos Cenabast con rotulado de precio máximo",
    },
  });

  // Fecha hace 9 días (Psicotrópicos y reposición)
  const date9DaysAgo = new Date(Date.now() - 9 * 24 * 60 * 60 * 1000);
  const po3 = await prisma.purchaseOrder.create({
    data: {
      code: "OC-2026-003",
      orderDate: date9DaysAgo,
      expectedDate: new Date(date9DaysAgo.getTime() + 2 * 24 * 60 * 60 * 1000),
      supplierId: supDifarmaId,
      createdById: adminId,
      status: "RECEIVED",
      subtotal: 260400,
      taxAmount: 49476,
      totalAmount: 309876,
      notes: "Reposición analgésicos y psicotrópicos controlados con guía de despacho visada",
      details: {
        create: [
          { productId: productMap.get("MED-CLO-002")!.id, quantityOrdered: 48, quantityReceived: 48, unitCost: 3800, subtotal: 182400 },
          { productId: productMap.get("MED-ALP-005")!.id, quantityOrdered: 40, quantityReceived: 40, unitCost: 1950, subtotal: 78000 },
        ],
      },
    },
  });

  const receipt3 = await prisma.purchaseReceipt.create({
    data: {
      code: "REC-2026-003",
      purchaseOrderId: po3.id,
      receivedById: bodegueroId,
      receivedAt: new Date(date9DaysAgo.getTime() + 2 * 24 * 60 * 60 * 1000),
      notes: "Psicotrópicos recepcionados y entregados directamente a Químico Farmacéutico",
    },
  });

  // Orden de compra reciente en tránsito (hace 2 días)
  const date2DaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  await prisma.purchaseOrder.create({
    data: {
      code: "OC-2026-004",
      orderDate: date2DaysAgo,
      expectedDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      supplierId: supCentralId,
      createdById: adminId,
      status: "SENT",
      subtotal: 112500,
      taxAmount: 21375,
      totalAmount: 133875,
      notes: "Reposición semanal en tránsito desde centro logístico",
      details: {
        create: [
          { productId: productMap.get("MED-PAR-500")!.id, quantityOrdered: 100, quantityReceived: 0, unitCost: 650, subtotal: 65000 },
          { productId: productMap.get("MED-IBU-400")!.id, quantityOrdered: 50, quantityReceived: 0, unitCost: 950, subtotal: 47500 },
        ],
      },
    },
  });

  // Creación de Lotes y distribución de Stock con FEFO
  const batchMap = new Map<string, any>();
  const productBatchesInfo = [
    { sku: "MED-PAR-500", batchNumber: "L-PAR240901", expDate: new Date("2028-08-30"), qtyBod: 60, qtyVit: 25, receipt: receipt1 },
    { sku: "MED-IBU-400", batchNumber: "L-IBU240902", expDate: new Date("2027-11-30"), qtyBod: 50, qtyVit: 20, receipt: receipt1 },
    { sku: "MED-AMX-500", batchNumber: "L-AMX240903", expDate: new Date("2027-09-30"), qtyBod: 40, qtyVit: 15, receipt: receipt1 },
    { sku: "MED-LOR-010", batchNumber: "L-LOR240904", expDate: new Date("2028-03-31"), qtyBod: 40, qtyVit: 15, receipt: receipt1 },
    { sku: "MED-OME-020", batchNumber: "L-OME240905", expDate: new Date("2027-10-31"), qtyBod: 50, qtyVit: 20, receipt: receipt1 },
    { sku: "MED-LOS-050", batchNumber: "L-LOS241011", expDate: new Date("2028-05-31"), qtyBod: 70, qtyVit: 25, receipt: receipt2 },
    { sku: "MED-MET-850", batchNumber: "L-MET241012", expDate: new Date("2028-06-30"), qtyBod: 70, qtyVit: 25, receipt: receipt2 },
    { sku: "MED-ATO-020", batchNumber: "L-ATO240915", expDate: new Date("2027-12-31"), qtyBod: 30, qtyVit: 10, receipt: receipt1 },
    { sku: "MED-SAL-100", batchNumber: "L-SAL240916", expDate: new Date("2027-07-31"), qtyBod: 35, qtyVit: 10, receipt: receipt1 },
    // Psicotrópico controlado en caja fuerte (CONTROLADOS)
    { sku: "MED-CLO-002", batchNumber: "L-CLO241020", expDate: new Date("2028-04-30"), qtyBod: 30, qtyVit: 18, isCtrl: true, receipt: receipt3 },
    { sku: "MED-ALP-005", batchNumber: "L-ALP241021", expDate: new Date("2028-02-28"), qtyBod: 25, qtyVit: 15, isCtrl: true, receipt: receipt3 },
    { sku: "MED-KET-010", batchNumber: "L-KET241022", expDate: new Date("2027-08-31"), qtyBod: 30, qtyVit: 12, receipt: receipt3 },
    { sku: "DIS-TER-DIG", batchNumber: "L-DIS240925", expDate: new Date("2029-12-31"), qtyBod: 20, qtyVit: 8, receipt: receipt1 },
    { sku: "DIS-SUE-500", batchNumber: "L-SUE240926", expDate: new Date("2027-05-31"), qtyBod: 30, qtyVit: 15, receipt: receipt1 },
    { sku: "HIG-ALC-340", batchNumber: "L-ALC240927", expDate: new Date("2027-09-30"), qtyBod: 35, qtyVit: 15, receipt: receipt1 },
    // Lote próximo a vencer (para generar alerta preventiva legítima de 45 días)
    { sku: "SUP-VIT-020", batchNumber: "L-VIT240105", expDate: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000), qtyBod: 10, qtyVit: 5, receipt: receipt1 },
  ];

  for (const b of productBatchesInfo) {
    const prod = productMap.get(b.sku);
    if (!prod) continue;

    const totalQty = b.qtyBod + b.qtyVit;
    const batch = await prisma.batch.create({
      data: {
        productId: prod.id,
        batchNumber: b.batchNumber,
        supplierId: b.receipt.purchaseOrderId ? supCentralId : null,
        purchaseReceiptId: b.receipt.id,
        expirationDate: b.expDate,
        initialQuantity: totalQty,
        purchasePrice: prod.purchasePrice,
        isBlocked: false,
      },
    });
    batchMap.set(b.sku, batch);

    // Stock en Bodega Principal
    await prisma.inventoryStock.create({
      data: {
        batchId: batch.id,
        locationId: bodId,
        quantity: b.qtyBod,
        reservedQuantity: 0,
      },
    });

    // Stock en Sala de Ventas (Vitrina) o Controlados
    const activeLocId = b.isCtrl ? conId : vitId;
    await prisma.inventoryStock.create({
      data: {
        batchId: batch.id,
        locationId: activeLocId,
        quantity: b.qtyVit,
        reservedQuantity: 0,
      },
    });

    // Registro de movimiento inicial de recepción
    await prisma.inventoryMovement.create({
      data: {
        type: "PURCHASE_RECEIPT",
        productId: prod.id,
        batchId: batch.id,
        destinationLocationId: bodId,
        quantity: totalQty,
        unitCost: prod.purchasePrice,
        userId: bodegueroId,
        referenceType: "PURCHASE_RECEIPT",
        referenceId: b.receipt.code,
        reason: "Ingreso inicial por orden de compra",
      },
    });
  }

  // --------------------------------------------------------------------------
  // 7. RECETAS MEDICAS REALES (DISPENSADA, EN TRATAMIENTO Y ACTIVA EN POS)
  // --------------------------------------------------------------------------
  console.log("[7/8] Creando recetas médicas, dispensaciones y libro de psicotrópicos...");
  const docMoralesId = doctorMap.get("9.876.543-3")!;
  const docFuenzalidaId = doctorMap.get("13.456.789-9")!;
  const patJuan = patientMap.get("12.345.678-5")!;
  const patMaria = patientMap.get("15.234.567-4")!;
  const patRoberto = patientMap.get("16.456.789-3")!;

  const prodAmox = productMap.get("MED-AMX-500")!;
  const prodLosartan = productMap.get("MED-LOS-050")!;
  const prodMetformina = productMap.get("MED-MET-850")!;
  const prodClonazepam = productMap.get("MED-CLO-002")!;
  const prodAlprazolam = productMap.get("MED-ALP-005")!;

  // Receta 1: Aguda (Amoxicilina) para Juan Pérez - Ya dispensada
  const rx1 = await prisma.prescription.create({
    data: {
      folio: "REC-2026-0842",
      origin: "PHYSICAL",
      prescriptionType: "SIMPLE",
      status: "DISPENSED",
      issueDate: new Date(Date.now() - 22 * 24 * 60 * 60 * 1000),
      expirationDate: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000),
      patientId: patJuan.id,
      doctorId: docMoralesId,
      notes: "Diagnóstico: Faringoamigdalitis purulenta aguda",
      items: {
        create: [
          {
            productId: prodAmox.id,
            prescribedQuantity: 1,
            dispensedQuantity: 1,
            remainingQuantity: 0,
            dosage: "500 mg cada 8 horas por 7 días",
            frequency: "Cada 8 horas",
            duration: "7 días",
          },
        ],
      },
    },
  });

  // Receta 2: Crónica para Roberto Lagos (Hipertensión y Diabetes) - Parcialmente dispensada con saldo
  const rx2 = await prisma.prescription.create({
    data: {
      folio: "REC-2026-0915",
      origin: "DIGITAL",
      prescriptionType: "SIMPLE",
      status: "PARTIALLY_DISPENSED",
      issueDate: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
      expirationDate: new Date(Date.now() + 165 * 24 * 60 * 60 * 1000),
      patientId: patRoberto.id,
      doctorId: docMoralesId,
      hasBalanceControl: true,
      notes: "Tratamiento crónico cardiovascular y metabólico (receta para 3 meses)",
      items: {
        create: [
          {
            productId: prodLosartan.id,
            prescribedQuantity: 3,
            dispensedQuantity: 1,
            remainingQuantity: 2,
            dosage: "50 mg cada 12 horas",
            frequency: "Cada 12 horas",
            duration: "90 días",
          },
          {
            productId: prodMetformina.id,
            prescribedQuantity: 3,
            dispensedQuantity: 1,
            remainingQuantity: 2,
            dosage: "850 mg con el almuerzo",
            frequency: "Una vez al día",
            duration: "90 días",
          },
        ],
      },
    },
  });

  // Receta 3: Psicotrópicos Retenidos para María Ignacia Silva - ACTIVA CON SALDO DISPONIBLE EN POS
  const rx3 = await prisma.prescription.create({
    data: {
      folio: "REC-RET-2026-0318",
      origin: "PHYSICAL",
      prescriptionType: "RETAINED",
      status: "ACTIVE",
      issueDate: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
      expirationDate: new Date(Date.now() + 26 * 24 * 60 * 60 * 1000),
      patientId: patMaria.id,
      doctorId: docFuenzalidaId,
      notes: "Recetario oficial de estupefacientes y psicotrópicos. Trastorno de ansiedad generalizada.",
      items: {
        create: [
          {
            productId: prodClonazepam.id,
            prescribedQuantity: 1,
            dispensedQuantity: 0,
            remainingQuantity: 1,
            dosage: "0.5 comprimido por la noche",
            frequency: "Cada 24 horas nocturna",
            duration: "30 días",
          },
          {
            productId: prodAlprazolam.id,
            prescribedQuantity: 1,
            dispensedQuantity: 0,
            remainingQuantity: 1,
            dosage: "1 comprimido en caso de crisis de pánico",
            frequency: "SOS",
            duration: "30 días",
          },
        ],
      },
    },
  });

  // --------------------------------------------------------------------------
  // 8. SESIONES DE CAJA, VENTAS, FACTURAS Y LIBRO DE CONTROLADOS
  // --------------------------------------------------------------------------
  console.log("[8/8] Simulando arqueos de caja, ventas de mostrador y libro de controlados...");
  const reg1Id = registerMap.get("CAJA-01")!;
  const vendedorDiegoId = userMap.get("vendedor_diego")!;
  const qfValeriaId = userMap.get("qf_valeria")!;

  // SESION 1 (Hace 20 días) - CERRADA
  const date20DaysAgo = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
  const session1 = await prisma.cashSession.create({
    data: {
      cashRegisterId: reg1Id,
      openedById: vendedorDiegoId,
      status: "CLOSED",
      openedAt: date20DaysAgo,
      closedAt: new Date(date20DaysAgo.getTime() + 9 * 60 * 60 * 1000),
      openingAmount: 50000,
      expectedAmount: 112470,
      countedAmount: 112470,
      differenceAmount: 0,
      closedById: vendedorDiegoId,
      notes: "Cierre de turno tarde cuadrado conforme a sistema",
    },
  });

  await prisma.cashMovement.create({
    data: {
      cashSessionId: session1.id,
      type: "OPENING",
      amount: 50000,
      description: "Apertura de caja con sencillo para vuelto",
      userId: vendedorDiegoId,
      occurredAt: date20DaysAgo,
    },
  });

  // Venta 1 en Sesión 1: Paracetamol + Alcohol Gel (Boleta)
  const prodParacetamol = productMap.get("MED-PAR-500")!;
  const prodAlcohol = productMap.get("HIG-ALC-340")!;
  const batchParacetamol = batchMap.get("MED-PAR-500")!;
  const batchAlcohol = batchMap.get("HIG-ALC-340")!;

  const sale1 = await prisma.sale.create({
    data: {
      code: "VTA-2026-000101",
      status: "COMPLETED",
      sellerId: vendedorDiegoId,
      cashSessionId: session1.id,
      customerName: "Cliente Mostrador",
      customerRut: "18.901.234-9",
      subtotal: 4280,
      discountAmount: 0,
      coverageAmount: 0,
      netAmount: 3597,
      taxAmount: 683,
      totalAmount: 4280,
      saleDate: new Date(date20DaysAgo.getTime() + 2 * 60 * 60 * 1000),
      items: {
        create: [
          {
            productId: prodParacetamol.id,
            quantity: 1,
            unitPrice: prodParacetamol.salePrice,
            totalAmount: prodParacetamol.salePrice,
            netAmount: 1252,
            taxAmount: 238,
            batchAllocations: {
              create: [{ batchId: batchParacetamol.id, quantity: 1 }],
            },
          },
          {
            productId: prodAlcohol.id,
            quantity: 1,
            unitPrice: prodAlcohol.salePrice,
            totalAmount: prodAlcohol.salePrice,
            netAmount: 2345,
            taxAmount: 445,
            batchAllocations: {
              create: [{ batchId: batchAlcohol.id, quantity: 1 }],
            },
          },
        ],
      },
      payments: {
        create: [
          { method: "CASH", amount: 4280, paidAt: new Date(date20DaysAgo.getTime() + 2 * 60 * 60 * 1000) },
        ],
      },
      taxDocument: {
        create: {
          type: "RECEIPT",
          status: "ACCEPTED",
          folio: "B-101",
          siiTrackId: "SII-TRK-8812041",
          issuedAt: new Date(date20DaysAgo.getTime() + 2 * 60 * 60 * 1000),
          acceptedAt: new Date(date20DaysAgo.getTime() + 2 * 60 * 60 * 1000),
        },
      },
    },
  });

  await prisma.cashMovement.create({
    data: {
      cashSessionId: session1.id,
      type: "SALE",
      amount: 4280,
      description: "Venta Boleta B-101 en efectivo",
      userId: vendedorDiegoId,
      saleId: sale1.id,
      occurredAt: sale1.saleDate,
    },
  });

  // Venta 2 en Sesión 1: Venta con Receta médica de Amoxicilina + Fonasa
  const batchAmox = batchMap.get("MED-AMX-500")!;
  const rx1Item = await prisma.prescriptionItem.findFirst({ where: { prescriptionId: rx1.id } });

  const sale2 = await prisma.sale.create({
    data: {
      code: "VTA-2026-000102",
      status: "COMPLETED",
      sellerId: vendedorDiegoId,
      cashSessionId: session1.id,
      patientId: patJuan.id,
      customerName: "Juan Pablo Pérez González",
      customerRut: "12.345.678-5",
      subtotal: 5490,
      discountAmount: 1098, // 20% descuento convenio Fonasa
      coverageAmount: 1098,
      netAmount: 3691,
      taxAmount: 701,
      totalAmount: 4392,
      saleDate: new Date(date20DaysAgo.getTime() + 4 * 60 * 60 * 1000),
      notes: "Dispensación de receta folio REC-2026-0842 con copago Fonasa",
      items: {
        create: [
          {
            productId: prodAmox.id,
            quantity: 1,
            unitPrice: prodAmox.salePrice,
            discountAmount: 1098,
            totalAmount: 4392,
            netAmount: 3691,
            taxAmount: 701,
            prescriptionItemId: rx1Item?.id,
            batchAllocations: {
              create: [{ batchId: batchAmox.id, quantity: 1 }],
            },
          },
        ],
      },
      payments: {
        create: [
          { method: "DEBIT_CARD", amount: 4392, referenceCode: "OP-TRANS-98124", paidAt: new Date(date20DaysAgo.getTime() + 4 * 60 * 60 * 1000) },
        ],
      },
      taxDocument: {
        create: {
          type: "RECEIPT",
          status: "ACCEPTED",
          folio: "B-102",
          siiTrackId: "SII-TRK-8812042",
          issuedAt: new Date(date20DaysAgo.getTime() + 4 * 60 * 60 * 1000),
          acceptedAt: new Date(date20DaysAgo.getTime() + 4 * 60 * 60 * 1000),
        },
      },
    },
  });

  // Cobertura asociada
  const juanCoverageId = patientCoverageMap.get(patJuan.id);
  if (juanCoverageId) {
    await prisma.saleCoverage.create({
      data: {
        saleId: sale2.id,
        patientCoverageId: juanCoverageId,
        status: "APPLIED",
        requestedAmount: 1098,
        approvedAmount: 1098,
        copayAmount: 4392,
        authorizationCode: "IMED-AUT-789012",
        appliedAt: sale2.saleDate,
      },
    });
  }

  // Dispensación formal de la receta
  const disp1 = await prisma.dispensation.create({
    data: {
      code: "DISP-2026-0001",
      prescriptionId: rx1.id,
      dispensedById: qfValeriaId,
      saleId: sale2.id,
      status: "COMPLETED",
      dispensedAt: sale2.saleDate,
      notes: "Verificación de dosificación y vigencia de receta conforme a D.S. 466",
      items: {
        create: [
          {
            productId: prodAmox.id,
            batchId: batchAmox.id,
            quantity: 1,
          },
        ],
      },
    },
  });

  // SESION 2 (Hace 10 días) - Venta institucional Factura Electrónica - CERRADA
  const date10DaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
  const session2 = await prisma.cashSession.create({
    data: {
      cashRegisterId: reg1Id,
      openedById: vendedorDiegoId,
      status: "CLOSED",
      openedAt: date10DaysAgo,
      closedAt: new Date(date10DaysAgo.getTime() + 8 * 60 * 60 * 1000),
      openingAmount: 50000,
      expectedAmount: 93450,
      countedAmount: 93450,
      differenceAmount: 0,
      closedById: vendedorDiegoId,
      notes: "Cierre conforme sin diferencias",
    },
  });

  const prodTermometro = productMap.get("DIS-TER-DIG")!;
  const batchTermometro = batchMap.get("DIS-TER-DIG")!;
  const prodSuero = productMap.get("DIS-SUE-500")!;
  const batchSuero = batchMap.get("DIS-SUE-500")!;

  const sale3 = await prisma.sale.create({
    data: {
      code: "VTA-2026-000201",
      status: "COMPLETED",
      sellerId: vendedorDiegoId,
      cashSessionId: session2.id,
      customerRut: "77.654.321-7",
      customerName: "Clínica Odontológica San Pedro SpA",
      customerBusinessName: "Clínica Odontológica San Pedro SpA",
      customerBusinessActivity: "Servicios de atención odontológica y médica",
      customerAddress: "Av. Apoquindo 4400, Of 802, Las Condes",
      subtotal: 43450,
      discountAmount: 0,
      coverageAmount: 0,
      netAmount: 36513,
      taxAmount: 6937,
      totalAmount: 43450,
      saleDate: new Date(date10DaysAgo.getTime() + 3 * 60 * 60 * 1000),
      notes: "Surtimiento de botiquín de emergencia clínica",
      items: {
        create: [
          {
            productId: prodTermometro.id,
            quantity: 5,
            unitPrice: prodTermometro.salePrice,
            totalAmount: 19950,
            netAmount: 16765,
            taxAmount: 3185,
            batchAllocations: {
              create: [{ batchId: batchTermometro.id, quantity: 5 }],
            },
          },
          {
            productId: prodSuero.id,
            quantity: 5,
            unitPrice: prodSuero.salePrice,
            totalAmount: 12450,
            netAmount: 10462,
            taxAmount: 1988,
            batchAllocations: {
              create: [{ batchId: batchSuero.id, quantity: 5 }],
            },
          },
          {
            productId: prodAlcohol.id,
            quantity: 4,
            unitPrice: prodAlcohol.salePrice,
            totalAmount: 11160,
            netAmount: 9378,
            taxAmount: 1782,
            batchAllocations: {
              create: [{ batchId: batchAlcohol.id, quantity: 4 }],
            },
          },
        ],
      },
      payments: {
        create: [
          { method: "BANK_TRANSFER", amount: 43450, referenceCode: "TRF-BCI-998822", paidAt: new Date(date10DaysAgo.getTime() + 3 * 60 * 60 * 1000) },
        ],
      },
      taxDocument: {
        create: {
          type: "INVOICE",
          status: "ACCEPTED",
          folio: "F-501",
          siiTrackId: "SII-TRK-7761019",
          issuedAt: new Date(date10DaysAgo.getTime() + 3 * 60 * 60 * 1000),
          acceptedAt: new Date(date10DaysAgo.getTime() + 3 * 60 * 60 * 1000),
        },
      },
    },
  });

  // SESION 3 (HOY) - SESION ABIERTA ACTUAL EN CAJA 1 LISTA PARA OPERAR
  const todayMorning = new Date();
  todayMorning.setHours(8, 30, 0, 0);

  const activeSession = await prisma.cashSession.create({
    data: {
      cashRegisterId: reg1Id,
      openedById: vendedorDiegoId,
      status: "OPEN",
      openedAt: todayMorning,
      openingAmount: 50000,
      expectedAmount: 56490, // $50.000 apertura + $6.490 venta Redoxon en efectivo
      notes: "Turno matutino abierto. Caja operativa para ventas POS.",
    },
  });

  await prisma.cashMovement.create({
    data: {
      cashSessionId: activeSession.id,
      type: "OPENING",
      amount: 50000,
      description: "Apertura de turno matutino con fondo de sencillo",
      userId: vendedorDiegoId,
      occurredAt: todayMorning,
    },
  });

  // Venta reciente de hoy: Redoxon Vitamina C en efectivo
  const prodRedoxon = productMap.get("SUP-VIT-020")!;
  const batchRedoxon = batchMap.get("SUP-VIT-020")!;

  const saleToday = await prisma.sale.create({
    data: {
      code: `VTA-${Date.now().toString().slice(-6)}`,
      status: "COMPLETED",
      sellerId: vendedorDiegoId,
      cashSessionId: activeSession.id,
      customerName: "Cliente Mostrador",
      subtotal: 6490,
      discountAmount: 0,
      coverageAmount: 0,
      netAmount: 5454,
      taxAmount: 1036,
      totalAmount: 6490,
      saleDate: new Date(),
      items: {
        create: [
          {
            productId: prodRedoxon.id,
            quantity: 1,
            unitPrice: prodRedoxon.salePrice,
            totalAmount: 6490,
            netAmount: 5454,
            taxAmount: 1036,
            batchAllocations: {
              create: [{ batchId: batchRedoxon.id, quantity: 1 }],
            },
          },
        ],
      },
      payments: {
        create: [
          { method: "CASH", amount: 6490, paidAt: new Date() },
        ],
      },
      taxDocument: {
        create: {
          type: "RECEIPT",
          status: "ACCEPTED",
          folio: "B-103",
          siiTrackId: "SII-TRK-9901823",
          issuedAt: new Date(),
          acceptedAt: new Date(),
        },
      },
    },
  });

  await prisma.cashMovement.create({
    data: {
      cashSessionId: activeSession.id,
      type: "SALE",
      amount: 6490,
      description: "Venta Boleta B-103 en efectivo",
      userId: vendedorDiegoId,
      saleId: saleToday.id,
      occurredAt: saleToday.saleDate,
    },
  });

  // --------------------------------------------------------------------------
  // 9. LIBRO OFICIAL DE CONTROLADOS (PSICOTROPICOS Y ESTUPEFACIENTES - ISP)
  // --------------------------------------------------------------------------
  const batchClonazepam = batchMap.get("MED-CLO-002")!;

  // Registro 1: Ingreso por compra a droguería
  await prisma.controlledDrugRecord.create({
    data: {
      recordNumber: "CTRL-2026-0001",
      movementType: "PURCHASE_RECEIPT",
      status: "ACTIVE",
      productId: prodClonazepam.id,
      batchId: batchClonazepam.id,
      quantity: 48,
      balanceBefore: 0,
      balanceAfter: 48,
      ispReference: "G/D Difarma 45198",
      reason: "Recepción de compra según factura 91823 Droguería Difarma",
      userId: qfValeriaId,
      occurredAt: receipt3.receivedAt,
    },
  });

  // --------------------------------------------------------------------------
  // 10. ALERTAS TEMPRANAS Y REGISTRO DE AUDITORIA
  // --------------------------------------------------------------------------
  // Alerta 1: Lote próximo a vencer (Vitamina C efervescente)
  await prisma.alert.create({
    data: {
      type: "EXPIRING_SOON",
      status: "PENDING",
      title: "Lote próximo a vencer en 45 días",
      message: `El lote L-VIT240105 de Redoxon Vitamina C 1000 mg + Zinc vence el ${new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toLocaleDateString("es-CL")}. Aplicar criterio FEFO o coordinar devolución con proveedor.`,
      productId: prodRedoxon.id,
      batchId: batchRedoxon.id,
      createdById: qfValeriaId,
    },
  });

  // Alerta 2: Quiebre preventivo de stock mínimo en Paracetamol
  await prisma.alert.create({
    data: {
      type: "LOW_STOCK",
      status: "PENDING",
      title: "Stock cercano a umbral mínimo",
      message: "Paracetamol 500 mg x 16 comprimidos presenta alta rotación en sala de ventas. Se sugiere incluir en la próxima orden de compra.",
      productId: prodParacetamol.id,
      batchId: batchParacetamol.id,
      createdById: bodegueroId,
    },
  });

  // Logs de auditoría sanitaria y de seguridad
  await prisma.auditLog.create({
    data: {
      userId: adminId,
      action: "LOGIN",
      module: "auth",
      description: "Inicio de sesión exitoso de Administrador del Sistema",
      ipAddress: "127.0.0.1",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) FarmaGestión/1.0",
      createdAt: todayMorning,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: qfValeriaId,
      action: "CREATE",
      module: "controlled",
      entity: "ControlledDrugRecord",
      entityId: "CTRL-2026-0001",
      description: "Registro de ingreso de 48 unidades de Clonazepam 2 mg en Libro Oficial de Psicotrópicos",
      ipAddress: "192.168.1.15",
      createdAt: receipt3.receivedAt,
    },
  });

  console.log("\n================================================================");
  console.log(" REPOBLACION COMPLETADA EXITOSAMENTE");
  console.log("================================================================");
  console.log(" - Usuarios disponibles (todos con clave 'administrador'):");
  console.log("     * admin              (Rol: Administrador)");
  console.log("     * qf_valeria         (Rol: Químico Farmacéutico / Directora Técnica)");
  console.log("     * vendedor_diego     (Rol: Vendedor / Cajero)");
  console.log("     * bodeguero_mateo    (Rol: Bodeguero / Logística)");
  console.log("     * tec_camila         (Rol: Técnico en Farmacia)");
  console.log(" - Cajas Registradoras:   CAJA-01 (Mostrador 1) y CAJA-02 (Mostrador 2)");
  console.log(" - Sesión actual de hoy:  ABIERTA en CAJA-01 con $56.490 esperado");
  console.log(" - Catálogo cargado:      16 productos con stock real y FEFO");
  console.log(" - Convenios reales:      FONASA, Colmena, Banmédica, Consalud y Cenabast");
  console.log(" - Receta demo para POS:  REC-RET-2026-0318 (Clonazepam y Alprazolam)");
  console.log("                          Paciente: María Ignacia Silva (15.234.567-4)");
  console.log(" - Libro de Controlados:  Histórico de ingresos y saldo auditado");
  console.log("================================================================");
}

main()
  .catch((error) => {
    console.error("Error durante la repoblación:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
