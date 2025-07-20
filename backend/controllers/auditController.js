import AuditLog from '../models/auditLogModel.js';
import auditService from '../utils/auditService.js';

// @desc    Get all audit logs
// @route   GET /api/v1/audit/logs
// @access  Admin
export const getAuditLogs = async (req, res, next) => {
  try {
    // Allow filtering by various parameters
    const { 
      eventType, 
      actorType, 
      actorId,
      startDate,
      endDate,
      limit = 100,
      page = 1
    } = req.query;

    // Build the filter
    const filter = {};
    if (eventType) filter.eventType = eventType;
    if (actorType) filter.actorType = actorType;
    if (actorId) filter.actorId = actorId;
    
    // Date range filter
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Get logs with pagination
    const logs = await AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Count total logs for pagination
    const totalLogs = await AuditLog.countDocuments(filter);
    const totalPages = Math.ceil(totalLogs / limit);

    // Verify log integrity
    let integrityCheck = { valid: true, message: 'No logs to verify' };
    if (logs.length > 0) {
      // Only check the first 100 logs for performance
      const logsToCheck = Math.min(100, logs.length);
      const firstLog = logs[logs.length - logsToCheck];
      const lastLog = logs[0];
      
      integrityCheck = await auditService.verifyLogIntegrity(
        firstLog.logId,
        lastLog.logId
      );
    }

    res.status(200).json({
      status: 'success',
      results: logs.length,
      pagination: {
        totalLogs,
        totalPages,
        currentPage: parseInt(page),
        limit: parseInt(limit)
      },
      integrityCheck,
      data: {
        logs
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get audit logs for a consent
// @route   GET /api/v1/audit/consents/:consentId
// @access  Protected
export const getConsentAudit = async (req, res, next) => {
  try {
    const { consentId } = req.params;
    const { limit = 100, page = 1 } = req.query;

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Get logs with pagination
    const logs = await AuditLog.find({ consentId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Count total logs for pagination
    const totalLogs = await AuditLog.countDocuments({ consentId });
    const totalPages = Math.ceil(totalLogs / limit);

    res.status(200).json({
      status: 'success',
      results: logs.length,
      pagination: {
        totalLogs,
        totalPages,
        currentPage: parseInt(page),
        limit: parseInt(limit)
      },
      data: {
        logs
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get audit logs for a customer
// @route   GET /api/v1/audit/customers/:customerId
// @access  Protected
export const getCustomerAudit = async (req, res, next) => {
  try {
    const { customerId } = req.params;
    const { limit = 100, page = 1 } = req.query;

    // Check if user has permission to view customer's audit logs
    if (
      req.user.role !== 'admin' && 
      !(req.user.role === 'customer' && req.user.customerId === customerId)
    ) {
      return res.status(403).json({
        status: 'error',
        message: 'You do not have permission to view these audit logs'
      });
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Get logs with pagination
    const logs = await AuditLog.find({ customerId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Count total logs for pagination
    const totalLogs = await AuditLog.countDocuments({ customerId });
    const totalPages = Math.ceil(totalLogs / limit);

    res.status(200).json({
      status: 'success',
      results: logs.length,
      pagination: {
        totalLogs,
        totalPages,
        currentPage: parseInt(page),
        limit: parseInt(limit)
      },
      data: {
        logs
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get audit logs for a partner
// @route   GET /api/v1/audit/partners/:partnerId
// @access  Protected
export const getPartnerAudit = async (req, res, next) => {
  try {
    const { partnerId } = req.params;
    const { limit = 100, page = 1 } = req.query;

    // Only admin can view partner audit logs through this endpoint
    // Partners have their own separate authentication and endpoints if needed
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        status: 'error',
        message: 'You do not have permission to view these audit logs'
      });
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Get logs with pagination
    const logs = await AuditLog.find({ partnerId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Count total logs for pagination
    const totalLogs = await AuditLog.countDocuments({ partnerId });
    const totalPages = Math.ceil(totalLogs / limit);

    res.status(200).json({
      status: 'success',
      results: logs.length,
      pagination: {
        totalLogs,
        totalPages,
        currentPage: parseInt(page),
        limit: parseInt(limit)
      },
      data: {
        logs
      }
    });
  } catch (error) {
    next(error);
  }
};
