import { Pool } from "pg";

let pool: Pool | undefined;

/** Lazily created Postgres pool shared by all activities in this worker process. */
export function db(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is required for the temporal worker");
    // pg does not understand Prisma's ?schema= parameter.
    pool = new Pool({ connectionString: connectionString.replace(/[?&]schema=[^&]*/, ""), max: 5 });
  }
  return pool;
}

export async function closeDb() {
  await pool?.end();
  pool = undefined;
}
