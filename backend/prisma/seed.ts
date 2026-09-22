import { PrismaClient, UserRole } from "@prisma/client";
import { hash } from "bcrypt";

const prisma = new PrismaClient();
const INSTALLMENT_POLICY_ID = "00000000-0000-4000-8000-000000000001";

function requiredEnvironmentVariable(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required to seed authentication users`);
  }
  return value;
}

async function main() {
  const users = [
    {
      email: requiredEnvironmentVariable("SEED_ADMIN_EMAIL").toLowerCase(),
      password: requiredEnvironmentVariable("SEED_ADMIN_PASSWORD"),
      role: UserRole.ADMINISTRATOR,
    },
    {
      email: requiredEnvironmentVariable("SEED_WORKER_EMAIL").toLowerCase(),
      password: requiredEnvironmentVariable("SEED_WORKER_PASSWORD"),
      role: UserRole.WORKER,
    },
  ];

  let administratorId = "";
  for (const user of users) {
    const passwordHash = await hash(user.password, 12);
    const savedUser = await prisma.user.upsert({
      where: { email: user.email },
      update: { passwordHash, role: user.role },
      create: { email: user.email, passwordHash, role: user.role },
    });
    if (user.role === UserRole.ADMINISTRATOR) administratorId = savedUser.id;
  }

  const configuredRate = process.env.SEED_INSTALLMENT_INTEREST_RATE?.trim() || "0.1000";
  const interestRate = Number(configuredRate);
  if (!Number.isFinite(interestRate) || interestRate < 0 || interestRate > 1) {
    throw new Error("SEED_INSTALLMENT_INTEREST_RATE must be between 0 and 1");
  }
  await prisma.installmentPolicy.upsert({
    where: { id: INSTALLMENT_POLICY_ID },
    update: {},
    create: {
      id: INSTALLMENT_POLICY_ID,
      interestRate: configuredRate,
      updatedById: administratorId,
    },
  });

  console.log(`Seeded ${users.length} authentication users and the installment policy`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
