-- Migration: add organization and billing models

CREATE TABLE IF NOT EXISTS "organizations" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL UNIQUE,
  "description" TEXT,
  "ownerId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "organization_memberships" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'MEMBER',
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  CONSTRAINT organization_memberships_unique UNIQUE ("organizationId", "userId")
);

CREATE TABLE IF NOT EXISTS "subscription_plans" (
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
);

CREATE TABLE IF NOT EXISTS "subscriptions" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT now(),
  "currentPeriodEnd" TIMESTAMP(3),
  "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  "stripeSubscriptionId" TEXT
);

CREATE TABLE IF NOT EXISTS "invoices" (
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
);

CREATE TABLE IF NOT EXISTS "payment_methods" (
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
);

ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "organizationId" TEXT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_name='organizations' AND constraint_name='organizations_ownerId_fkey') THEN
    ALTER TABLE "organizations" ADD CONSTRAINT organizations_ownerId_fkey FOREIGN KEY ("ownerId") REFERENCES "users" ("id") ON DELETE CASCADE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_name='organization_memberships' AND constraint_name='organization_memberships_organizationId_fkey') THEN
    ALTER TABLE "organization_memberships" ADD CONSTRAINT organization_memberships_organizationId_fkey FOREIGN KEY ("organizationId") REFERENCES "organizations" ("id") ON DELETE CASCADE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_name='organization_memberships' AND constraint_name='organization_memberships_userId_fkey') THEN
    ALTER TABLE "organization_memberships" ADD CONSTRAINT organization_memberships_userId_fkey FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_name='subscriptions' AND constraint_name='subscriptions_organizationId_fkey') THEN
    ALTER TABLE "subscriptions" ADD CONSTRAINT subscriptions_organizationId_fkey FOREIGN KEY ("organizationId") REFERENCES "organizations" ("id") ON DELETE CASCADE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_name='subscriptions' AND constraint_name='subscriptions_planId_fkey') THEN
    ALTER TABLE "subscriptions" ADD CONSTRAINT subscriptions_planId_fkey FOREIGN KEY ("planId") REFERENCES "subscription_plans" ("id") ON DELETE RESTRICT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_name='invoices' AND constraint_name='invoices_organizationId_fkey') THEN
    ALTER TABLE "invoices" ADD CONSTRAINT invoices_organizationId_fkey FOREIGN KEY ("organizationId") REFERENCES "organizations" ("id") ON DELETE CASCADE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_name='invoices' AND constraint_name='invoices_subscriptionId_fkey') THEN
    ALTER TABLE "invoices" ADD CONSTRAINT invoices_subscriptionId_fkey FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions" ("id") ON DELETE SET NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_name='payment_methods' AND constraint_name='payment_methods_organizationId_fkey') THEN
    ALTER TABLE "payment_methods" ADD CONSTRAINT payment_methods_organizationId_fkey FOREIGN KEY ("organizationId") REFERENCES "organizations" ("id") ON DELETE CASCADE;
  END IF;
END $$;
