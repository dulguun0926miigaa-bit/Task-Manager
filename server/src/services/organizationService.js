import { prisma } from '../lib/prisma.js';

const verifyMembership = async (organizationId, userId) => {
  return prisma.organizationMembership.findFirst({ where: { organizationId, userId } });
};

export const organizationService = {
  async listOrganizations(userId) {
    return prisma.organization.findMany({
      where: { memberships: { some: { userId } } },
      include: {
        owner: { select: { id: true, username: true, email: true } },
        memberships: { include: { user: { select: { id: true, username: true, email: true } } } },
        subscriptions: { include: { plan: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  },

  async getOrganization(organizationId, userId) {
    return prisma.organization.findFirst({
      where: { id: organizationId, memberships: { some: { userId } } },
      include: {
        owner: { select: { id: true, username: true, email: true } },
        memberships: { include: { user: { select: { id: true, username: true, email: true } } } },
        subscriptions: { include: { plan: true } },
        invoices: true,
        paymentMethods: true,
      },
    });
  },

  async createOrganization({ name, slug, description, ownerId }) {
    return prisma.organization.create({
      data: {
        name,
        slug,
        description,
        ownerId,
        memberships: { create: [{ userId: ownerId, role: 'OWNER' }] },
      },
      include: {
        memberships: { include: { user: true } },
      },
    });
  },

  async addOrganizationMember(organizationId, userId, role = 'MEMBER') {
    const existing = await prisma.organizationMembership.findFirst({ where: { organizationId, userId } });
    if (existing) return existing;
    return prisma.organizationMembership.create({ data: { organizationId, userId, role } });
  },

  async updateOrganization(organizationId, userId, data) {
    const membership = await verifyMembership(organizationId, userId);
    if (!membership) throw new Error('Not authorized for this organization');
    return prisma.organization.update({
      where: { id: organizationId },
      data: {
        name: data.name,
        slug: data.slug,
        description: data.description,
      },
    });
  },

  async listSubscriptionPlans() {
    const plans = await prisma.subscriptionPlan.findMany({ where: { active: true }, orderBy: { priceCents: 'asc' } });
    if (plans.length > 0) return plans;

    const defaultPlans = [
      {
        name: 'Starter',
        slug: 'starter',
        description: 'Basic team collaboration for small teams',
        priceCents: 5000,
        interval: 'month',
        features: 'Up to 5 users, basic workspaces, task management',
      },
      {
        name: 'Growth',
        slug: 'growth',
        description: 'More team workflows and advanced organization controls',
        priceCents: 15000,
        interval: 'month',
        features: 'Up to 20 users, billing, reports, integrations',
      },
      {
        name: 'Enterprise',
        slug: 'enterprise',
        description: 'Full enterprise collaboration with premium support',
        priceCents: 35000,
        interval: 'month',
        features: 'Unlimited users, advanced security, dedicated support',
      },
    ];

    await prisma.subscriptionPlan.createMany({ data: defaultPlans, skipDuplicates: true });
    return prisma.subscriptionPlan.findMany({ where: { active: true }, orderBy: { priceCents: 'asc' } });
  },

  async listOrganizationInvoices(organizationId, userId) {
    const membership = await verifyMembership(organizationId, userId);
    if (!membership) throw new Error('Not authorized for this organization');
    return prisma.invoice.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' } });
  },

  async listOrganizationPaymentMethods(organizationId, userId) {
    const membership = await verifyMembership(organizationId, userId);
    if (!membership) throw new Error('Not authorized for this organization');
    return prisma.paymentMethod.findMany({ where: { organizationId }, orderBy: { isDefault: 'desc', createdAt: 'desc' } });
  },

  async createSubscription(userId, organizationId, planId) {
    const membership = await verifyMembership(organizationId, userId);
    if (!membership) throw new Error('Not authorized for this organization');

    const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
    if (!plan) throw new Error('Subscription plan not found');

    const currentPeriodEnd = new Date();
    currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);

    const subscription = await prisma.subscription.create({
      data: {
        organizationId,
        planId,
        status: 'ACTIVE',
        currentPeriodEnd,
      },
      include: { plan: true },
    });

    await prisma.invoice.create({
      data: {
        organizationId,
        subscriptionId: subscription.id,
        amountCents: plan.priceCents,
        currency: plan.currency,
        status: 'pending',
        dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        metadata: JSON.stringify({ planId: plan.id, planName: plan.name }),
      },
    });

    return subscription;
  },

  async addPaymentMethod(userId, organizationId, paymentData) {
    const membership = await verifyMembership(organizationId, userId);
    if (!membership) throw new Error('Not authorized for this organization');

    if (paymentData.isDefault) {
      await prisma.paymentMethod.updateMany({ where: { organizationId }, data: { isDefault: false } });
    }

    return prisma.paymentMethod.create({
      data: {
        organizationId,
        provider: paymentData.provider || 'manual',
        providerId: paymentData.providerId || `manual-${Date.now()}`,
        brand: paymentData.brand,
        last4: paymentData.last4,
        expMonth: paymentData.expMonth || null,
        expYear: paymentData.expYear || null,
        isDefault: paymentData.isDefault ?? true,
      },
    });
  },
};
