import Consent from '../models/consentModel.js';
import Customer from '../models/customerModel.js';
import Partner from '../models/partnerModel.js';
import auditService from '../utils/auditService.js';
import notificationService from '../utils/notificationService.js';

// @desc    Get all consents
// @route   GET /api/v1/consents
// @access  Admin
export const getAllConsents = async (req, res, next) => {
  try {
    const consents = await Consent.find();

    res.status(200).json({
      status: 'success',
      results: consents.length,
      data: {
        consents
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get consent by ID
// @route   GET /api/v1/consents/:consentId
// @access  Protected
export const getConsent = async (req, res, next) => {
  try {
    const consent = await Consent.findOne({ consentId: req.params.consentId });

    if (!consent) {
      return res.status(404).json({
        status: 'error',
        message: 'No consent found with that ID'
      });
    }

    // Check if user has permission to view this consent
    if (
      req.user.role !== 'admin' && 
      !(req.user.role === 'customer' && req.user.customerId === consent.customerId)
    ) {
      return res.status(403).json({
        status: 'error',
        message: 'You do not have permission to view this consent'
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        consent
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create new consent
// @route   POST /api/v1/consents
// @access  Protected
export const createConsent = async (req, res, next) => {
  try {
    const {
      customerId,
      partnerId,
      consentDuration
    } = req.body;

    // Validate consent duration
    if (!consentDuration) {
      return res.status(400).json({
        status: 'error',
        message: 'Consent duration is required'
      });
    }

    // Check if duration meets minimum requirement
    const minDuration = parseInt(process.env.MIN_CONSENT_DURATION_MS);
    if (consentDuration < minDuration) {
      const minHours = minDuration / (60 * 60 * 1000);
      return res.status(400).json({
        status: 'error',
        message: `Consent duration must be at least ${minHours} hour(s)`
      });
    }

    // Check if customer exists
    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({
        status: 'error',
        message: 'No customer found with that ID'
      });
    }

    // Check if partner exists
    const partner = await Partner.findOne({ partnerId });
    if (!partner) {
      return res.status(404).json({
        status: 'error',
        message: 'No partner found with that ID'
      });
    }

    // Check if partner has an approved contract
    if (!partner.approvedContract || !partner.contractData) {
      return res.status(403).json({
        status: 'error',
        message: 'This partner does not have an approved contract yet'
      });
    }

    // Use the approved contract details from the partner
    const { 
      allowedDataFields,
      purpose,
      retentionPeriod,
      legalBasis,
      contractText,
      contractId
    } = partner.contractData;

    // Extract device info from request
    const {
      consentMethod = 'app',
      deviceFingerprint,
      ipAddressHash,
      withdrawalMethod = 'app'
    } = req.body;

    // Calculate expiry date using the consentDuration (in milliseconds)
    const expiresAt = new Date(Date.now() + consentDuration);

    const newConsent = await Consent.create({
      consentDuration,
      customerId,
      partnerId,
      allowedDataFields,
      purpose,
      retentionPeriod,
      expiresAt,
      consentMethod,
      deviceFingerprint,
      ipAddressHash: ipAddressHash || req.ip,
      legalBasis,
      withdrawalMethod,
      contractText,
      contractId // Store the contract ID with the consent
    });

    // Log consent creation
    await auditService.logEvent({
      eventType: 'consent_created',
      actorType: req.user.role,
      actorId: req.user._id,
      consentId: newConsent.consentId,
      customerId,
      partnerId,
      actionDetails: {
        consentId: newConsent.consentId,
        allowedDataFields,
        purpose,
        retentionPeriod,
        contractId, // Add contract ID to audit log
        consentDuration,
        expiresAt
      },
      metadata: { ip: req.ip }
    });

    // Notify the partner about the new consent
    if (partner.callbackUrl && partner.status === 'active') {
      // Don't await - non-blocking notification
      notificationService.notifyPartner({
        partnerId,
        callbackUrl: partner.callbackUrl,
        eventType: 'consent_created',
        data: {
          consentId: newConsent.consentId,
          customerId,
          allowedDataFields,
          purpose,
          status: newConsent.status,
          consentDuration: newConsent.consentDuration,
          expiresAt: newConsent.expiresAt
        },
        user: req.user
      }).catch(error => {
        console.error(`Failed to notify partner ${partnerId}:`, error);
      });
    }

    res.status(201).json({
      status: 'success',
      data: {
        consent: newConsent
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update consent
// @route   PUT /api/v1/consents/:consentId
// @access  Protected
export const updateConsent = async (req, res, next) => {
  try {
    const {
      allowedDataFields,
      purpose,
      retentionPeriod,
      consentDuration,
      status
    } = req.body;

    const updateData = {};

    // Only update the fields that were provided
    if (allowedDataFields) updateData.allowedDataFields = allowedDataFields;
    if (purpose) updateData.purpose = purpose;
    if (status) updateData.status = status;
    
    // Handle consentDuration update if provided
    if (consentDuration) {
      // Check if duration meets minimum requirement
      const minDuration = parseInt(process.env.MIN_CONSENT_DURATION_MS);
      if (consentDuration < minDuration) {
        const minHours = minDuration / (60 * 60 * 1000);
        return res.status(400).json({
          status: 'error',
          message: `Consent duration must be at least ${minHours} hour(s)`
        });
      }
      
      updateData.consentDuration = consentDuration;
      // Calculate new expiry date
      updateData.expiresAt = new Date(Date.now() + consentDuration);
    }
    
    if (retentionPeriod) {
      updateData.retentionPeriod = retentionPeriod;
      
      // Recalculate expiry date if retention period changes
      const consent = await Consent.findOne({ consentId: req.params.consentId });
      if (consent) {
        const createdDate = new Date(consent.createdAt);
        const expiresAt = new Date(createdDate);
        expiresAt.setDate(expiresAt.getDate() + retentionPeriod);
        updateData.expiresAt = expiresAt;
      }
    }

    // Set the updated timestamp
    updateData.updatedAt = Date.now();

    const updatedConsent = await Consent.findOneAndUpdate(
      { consentId: req.params.consentId },
      updateData,
      {
        new: true,
        runValidators: true
      }
    );

    if (!updatedConsent) {
      return res.status(404).json({
        status: 'error',
        message: 'No consent found with that ID'
      });
    }

    // Check if user has permission to update this consent
    if (
      req.user.role !== 'admin' && 
      !(req.user.role === 'customer' && req.user.customerId === updatedConsent.customerId)
    ) {
      return res.status(403).json({
        status: 'error',
        message: 'You do not have permission to update this consent'
      });
    }

    // Log consent update
    await auditService.logEvent({
      eventType: 'consent_updated',
      actorType: req.user.role,
      actorId: req.user._id,
      consentId: updatedConsent.consentId,
      customerId: updatedConsent.customerId,
      partnerId: updatedConsent.partnerId,
      actionDetails: { 
        consentId: updatedConsent.consentId,
        updatedFields: Object.keys(req.body)
      },
      metadata: { ip: req.ip }
    });

    // Notify partner about consent update
    const partner = await Partner.findOne({ partnerId: updatedConsent.partnerId });
    if (partner && partner.callbackUrl && partner.status === 'active') {
      // Don't await - non-blocking notification
      notificationService.notifyPartner({
        partnerId: updatedConsent.partnerId,
        callbackUrl: partner.callbackUrl,
        eventType: 'consent_updated',
        data: {
          consentId: updatedConsent.consentId,
          customerId: updatedConsent.customerId,
          allowedDataFields: updatedConsent.allowedDataFields,
          purpose: updatedConsent.purpose,
          status: updatedConsent.status,
          expiresAt: updatedConsent.expiresAt,
          updatedAt: updatedConsent.updatedAt,
          updatedFields: Object.keys(req.body)
        },
        user: req.user
      }).catch(error => {
        console.error(`Failed to notify partner ${updatedConsent.partnerId} about update:`, error);
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        consent: updatedConsent
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Revoke consent
// @route   POST /api/v1/consents/:consentId/revoke
// @access  Protected
export const revokeConsent = async (req, res, next) => {
  try {
    const consent = await Consent.findOne({ consentId: req.params.consentId });

    if (!consent) {
      return res.status(404).json({
        status: 'error',
        message: 'No consent found with that ID'
      });
    }

    // Check if user has permission to revoke this consent
    if (
      req.user.role !== 'admin' && 
      !(req.user.role === 'customer' && req.user.customerId === consent.customerId)
    ) {
      return res.status(403).json({
        status: 'error',
        message: 'You do not have permission to revoke this consent'
      });
    }

    // Update consent status to revoked
    consent.status = 'revoked';
    consent.updatedAt = Date.now();
    await consent.save();

    // Log consent revocation
    await auditService.logEvent({
      eventType: 'consent_revoked',
      actorType: req.user.role,
      actorId: req.user._id,
      consentId: consent.consentId,
      customerId: consent.customerId,
      partnerId: consent.partnerId,
      actionDetails: { 
        consentId: consent.consentId,
        reason: req.body.reason || 'Not specified'
      },
      metadata: { ip: req.ip }
    });

    // Notify partner about consent revocation
    const partner = await Partner.findOne({ partnerId: consent.partnerId });
    if (partner && partner.callbackUrl && partner.status === 'active') {
      // Don't await - non-blocking notification
      notificationService.notifyPartner({
        partnerId: consent.partnerId,
        callbackUrl: partner.callbackUrl,
        eventType: 'consent_revoked',
        data: {
          consentId: consent.consentId,
          customerId: consent.customerId,
          status: 'revoked',
          reason: req.body.reason || 'Not specified',
          revokedAt: new Date().toISOString()
        },
        user: req.user
      }).catch(error => {
        console.error(`Failed to notify partner ${consent.partnerId} about revocation:`, error);
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        consent
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get consents for a customer
// @route   GET /api/v1/customers/:customerId/consents
// @access  Protected
export const getCustomerConsents = async (req, res, next) => {
  try {
    const customerId = req.params.customerId;

    // Check if user has permission to view customer's consents
    if (
      req.user.role !== 'admin' && 
      !(req.user.role === 'customer' && req.user.customerId === customerId)
    ) {
      return res.status(403).json({
        status: 'error',
        message: 'You do not have permission to view these consents'
      });
    }

    const consents = await Consent.find({ customerId });

    res.status(200).json({
      status: 'success',
      results: consents.length,
      data: {
        consents
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get consents for a partner
// @route   GET /api/v1/partners/:partnerId/consents
// @access  Protected
export const getPartnerConsents = async (req, res, next) => {
  try {
    const partnerId = req.params.partnerId;

    // Check if user has permission to view partner's consents
    // Only admin can view partner consents through this endpoint
    // Partners use their own separate authentication and endpoints
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        status: 'error',
        message: 'You do not have permission to view these consents'
      });
    }

    const consents = await Consent.find({ 
      partnerId,
      status: 'active' // Only show active consents
    });

    res.status(200).json({
      status: 'success',
      results: consents.length,
      data: {
        consents
      }
    });
  } catch (error) {
    next(error);
  }
};
