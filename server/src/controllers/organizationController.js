import { organizationService } from '../services/organizationService.js';

export const listOrganizations = async (req, res, next) => {
  try {
    const organizations = await organizationService.listOrganizations(req.user.id);
    res.json({ organizations });
  } catch (error) {
    next(error);
  }
};

export const getOrganization = async (req, res, next) => {
  try {
    const organization = await organizationService.getOrganization(req.params.id, req.user.id);
    if (!organization) return res.status(404).json({ message: 'Organization not found' });
    res.json({ organization });
  } catch (error) {
    next(error);
  }
};

export const createOrganization = async (req, res, next) => {
  try {
    const { name, slug, description } = req.body;
    if (!name || !slug) return res.status(400).json({ message: 'Name and slug are required' });
    const organization = await organizationService.createOrganization({
      name,
      slug,
      description,
      ownerId: req.user.id,
    });
    res.status(201).json({ organization });
  } catch (error) {
    next(error);
  }
};

export const addOrganizationMember = async (req, res, next) => {
  try {
    const { userId, role } = req.body;
    if (!userId) return res.status(400).json({ message: 'User ID is required' });
    const member = await organizationService.addOrganizationMember(req.params.id, userId, role);
    res.status(201).json({ member });
  } catch (error) {
    next(error);
  }
};

export const updateOrganization = async (req, res, next) => {
  try {
    const { name, slug, description } = req.body;
    if (!name || !slug) return res.status(400).json({ message: 'Name and slug are required' });
    const organization = await organizationService.updateOrganization(req.params.id, req.user.id, { name, slug, description });
    res.json({ organization });
  } catch (error) {
    next(error);
  }
};

export const listOrganizationInvoices = async (req, res, next) => {
  try {
    const invoices = await organizationService.listOrganizationInvoices(req.params.id, req.user.id);
    res.json({ invoices });
  } catch (error) {
    next(error);
  }
};

export const listOrganizationPaymentMethods = async (req, res, next) => {
  try {
    const paymentMethods = await organizationService.listOrganizationPaymentMethods(req.params.id, req.user.id);
    res.json({ paymentMethods });
  } catch (error) {
    next(error);
  }
};

export const createSubscription = async (req, res, next) => {
  try {
    const { planId } = req.body;
    if (!planId) return res.status(400).json({ message: 'Plan ID is required' });
    const subscription = await organizationService.createSubscription(req.user.id, req.params.id, planId);
    res.status(201).json({ subscription });
  } catch (error) {
    next(error);
  }
};

export const addPaymentMethod = async (req, res, next) => {
  try {
    const paymentData = req.body;
    if (!paymentData.last4) return res.status(400).json({ message: 'Payment method last4 digits are required' });
    const paymentMethod = await organizationService.addPaymentMethod(req.user.id, req.params.id, paymentData);
    res.status(201).json({ paymentMethod });
  } catch (error) {
    next(error);
  }
};

export const listPlans = async (_req, res, next) => {
  try {
    const plans = await organizationService.listSubscriptionPlans();
    res.json({ plans });
  } catch (error) {
    next(error);
  }
};
