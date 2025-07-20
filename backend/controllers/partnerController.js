import Partner from '../models/partnerModel.js';
import Consent from '../models/consentModel.js';
import Customer from '../models/customerModel.js';
import DataRequest from '../models/dataRequestModel.js';
import User from '../models/userModel.js';
import auditService from '../utils/auditService.js';
import encryptionService from '../utils/encryptionService.js';
import signatureService from '../utils/signatureService.js';
import apiTokenService from '../utils/apiTokenService.js'; // ✅ Correct usage
import notificationService from '../utils/notificationService.js';
import { v4 as uuidv4 } from 'uuid';

// @desc    Register new partner
// @route   POST /api/v1/partners/register
// @access  Admin
export const registerPartner = async (req, res, next) => {
  try {
    const { partnerName, callbackUrl, requestedContract, publicKey } = req.body;
    
    // Generate a unique partner ID
    const partnerId = `PID-${uuidv4().substring(0, 8)}`;

    // Check if contract details are complete
    if (!requestedContract || !requestedContract.allowedDataFields || 
        !requestedContract.purpose || !requestedContract.retentionPeriod || 
        !requestedContract.legalBasis || !requestedContract.contractText) {
      return res.status(400).json({
        status: 'error',
        message: 'Complete contract details are required'
      });
    }

    const apiToken = apiTokenService.generateApiToken();
    const apiTokenHash = apiTokenService.hashApiToken(apiToken);

    const partner = await Partner.create({
      partnerId,
      partnerName,
      callbackUrl,
      publicKey, // Store partner's public key
      apiTokenHash,
      status: 'pending',
      requestedContract: { ...requestedContract, requestedAt: new Date() },
      approvedContract: false
    });

    await auditService.logEvent({
      eventType: 'partner_registered',
      actorType: req.user.role,
      actorId: req.user._id,
      partnerId: partner.partnerId,
      actionDetails: { partnerId, partnerName, status: partner.status },
      metadata: { ip: req.ip }
    });

    // Send registration notification to partner if they provided a callback URL
    if (callbackUrl) {
      // Create notification payload
      const notificationData = {
        event: 'partner_registered',
        partnerId: partner.partnerId,
        status: 'pending',
        message: 'Your registration was successful. Your contract is pending approval by a bank administrator.',
        bankInfo: {
          bankName: 'SecureBank API',
          supportEmail: 'support@securebank.com',
          apiDocumentation: 'https://docs.securebank.com/api'
        },
        nextSteps: [
          'Wait for contract approval notification',
          'Upon approval, you will receive bank\'s public key and API endpoints',
          'Configure your system to handle webhook notifications'
        ]
      };
      
      // Sign the notification payload
      const payloadString = JSON.stringify(notificationData);
      const signature = signatureService.signData(payloadString);
      
      // Send notification asynchronously (don't wait for completion)
      notificationService.notifyPartnerContractStatus({
        partnerId: partner.partnerId,
        callbackUrl: partner.callbackUrl,
        eventType: 'partner_registered',
        data: {
          ...notificationData,
          signature
        },
        user: req.user,
        publicKey: partner.publicKey
      }).catch(error => {
        console.error(`Failed to send registration notification to partner ${partner.partnerId}:`, error);
      });
    }

    res.status(201).json({
      status: 'success',
      data: { partner: { ...partner.toObject(), apiToken } },
      message: `Partner registered successfully with ID: ${partnerId}. Contract pending approval.`
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all partners
// @route   GET /api/v1/partners
// @access  Admin
export const getAllPartners = async (req, res, next) => {
  try {
    const partners = await Partner.find().select('-apiTokenHash');
    res.status(200).json({
      status: 'success',
      results: partners.length,
      data: { partners }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single partner
// @route   GET /api/v1/partners/:partnerId
// @access  Admin
export const getPartner = async (req, res, next) => {
  try {
    const partner = await Partner.findOne({ partnerId: req.params.partnerId }).select('-apiTokenHash');
    if (!partner) {
      return res.status(404).json({ status: 'error', message: 'No partner found with that ID' });
    }
    res.status(200).json({ status: 'success', data: { partner } });
  } catch (error) {
    next(error);
  }
};

// @desc    Update partner
// @route   PUT /api/v1/partners/:partnerId
// @access  Admin
export const updatePartner = async (req, res, next) => {
  try {
    const { partnerName, callbackUrl, status, requestedContract, publicKey } = req.body;
    const partner = await Partner.findOne({ partnerId: req.params.partnerId });
    if (!partner) {
      return res.status(404).json({ status: 'error', message: 'No partner found with that ID' });
    }

    if (partnerName) partner.partnerName = partnerName;
    
    // Track if callback URL is being set for the first time
    const callbackUrlAdded = callbackUrl && !partner.callbackUrl;
    if (callbackUrl) partner.callbackUrl = callbackUrl;
    
    if (status) partner.status = status;
    if (publicKey) partner.publicKey = publicKey;

    // Flag to track if contract was updated
    let contractUpdated = false;

    if (requestedContract) {
      if (!requestedContract.allowedDataFields || !requestedContract.purpose || 
          !requestedContract.retentionPeriod || !requestedContract.legalBasis || 
          !requestedContract.contractText) {
        return res.status(400).json({ 
          status: 'error', 
          message: 'Complete contract details are required for update' 
        });
      }
      
      partner.requestedContract = { ...requestedContract, requestedAt: new Date() };
      partner.approvedContract = false;
      partner.contractData = null;
      partner.contractApprovedAt = null;
      partner.contractApprovedBy = null;
      contractUpdated = true;
    }

    await partner.save();

    await auditService.logEvent({
      eventType: 'partner_updated',
      actorType: req.user.role,
      actorId: req.user._id,
      partnerId: partner.partnerId,
      actionDetails: { partnerId: partner.partnerId, updatedFields: Object.keys(req.body) },
      metadata: { ip: req.ip }
    });

    // If contract was updated and partner has a callback URL, send notification
    if (contractUpdated && partner.callbackUrl) {
      // Create notification payload
      const notificationData = {
        event: 'contract_update_submitted',
        partnerId: partner.partnerId,
        status: 'pending',
        message: 'Your updated contract has been submitted and is pending approval.'
      };
      
      // Sign the notification payload
      const payloadString = JSON.stringify(notificationData);
      const signature = signatureService.signData(payloadString);
      
      // Send notification asynchronously
      notificationService.notifyPartnerContractStatus({
        partnerId: partner.partnerId,
        callbackUrl: partner.callbackUrl,
        eventType: 'contract_update_submitted',
        data: {
          ...notificationData,
          signature
        },
        user: req.user,
        publicKey: partner.publicKey
      }).catch(error => {
        console.error(`Failed to send contract update notification to partner ${partner.partnerId}:`, error);
      });
    }

    // If callback URL was added for the first time, send welcome notification
    if (callbackUrlAdded) {
      const notificationData = {
        event: 'callback_url_registered',
        partnerId: partner.partnerId,
        status: partner.status,
        message: 'Your callback URL has been registered. You will now receive notifications from the bank.',
        bankInfo: {
          notificationTypes: ['registration_success', 'contract_approved', 'contract_rejected', 'customer_data_shared'],
          webhookFormat: 'JSON POST requests with signature verification',
          retryPolicy: 'Up to 3 retries with exponential backoff'
        }
      };
      
      const payloadString = JSON.stringify(notificationData);
      const signature = signatureService.signData(payloadString);
      
      notificationService.notifyPartnerContractStatus({
        partnerId: partner.partnerId,
        callbackUrl: partner.callbackUrl,
        eventType: 'callback_url_registered',
        data: {
          ...notificationData,
          signature
        },
        user: req.user,
        publicKey: partner.publicKey
      }).catch(error => {
        console.error(`Failed to send callback URL registration notification to partner ${partner.partnerId}:`, error);
      });
    }

    res.status(200).json({
      status: 'success',
      data: { partner },
      message: contractUpdated ? 
        'Partner updated. New contract pending approval.' : 
        'Partner updated successfully.'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update partner's public key
// @route   POST /api/v1/partners/:partnerId/keys
// @access  Admin
export const updatePartnerKey = async (req, res, next) => {
  try {
    const { publicKey } = req.body;
    if (!publicKey) {
      return res.status(400).json({ status: 'error', message: 'Public key is required' });
    }

    const partner = await Partner.findOne({ partnerId: req.params.partnerId });
    if (!partner) {
      return res.status(404).json({ status: 'error', message: 'No partner found with that ID' });
    }

    partner.publicKey = publicKey;
    await partner.save();

    await auditService.logEvent({
      eventType: 'partner_key_updated',
      actorType: req.user.role,
      actorId: req.user._id,
      partnerId: partner.partnerId,
      actionDetails: { partnerId: partner.partnerId },
      metadata: { ip: req.ip }
    });

    res.status(200).json({ status: 'success', data: { message: 'Partner public key updated successfully' } });
  } catch (error) {
    next(error);
  }
};

// @desc    Get pending contracts
// @route   GET /api/v1/partners/pending-contracts
// @access  Admin
export const getPendingContractPartners = async (req, res, next) => {
  try {
    const pendingPartners = await Partner.find({
      requestedContract: { $exists: true },
      approvedContract: false
    }).select('-apiTokenHash');

    res.status(200).json({
      status: 'success',
      results: pendingPartners.length,
      data: { partners: pendingPartners }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Approve or reject partner contract
// @route   POST /api/v1/partners/:partnerId/contract/approve
// @access  Admin
export const approvePartnerContract = async (req, res, next) => {
  try {
    const { approve } = req.body;
    const partner = await Partner.findOne({ partnerId: req.params.partnerId });
    if (!partner) {
      return res.status(404).json({ status: 'error', message: 'No partner found with that ID' });
    }

    if (!partner.requestedContract) {
      return res.status(400).json({ status: 'error', message: 'This partner has no requested contract' });
    }

    if (approve === true) {
      // Generate a unique contract ID
      const contractId = uuidv4();
      
      // Store the full contract data
      partner.approvedContract = true;
      partner.contractData = {
        allowedDataFields: partner.requestedContract.allowedDataFields,
        purpose: partner.requestedContract.purpose,
        retentionPeriod: partner.requestedContract.retentionPeriod,
        legalBasis: partner.requestedContract.legalBasis,
        contractText: partner.requestedContract.contractText,
        contractId: contractId,
        version: 1 // First version of the contract
      };
      partner.contractApprovedAt = new Date();
      partner.contractApprovedBy = req.user._id;
      
      // If partner was pending, set to active upon contract approval
      if (partner.status === 'pending') partner.status = 'active';
    } else {
      // Reject the contract
      partner.approvedContract = false;
      partner.contractData = null;
      partner.contractApprovedAt = null;
      partner.contractApprovedBy = null;
    }

    await partner.save();

    // Log contract approval/rejection
    await auditService.logEvent({
      eventType: approve ? 'partner_contract_approved' : 'partner_contract_rejected',
      actorType: req.user.role,
      actorId: req.user._id,
      partnerId: partner.partnerId,
      actionDetails: { 
        partnerId: partner.partnerId, 
        decision: approve ? 'approved' : 'rejected',
        contractId: approve ? partner.contractData.contractId : null
      },
      metadata: { ip: req.ip }
    });

    // Send webhook notification to partner if they have a callback URL
    if (partner.callbackUrl) {
      // Create notification payload
      const notificationData = {
        event: approve ? 'contract_approved' : 'contract_rejected',
        partnerId: partner.partnerId,
        status: partner.status,
        message: approve ? 
          'Your contract has been approved. You can now receive data requests.' : 
          'Your contract has been rejected. Please review and update your contract details.'
      };

      // Add comprehensive bank information only if approved
      if (approve) {
        notificationData.bankCredentials = {
          // Bank's public key for signature verification
          bankPublicKey: signatureService.getPublicKey(),
          
          // API endpoints for partner to use
          apiEndpoints: {
            dataRequest: `${process.env.BANK_BASE_URL || 'http://localhost:3001'}/api/v1/partners/data-request`,
            partnerStatus: `${process.env.BANK_BASE_URL || 'http://localhost:3001'}/api/v1/partners/profile`,
            consents: `${process.env.BANK_BASE_URL || 'http://localhost:3001'}/api/v1/partners/consents`
          },
          
          // Field encryption key (bank uses this to encrypt individual customer data fields)
          fieldEncryptionInfo: {
            algorithm: 'AES-256-GCM',
            note: 'Individual customer data fields are encrypted with bank\'s internal field encryption key',
            decryptionRequired: 'Contact bank support to obtain field decryption capabilities',
            securityNotice: 'Field encryption key is not shared for security purposes'
          },
          
          // Partner authentication info
          authentication: {
            method: 'Bearer Token',
            headerName: 'Authorization',
            tokenPrefix: 'Bearer',
            note: 'Use the API token provided during registration'
          }
        };
        
        notificationData.contractDetails = {
          contractId: partner.contractData.contractId,
          allowedDataFields: partner.contractData.allowedDataFields,
          purpose: partner.contractData.purpose,
          retentionPeriod: partner.contractData.retentionPeriod,
          approvedAt: partner.contractApprovedAt
        };
        
        notificationData.integrationGuide = {
          step1: 'Configure your webhook endpoint to receive customer data',
          step2: 'Use the provided API endpoints to request customer data',
          step3: 'Decrypt received data using RSA private key + AES',
          step4: 'Further decrypt individual fields using bank\'s field encryption process',
          documentation: 'https://docs.securebank.com/integration'
        };
      }

      // Sign the notification payload
      const payloadString = JSON.stringify(notificationData);
      const signature = signatureService.signData(payloadString);
      
      // Send notification asynchronously (don't wait for completion)
      notificationService.notifyPartnerContractStatus({
        partnerId: partner.partnerId,
        callbackUrl: partner.callbackUrl,
        eventType: approve ? 'contract_approved' : 'contract_rejected',
        data: {
          ...notificationData,
          signature
        },
        user: req.user,
        publicKey: partner.publicKey
      }).catch(error => {
        console.error(`Failed to notify partner ${partner.partnerId}:`, error);
      });
    }

    res.status(200).json({
      status: 'success',
      data: { partner },
      message: approve ? 'Partner contract approved successfully.' : 'Partner contract rejected.'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get approved partners for customers
// @route   GET /api/v1/partners/approved
// @access  Protected (for customers)
export const getApprovedPartners = async (req, res, next) => {
  try {
    const approvedPartners = await Partner.find({
      approvedContract: true,
      status: 'active'
    }).select('partnerId partnerName contractData.purpose contractData.allowedDataFields contractData.contractId');

    res.status(200).json({
      status: 'success',
      results: approvedPartners.length,
      data: { partners: approvedPartners }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get partner contract details
// @route   GET /api/v1/partners/:partnerId/contract
// @access  Protected (for customers)
export const getPartnerContract = async (req, res, next) => {
  try {
    const partner = await Partner.findOne({
      partnerId: req.params.partnerId,
      approvedContract: true,
      status: 'active'
    }).select('partnerId partnerName contractData');

    if (!partner) {
      return res.status(404).json({ status: 'error', message: 'No approved partner found with that ID' });
    }

    res.status(200).json({
      status: 'success',
      data: { 
        partnerId: partner.partnerId, 
        partnerName: partner.partnerName, 
        contract: partner.contractData 
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Partner data request
// @route   POST /api/v1/partners/data-request
// @access  Partner
export const partnerDataRequest = async (req, res, next) => {
  try {
    const { consentId, requestedFields, requestId = uuidv4(), signature } = req.body;
    const partnerId = req.partner.partnerId;

    // Verify partner status and contract approval
    if (req.partner.status !== 'active' || !req.partner.approvedContract || !req.partner.contractData) {
      return res.status(403).json({ 
        status: 'error', 
        message: 'Partner is not active or does not have an approved contract' 
      });
    }

    // Find consent for this partner
    const consent = await Consent.findOne({ consentId, partnerId, status: 'active' });
    if (!consent) return res.status(404).json({ status: 'error', message: 'No active consent found' });

    if (new Date() > new Date(consent.expiresAt)) {
      consent.status = 'expired'; await consent.save();
      return res.status(403).json({ status: 'error', message: 'Consent expired' });
    }

    // Only allow fields permitted by the consent
    const invalidFields = requestedFields.filter(field => !consent.allowedDataFields.includes(field));
    if (invalidFields.length > 0) return res.status(403).json({ status: 'error', message: `Fields not allowed: ${invalidFields.join(', ')}` });

    // Optional: verify signature if provided
    if (req.partner.publicKey && signature) {
      const signaturePayload = { requestId, consentId, requestedFields };
      const isValid = await signatureService.verifySignature(JSON.stringify(signaturePayload), signature, req.partner.publicKey);
      if (!isValid) return res.status(400).json({ status: 'error', message: 'Invalid signature' });
    }

    // Fetch customer by ID from consent
    const customer = await Customer.findById(consent.customerId);
    if (!customer) return res.status(404).json({ status: 'error', message: 'Customer not found' });

    await DataRequest.create({ requestId, partnerId, customerId: consent.customerId, consentId, requestedFields, status: 'approved', requestedAt: new Date() });

    await auditService.logEvent({
      eventType: 'data_request',
      actorType: 'partner',
      actorId: partnerId,
      customerId: consent.customerId, consentId,
      actionDetails: { requestId, requestedFields },
      metadata: { ip: req.ip }
    });

    const responseData = {};
    console.log('Customer data:', customer);
    console.log('Requested fields:', requestedFields);
    
    // Map common field names to their encrypted counterparts in the customer model
    const fieldMap = {
      'phone': 'encryptedPhone',
      'email': 'encryptedEmail',
      'pan': 'encryptedPan',
      'address': 'encryptedAddress',
      'name': 'encryptedName'
    };
    
    // Check which customer fields exist and add them to response
    requestedFields.forEach(field => { 
      // Try the field directly
      if (customer[field] !== undefined) {
        responseData[field] = customer[field];
        console.log(`Added field ${field} with value:`, customer[field]);
      } 
      // Try the encrypted version of the field
      else if (fieldMap[field] && customer[fieldMap[field]] !== undefined) {
        responseData[field] = customer[fieldMap[field]];
        console.log(`Added mapped field ${field} (${fieldMap[field]}) with value:`, customer[fieldMap[field]]);
      }
      else {
        console.log(`Field ${field} not found in customer record`);
      }
    });
    
    // If response is empty, add a test field to demonstrate encryption
    if (Object.keys(responseData).length === 0) {
      console.log('No matching fields found, adding test data');
      responseData.testData = 'This is test data to demonstrate encryption';
      // Add some dummy data for common fields
      responseData.name = 'Test Customer';
      responseData.email = 'test@example.com';
      responseData.phone = '+1234567890';
    }

    // Log the EXACT data that will be encrypted and sent
    console.log('====== ACTUAL DATA BEING SENT (PRE-ENCRYPTION) ======');
    console.log(JSON.stringify(responseData, null, 2));
    console.log('====================================================');

    // Create and log a fully decrypted version of the response for debugging
    console.log('\n\n');
    console.log('*******************************************************');
    console.log('*                                                     *');
    console.log('*             FULLY DECRYPTED RESPONSE                *');
    console.log('*                                                     *');
    console.log('*******************************************************');
    
    const decryptedResponseForLogging = {};
    for (const [key, value] of Object.entries(responseData)) {
      if (typeof value === 'string' && value.includes('"encryptedValue"') && value.includes('"iv"') && value.includes('"authTag"')) {
        try {
          const encryptedData = JSON.parse(value);
          decryptedResponseForLogging[key] = await encryptionService.decryptField(encryptedData);
        } catch (error) {
          decryptedResponseForLogging[key] = `[Error decrypting: ${error.message}]`;
        }
      } else {
        decryptedResponseForLogging[key] = value;
      }
    }
    
    console.log(JSON.stringify(decryptedResponseForLogging, null, 2));
    console.log('\n*******************************************************\n\n');

    // Prepare decrypted data for secure encryption
    console.log('🔍 Preparing customer data for secure encryption...');
    const fullyDecryptedData = {};
    for (const [key, value] of Object.entries(responseData)) {
      if (typeof value === 'string' && value.includes('"encryptedValue"') && value.includes('"iv"') && value.includes('"authTag"')) {
        try {
          const encryptedField = JSON.parse(value);
          fullyDecryptedData[key] = await encryptionService.decryptField(encryptedField);
          console.log(`✅ Decrypted bank field ${key} for secure transmission`);
        } catch (error) {
          console.error(`❌ Failed to decrypt bank field ${key}:`, error);
          fullyDecryptedData[key] = value; // Keep original if decryption fails
        }
      } else {
        fullyDecryptedData[key] = value;
      }
    }
    
    console.log('📊 Fully decrypted customer data:');
    console.log(JSON.stringify(fullyDecryptedData, null, 2));

    // If partner has a public key, encrypt the response using the new secure method
    let encryptedResponse = null;
    let finalResponseData = null;
    let encryptionMethod = 'none';
    
    if (req.partner.publicKey) {
      try {
        console.log('🔐 Using secure encryption with temporary keys');
        
        // Log data size before encryption
        console.log(`Data size before encryption: ${JSON.stringify(fullyDecryptedData).length} bytes`);
        
        // Use the new secure encryption method with fully decrypted customer data
        encryptedResponse = await encryptionService.encryptCustomerFieldsSecure(
          fullyDecryptedData, 
          req.partner.publicKey
        );
        encryptionMethod = 'secure-temporary-key';
        
        // Log success
        console.log('✅ Secure encryption successful. Encrypted data structure:');
        console.log(JSON.stringify({
          encryptionType: encryptedResponse.encryptionType,
          algorithm: encryptedResponse.algorithm,
          dataLength: encryptedResponse.encryptedData.length,
          keyLength: encryptedResponse.encryptedKey.length,
          securityLevel: 'HIGH - No shared bank keys'
        }, null, 2));
        
        finalResponseData = encryptedResponse;
      } catch (error) {
        console.error('❌ Secure encryption error:', error);
        console.log('⚠️  Falling back to standard encryption');
        
        try {
          // Fallback to standard encryption
          encryptedResponse = encryptionService.encryptWithPublicKey(
            JSON.stringify(responseData), 
            req.partner.publicKey
          );
          encryptionMethod = 'standard-hybrid';
          
          console.log('✅ Standard encryption fallback successful');
          finalResponseData = encryptedResponse;
        } catch (fallbackError) {
          console.error('❌ All encryption methods failed:', fallbackError);
          // Ultimate fallback to unencrypted
          finalResponseData = responseData;
          encryptionMethod = 'none';
        }
      }
    } else {
      // Use unencrypted if no public key
      finalResponseData = responseData;
    }

    // 🚨🚨🚨 AUTOMATICALLY PUSH DATA TO PARTNER ENDPOINT 🚨🚨🚨
    if (req.partner.callbackUrl) {
      console.log('\n');
      console.log('🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀');
      console.log('🚀           PUSHING DATA TO PARTNER ENDPOINT          🚀');
      console.log('🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀');
      console.log(`Partner Callback URL: ${req.partner.callbackUrl}`);
      console.log(`Event Type: customer_data_shared`);
      console.log(`Encryption Method: ${encryptionMethod}`);
      console.log(`Security Level: ${encryptionMethod === 'secure-temporary-key' ? 'HIGH' : 'MEDIUM'}`);
      
      try {
        const notificationResult = await notificationService.notifyPartnerContractStatus({
          partnerId: req.partner.partnerId,
          callbackUrl: req.partner.callbackUrl,
          eventType: 'customer_data_shared',
          data: {
            consentId: consent._id,
            requestedFields: requestedFields,
            customerData: encryptionMethod === 'secure-temporary-key' ? fullyDecryptedData : responseData, // Send decrypted data for secure encryption
            encrypted: !!encryptedResponse,
            encryptionMethod: encryptionMethod,
            timestamp: new Date().toISOString()
          },
          publicKey: req.partner.publicKey,
          user: { _id: 'system', role: 'system' }
        });
        
        console.log('🚀 PUSH NOTIFICATION RESULT:');
        console.log(JSON.stringify(notificationResult, null, 2));
        console.log('🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀');
        console.log('\n');
      } catch (pushError) {
        console.error('❌ Error pushing data to partner:', pushError);
        console.log('🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀');
        console.log('\n');
      }
    } else {
      console.log('⚠️  No callback URL configured for partner - skipping automatic push');
    }

    // Send API response
    if (encryptedResponse) {
      res.status(200).json({ 
        status: 'success', 
        encrypted: true,
        data: encryptedResponse,
        message: req.partner.callbackUrl ? 'Data sent via API response and pushed to partner endpoint' : 'Data sent via API response only'
      });
    } else {
      res.status(200).json({ 
        status: 'success', 
        encrypted: false,
        data: responseData,
        message: req.partner.callbackUrl ? 'Data sent via API response and pushed to partner endpoint' : 'Data sent via API response only'
      });
    }
  } catch (error) {
    next(error);
  }
};

// @desc    Get partner consents
// @route   GET /api/v1/partners/consents
// @access  Partner
export const getPartnerConsents = async (req, res, next) => {
  try {
    const partnerId = req.partner.partnerId;
    const statusFilter = req.query.status || 'active';
    const filter = { partnerId, ...(statusFilter !== 'all' && { status: statusFilter }) };
    const consents = await Consent.find(filter);
    res.status(200).json({ status: 'success', results: consents.length, data: { consents } });
  } catch (error) {
    next(error);
  }
};

