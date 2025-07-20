import express from 'express';
import { protect, restrictTo } from '../middleware/authMiddleware.js';
import { partnerProtect } from '../middleware/partnerProtect.js'; // ✅ You already have this!

import {
  registerPartner,
  getPartner,
  updatePartner,
  getAllPartners,
  updatePartnerKey,
  partnerDataRequest,
  getPartnerConsents,
  approvePartnerContract,
  getPendingContractPartners,
  getApprovedPartners,
  getPartnerContract
} from '../controllers/partnerController.js';

const router = express.Router();

// Customer-accessible route to get approved partners for selection
router.get('/approved', protect, getApprovedPartners);

// Get partner contract details for consent creation
router.get('/:partnerId/contract', protect, getPartnerContract);


// New admin routes for contract management
router.get('/pending-contracts', protect, restrictTo('admin'), getPendingContractPartners);
router.post('/:partnerId/contract/approve', protect, restrictTo('admin'), approvePartnerContract);

/**
 * Admin-only endpoints (protected with JWT-based protect middleware)
 * These require login with username/password and receive JWT.
 */
// Only apply protect middleware to admin routes, not all routes
router.get('/', protect, restrictTo('admin'), getAllPartners);
router.post('/register', protect, registerPartner);
router.get('/:partnerId', protect, getPartner);
router.put('/:partnerId', protect, updatePartner);
router.post('/:partnerId/keys', protect, updatePartnerKey);

/**
 * Partner endpoints (protected with your custom partnerProtect middleware)
 * These are for partners sending partnerId + API token, no JWT.
 */
router.post('/data-request', partnerProtect, partnerDataRequest);
router.get('/consents', partnerProtect, getPartnerConsents);

export default router;
