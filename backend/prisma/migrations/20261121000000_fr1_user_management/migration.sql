-- AlterTable
ALTER TABLE "users" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "full_name" TEXT,
ADD COLUMN     "password_changed_at" TIMESTAMPTZ;


-- FR1 user management: speeds up the "at least one active administrator" check.
CREATE INDEX "idx_users_role_active" ON "users"("role", "active");
