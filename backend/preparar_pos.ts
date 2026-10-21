import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";
import "dotenv/config";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL no está configurada");

const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter });

async function main() {
  const register = await prisma.cashRegister.upsert({
    where: { code: "CAJA-01" },
    update: { isActive: true },
    create: {
      code: "CAJA-01",
      name: "Caja Principal",
      description: "Caja principal de ventas",
      isActive: true,
    },
  });

  console.log("Caja POS preparada:", register.code, "-", register.name);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
