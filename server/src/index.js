import { createServer } from 'http';
import { app } from './app.js';
import { env } from './config/env.js';
import { initSocket } from './services/socketService.js';
import { prisma } from './lib/prisma.js';

const ensureColumn = async ({ tableName, columnName, columnDefinition }) => {
  const result = await prisma.$queryRaw`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = ${tableName} AND column_name = ${columnName}
  `;

  if (!result || result.length === 0) {
    console.log(`[DB FIX] \`${columnName}\` column missing on ${tableName}, adding...`);
    await prisma.$executeRawUnsafe(`ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS "${columnName}" ${columnDefinition}`);
    console.log(`[DB FIX] \`${columnName}\` column added successfully to ${tableName}`);
  } else {
    console.log(`[DB FIX] \`${columnName}\` column already exists on ${tableName}`);
  }
};

const ensureTable = async ({ tableName, createSql }) => {
  const result = await prisma.$queryRaw`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ${tableName}
  `;

  if (!result || result.length === 0) {
    console.log(`[DB FIX] Table ${tableName} missing, creating...`);
    await prisma.$executeRawUnsafe(createSql);
    console.log(`[DB FIX] Table ${tableName} created successfully`);
  } else {
    console.log(`[DB FIX] Table ${tableName} already exists`);
  }
};

const ensureForeignKey = async ({ tableName, constraintName, createSql }) => {
  const result = await prisma.$queryRaw`
    SELECT constraint_name
    FROM information_schema.table_constraints
    WHERE table_name = ${tableName}
      AND constraint_name = ${constraintName}
      AND constraint_type = 'FOREIGN KEY'
  `;

  if (!result || result.length === 0) {
    console.log(`[DB FIX] Foreign key ${constraintName} missing on ${tableName}, creating...`);
    await prisma.$executeRawUnsafe(createSql);
    console.log(`[DB FIX] Foreign key ${constraintName} created successfully on ${tableName}`);
  } else {
    console.log(`[DB FIX] Foreign key ${constraintName} already exists on ${tableName}`);
  }
};

const ensureDatabaseSchemaCompatibility = async () => {
  try {
    await ensureColumn({ tableName: 'chat_rooms', columnName: 'type', columnDefinition: 'varchar NOT NULL DEFAULT \'PROJECT\'' });
    await ensureColumn({ tableName: 'chat_rooms', columnName: 'workspaceId', columnDefinition: 'varchar NULL' });
    await ensureColumn({ tableName: 'messages', columnName: 'pinnedAt', columnDefinition: 'timestamp(3) NULL' });
    await ensureColumn({ tableName: 'messages', columnName: 'editedAt', columnDefinition: 'timestamp(3) NULL' });
    await ensureColumn({ tableName: 'messages', columnName: 'deletedAt', columnDefinition: 'timestamp(3) NULL' });
    await ensureColumn({ tableName: 'messages', columnName: 'imageUrl', columnDefinition: 'varchar NULL' });
    await ensureColumn({ tableName: 'messages', columnName: 'fileUrl', columnDefinition: 'varchar NULL' });
    await ensureColumn({ tableName: 'messages', columnName: 'fileName', columnDefinition: 'varchar NULL' });
    await ensureColumn({ tableName: 'messages', columnName: 'fileType', columnDefinition: 'varchar NULL' });
    await ensureColumn({ tableName: 'messages', columnName: 'fileSize', columnDefinition: 'integer NULL' });
    await ensureColumn({ tableName: 'messages', columnName: 'replyToId', columnDefinition: 'varchar NULL' });

    await ensureTable({
      tableName: 'organizations',
      createSql: `CREATE TABLE IF NOT EXISTS "organizations" (
        "id" TEXT PRIMARY KEY,
        "name" TEXT NOT NULL,
        "slug" TEXT NOT NULL UNIQUE,
        "description" TEXT,
        "ownerId" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now()
      )`,
    });

    await ensureTable({
      tableName: 'organization_memberships',
      createSql: `CREATE TABLE IF NOT EXISTS "organization_memberships" (
        "id" TEXT PRIMARY KEY,
        "organizationId" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "role" TEXT NOT NULL DEFAULT 'MEMBER',
        "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
        CONSTRAINT organization_memberships_unique UNIQUE ("organizationId", "userId")
      )`,
    });

    await ensureTable({
      tableName: 'subscription_plans',
      createSql: `CREATE TABLE IF NOT EXISTS "subscription_plans" (
        "id" TEXT PRIMARY KEY,
        "name" TEXT NOT NULL,
        "slug" TEXT NOT NULL UNIQUE,
        "description" TEXT,
        "priceCents" INTEGER NOT NULL,
        "currency" TEXT NOT NULL DEFAULT 'usd',
        "interval" TEXT NOT NULL DEFAULT 'month',
        "features" TEXT,
        "active" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now()
      )`,
    });

    await ensureTable({
      tableName: 'subscriptions',
      createSql: `CREATE TABLE IF NOT EXISTS "subscriptions" (
        "id" TEXT PRIMARY KEY,
        "organizationId" TEXT NOT NULL,
        "planId" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'ACTIVE',
        "startedAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
        "currentPeriodEnd" TIMESTAMP(3),
        "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
        "stripeSubscriptionId" TEXT
      )`,
    });

    await ensureTable({
      tableName: 'invoices',
      createSql: `CREATE TABLE IF NOT EXISTS "invoices" (
        "id" TEXT PRIMARY KEY,
        "organizationId" TEXT NOT NULL,
        "subscriptionId" TEXT,
        "amountCents" INTEGER NOT NULL,
        "currency" TEXT NOT NULL DEFAULT 'usd',
        "status" TEXT NOT NULL DEFAULT 'pending',
        "dueDate" TIMESTAMP(3),
        "paidAt" TIMESTAMP(3),
        "stripeInvoiceId" TEXT,
        "metadata" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now()
      )`,
    });

    await ensureTable({
      tableName: 'payment_methods',
      createSql: `CREATE TABLE IF NOT EXISTS "payment_methods" (
        "id" TEXT PRIMARY KEY,
        "organizationId" TEXT NOT NULL,
        "provider" TEXT NOT NULL,
        "providerId" TEXT NOT NULL,
        "brand" TEXT,
        "last4" TEXT,
        "expMonth" INTEGER,
        "expYear" INTEGER,
        "isDefault" BOOLEAN NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
        CONSTRAINT payment_methods_unique UNIQUE ("organizationId", "provider", "providerId")
      )`,
    });

    await ensureColumn({ tableName: 'groups', columnName: 'organizationId', columnDefinition: 'varchar NULL' });

    await ensureForeignKey({
      tableName: 'groups',
      constraintName: 'groups_organizationId_fkey',
      createSql: `ALTER TABLE "groups" ADD CONSTRAINT groups_organizationId_fkey FOREIGN KEY ("organizationId") REFERENCES "organizations" ("id") ON DELETE CASCADE`,
    });

    await ensureForeignKey({
      tableName: 'organization_memberships',
      constraintName: 'organization_memberships_organizationId_fkey',
      createSql: `ALTER TABLE "organization_memberships" ADD CONSTRAINT organization_memberships_organizationId_fkey FOREIGN KEY ("organizationId") REFERENCES "organizations" ("id") ON DELETE CASCADE`,
    });

    await ensureForeignKey({
      tableName: 'organization_memberships',
      constraintName: 'organization_memberships_userId_fkey',
      createSql: `ALTER TABLE "organization_memberships" ADD CONSTRAINT organization_memberships_userId_fkey FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE`,
    });

    await ensureForeignKey({
      tableName: 'subscriptions',
      constraintName: 'subscriptions_organizationId_fkey',
      createSql: `ALTER TABLE "subscriptions" ADD CONSTRAINT subscriptions_organizationId_fkey FOREIGN KEY ("organizationId") REFERENCES "organizations" ("id") ON DELETE CASCADE`,
    });

    await ensureForeignKey({
      tableName: 'subscriptions',
      constraintName: 'subscriptions_planId_fkey',
      createSql: `ALTER TABLE "subscriptions" ADD CONSTRAINT subscriptions_planId_fkey FOREIGN KEY ("planId") REFERENCES "subscription_plans" ("id") ON DELETE RESTRICT`,
    });

    await ensureForeignKey({
      tableName: 'invoices',
      constraintName: 'invoices_organizationId_fkey',
      createSql: `ALTER TABLE "invoices" ADD CONSTRAINT invoices_organizationId_fkey FOREIGN KEY ("organizationId") REFERENCES "organizations" ("id") ON DELETE CASCADE`,
    });

    await ensureForeignKey({
      tableName: 'invoices',
      constraintName: 'invoices_subscriptionId_fkey',
      createSql: `ALTER TABLE "invoices" ADD CONSTRAINT invoices_subscriptionId_fkey FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions" ("id") ON DELETE SET NULL`,
    });

    await ensureForeignKey({
      tableName: 'payment_methods',
      constraintName: 'payment_methods_organizationId_fkey',
      createSql: `ALTER TABLE "payment_methods" ADD CONSTRAINT payment_methods_organizationId_fkey FOREIGN KEY ("organizationId") REFERENCES "organizations" ("id") ON DELETE CASCADE`,
    });
  } catch (err) {
    console.error('[DB FIX] error ensuring schema compatibility:', err?.message || err);
  }
};

const server = createServer(app);
initSocket(server);

// Run DB fix before starting server (best-effort, idempotent)
(async () => {
  try {
    await ensureDatabaseSchemaCompatibility();
  } catch (error) {
    console.error('[STARTUP] DB fix failed:', error?.message || error);
  }

  server.listen(env.port, () => {
    console.log(`TaskFlow Pro API listening on port ${env.port}`);
  });
})();
