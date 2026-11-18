import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../utils/ApiError.js";

const mockTx = {
  cashRegister: {
    findUnique: vi.fn(),
  },
  cashSession: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  cashMovement: {
    findMany: vi.fn(),
    create: vi.fn(),
  },
};

const mockPrisma = {
  $transaction: vi.fn(async (cb: (tx: typeof mockTx) => unknown) => cb(mockTx)),
  cashSession: mockTx.cashSession,
  cashMovement: mockTx.cashMovement,
};

vi.mock("../../config/prisma.js", () => ({
  prisma: mockPrisma,
}));

const { openCashSession, closeCashSession, createCashMovement } = await import(
  "./cash.service.js"
);

describe("Cash Service Integration (src/modules/cash/cash.service.ts)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("abre una sesión de caja válida y registra el movimiento inicial OPENING", async () => {
    mockTx.cashRegister.findUnique.mockResolvedValue({
      id: "reg-1",
      code: "CAJA-01",
      name: "Caja Principal",
      isActive: true,
    });
    mockTx.cashSession.findFirst.mockResolvedValue(null);
    mockTx.cashSession.create.mockResolvedValue({
      id: "sess-1",
      cashRegisterId: "reg-1",
      openedById: "user-1",
      status: "OPEN",
      openingAmount: 50000,
      expectedAmount: 50000,
    });

    const session = await openCashSession("user-1", {
      cashRegisterId: "reg-1",
      openingAmount: 50000,
      notes: "Inicio turno mañana",
    });

    expect(session.id).toBe("sess-1");
    expect(session.openingAmount).toBe(50000);
    expect(mockTx.cashMovement.create).toHaveBeenCalledWith({
      data: {
        cashSessionId: "sess-1",
        type: "OPENING",
        amount: 50000,
        description: "Apertura de caja",
        userId: "user-1",
      },
    });
  });

  it("bloquea una doble sesión abierta para la misma caja o el mismo usuario (cash_session_partial_unique_idx)", async () => {
    mockTx.cashRegister.findUnique.mockResolvedValue({
      id: "reg-1",
      isActive: true,
    });
    mockTx.cashSession.findFirst.mockResolvedValueOnce({
      id: "sess-existing",
      cashRegisterId: "reg-1",
      status: "OPEN",
    });

    await expect(
      openCashSession("user-2", {
        cashRegisterId: "reg-1",
        openingAmount: 10000,
      }),
    ).rejects.toThrowError(
      new ApiError(409, "Esta caja ya tiene una sesión abierta"),
    );

    mockTx.cashSession.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "sess-user-open",
        openedById: "user-1",
        status: "OPEN",
      });

    await expect(
      openCashSession("user-1", {
        cashRegisterId: "reg-2",
        openingAmount: 10000,
      }),
    ).rejects.toThrowError(
      new ApiError(409, "El usuario ya mantiene una sesión de caja abierta"),
    );
  });

  it("realiza la cuadratura de cierre de caja calculando monto esperado y diferencia exacta dentro de transacción", async () => {
    mockTx.cashSession.findUnique.mockResolvedValue({
      id: "sess-1",
      status: "OPEN",
      openingAmount: 50000,
      notes: null,
    });

    mockTx.cashMovement.findMany.mockResolvedValue([
      { type: "OPENING", amount: 50000 },
      { type: "SALE", amount: 25000 },
      { type: "INCOME", amount: 5000 },
      { type: "EXPENSE", amount: 8000 },
    ]);

    mockTx.cashSession.updateMany.mockResolvedValue({ count: 1 });
    mockTx.cashSession.update.mockImplementation(async ({ data }) => ({
      id: "sess-1",
      ...data,
    }));

    const closed = await closeCashSession("sess-1", "user-1", {
      countedAmount: 71500,
      notes: "Arqueo turno tarde",
    });

    expect(closed.status).toBe("CLOSED");
    expect(closed.expectedAmount).toBe(72000);
    expect(closed.countedAmount).toBe(71500);
    expect(closed.differenceAmount).toBe(-500);
  });

  it("impide cerrar una sesión que ya está cerrada o fue cerrada concurrentemente", async () => {
    mockTx.cashSession.findUnique.mockResolvedValue({
      id: "sess-closed",
      status: "CLOSED",
      openingAmount: 50000,
    });

    await expect(
      closeCashSession("sess-closed", "user-1", {
        countedAmount: 50000,
      }),
    ).rejects.toThrowError(
      new ApiError(409, "La sesión de caja no está abierta"),
    );
  });

  it("rechaza registrar movimientos manuales sobre una sesión de caja cerrada", async () => {
    mockTx.cashSession.findUnique.mockResolvedValue({
      id: "sess-closed",
      status: "CLOSED",
    });

    await expect(
      createCashMovement("sess-closed", "user-1", {
        type: "EXPENSE",
        amount: 5000,
        description: "Insumos menores",
      }),
    ).rejects.toThrowError(
      new ApiError(409, "La sesión de caja está cerrada"),
    );
  });
});
