import express from 'express';
import { protect, restrictTo } from '../middleware/authMiddleware.js';
import {
  createConsent,
  getConsent,
  updateConsent,
  revokeConsent,
  getCustomerConsents,
  getPartnerConsents,
  getAllConsents
} from '../controllers/consentController.js';

const router = express.Router();

// Protect all routes
router.use(protect);

// Admin routes
router.get('/', restrictTo('admin'), getAllConsents);

// Routes for specific consent
router.route('/:consentId')
  .get(getConsent)
  .put(updateConsent);

// Revoke consent
router.post('/:consentId/revoke', revokeConsent);

// Create new consent
router.post('/', createConsent);

// Get consents for a customer
router.get('/customer/:customerId', getCustomerConsents);

// Get consents for a partner
router.get('/partner/:partnerId', getPartnerConsents);

export default router;
