// middleware/partnerProtect.js
import Partner from '../models/partnerModel.js';
import crypto from 'crypto';

// Helper function to create an error with status code
const createError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

export const partnerProtect = async (req, res, next) => {
  const tokenHeader = req.headers.authorization;
  const partnerId = req.headers['x-partner-id'];

  if (!tokenHeader || !partnerId) {
    return next(createError(401, 'Missing partner token or partner ID'));
  }

  const token = tokenHeader.startsWith('Bearer ') ? tokenHeader.split(' ')[1] : tokenHeader;

  const partner = await Partner.findOne({ partnerId });
  if (!partner) {
    return next(createError(401, 'Invalid partner ID'));
  }

  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
  if (partner.apiTokenHash !== hashedToken) {
    return next(createError(401, 'Invalid partner token'));
  }

  // Set partner information for downstream middleware
  // Note: This creates a temporary user object for compatibility with existing auth checks
  // Partners use separate authentication but some endpoints still check req.user.role
  req.user = { role: 'partner', partnerId: partner.partnerId, _id: partner._id };
  req.partner = partner;
  next();
};
