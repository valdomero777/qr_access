-- AlterTable
ALTER TABLE "Admin" ADD COLUMN     "role" VARCHAR(20) NOT NULL DEFAULT 'admin';

-- CreateTable
CREATE TABLE "EventAdmin" (
    "event_id" UUID NOT NULL,
    "admin_id" UUID NOT NULL,
    "assigned_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventAdmin_pkey" PRIMARY KEY ("event_id","admin_id")
);

-- CreateIndex
CREATE INDEX "EventAdmin_admin_id_idx" ON "EventAdmin"("admin_id");

-- AddForeignKey
ALTER TABLE "EventAdmin" ADD CONSTRAINT "EventAdmin_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventAdmin" ADD CONSTRAINT "EventAdmin_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Migración de datos: nadie debe perder acceso a lo que ya existía.
-- ---------------------------------------------------------------------------

-- Cada evento queda asignado a quien lo creó, que hasta ahora era su único dueño.
INSERT INTO "EventAdmin" ("event_id", "admin_id")
SELECT "id", "admin_id" FROM "Event"
ON CONFLICT DO NOTHING;

-- El administrador más antiguo pasa a super admin. Sin al menos uno, nadie podría
-- crear eventos ni asignar administradores, y el sistema quedaría bloqueado.
UPDATE "Admin" SET "role" = 'super_admin'
WHERE "id" = (SELECT "id" FROM "Admin" ORDER BY "created_at" ASC LIMIT 1);
