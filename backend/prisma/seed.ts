import { PrismaClient, UserRole } from "@prisma/client";
import { hash } from "bcrypt";

const prisma = new PrismaClient();

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

  for (const user of users) {
    const passwordHash = await hash(user.password, 12);
    await prisma.user.upsert({
      where: { email: user.email },
      update: { passwordHash, role: user.role },
      create: { email: user.email, passwordHash, role: user.role },
    });
  }

  console.log(`Seeded ${users.length} authentication users`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
