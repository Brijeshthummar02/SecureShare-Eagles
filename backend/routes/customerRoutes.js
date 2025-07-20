import express from 'express';
import { protect, restrictTo } from '../middleware/authMiddleware.js';
import {
  createCustomer,
  getCustomer,
  updateCustomer,
  deleteCustomer,
  getAllCustomers,
  createMyProfile,
  getMyProfile
} from '../controllers/customerController.js';

const router = express.Router();

// Protect all routes
router.use(protect);

// Customer routes - allows customers to manage their own profiles
router.route('/my-profile')
  .post(restrictTo('customer'), createMyProfile)
  .get(restrictTo('customer'), getMyProfile);

// Admin only routes
router.route('/')
  .get(restrictTo('admin'), getAllCustomers)
  .post(restrictTo('admin'), createCustomer);

// Admin only routes for specific customer
router.route('/:customerId')
  .get(restrictTo('admin'), getCustomer)
  .put(restrictTo('admin'), updateCustomer)
  .delete(restrictTo('admin'), deleteCustomer);

export default router;
