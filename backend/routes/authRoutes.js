import express from 'express';
import { protect, restrictTo } from '../middleware/authMiddleware.js';
import {
  login,
  signup,
  logout,
  refreshToken,
  verifyToken
} from '../controllers/authController.js';

const router = express.Router();

// Public routes
router.post('/login', login);
router.post('/signup', signup);
router.post('/logout', logout);
router.post('/refresh-token', refreshToken);
router.post('/verify-token', verifyToken);

export default router;
