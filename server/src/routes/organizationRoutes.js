import { Router } from 'express';
import { authenticate } from '../middlewares/auth.js';
import {
  addOrganizationMember,
  createOrganization,
  getOrganization,
  listOrganizations,
  listPlans,
  updateOrganization,
  listOrganizationInvoices,
  listOrganizationPaymentMethods,
  createSubscription,
  addPaymentMethod,
} from '../controllers/organizationController.js';

const router = Router();

router.get('/', authenticate, listOrganizations);
router.post('/', authenticate, createOrganization);
router.get('/plans', authenticate, listPlans);
router.get('/:id', authenticate, getOrganization);
router.put('/:id', authenticate, updateOrganization);
router.get('/:id/invoices', authenticate, listOrganizationInvoices);
router.get('/:id/payment-methods', authenticate, listOrganizationPaymentMethods);
router.post('/:id/subscriptions', authenticate, createSubscription);
router.post('/:id/payment-methods', authenticate, addPaymentMethod);
router.post('/:id/members', authenticate, addOrganizationMember);

export default router;
