import express from 'express';
import { protect, restrictTo } from '../middleware/authMiddleware.js';
import {
  getAuditLogs,
  getConsentAudit,
  getCustomerAudit,
  getPartnerAudit
} from '../controllers/auditController.js';

const router = express.Router();

// Protect all routes
router.use(protect);

// Admin only routes
router.get('/logs', restrictTo('admin'), getAuditLogs);

// Consent audit logs
router.get('/consents/:consentId', getConsentAudit);

// Customer audit logs
router.get('/customers/:customerId', getCustomerAudit);

// Partner audit logs
router.get('/partners/:partnerId', getPartnerAudit);

export default router;
