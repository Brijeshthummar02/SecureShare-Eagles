import fetch from 'node-fetch';
import auditService from './auditService.js';
import encryptionService from './encryptionService.js';
import Customer from '../models/customerModel.js';

/**
 * Service for sending notifications to partners
 */
const notificationService = {
  /**
   * Send a notification to a partner's callback URL
   * @param {Object} options - Notification options
   * @param {string} options.partnerId - Partner ID
   * @param {string} options.callbackUrl - Partner's callback URL
   * @param {string} options.eventType - Type of event (e.g., 'consent_created')
   * @param {Object} options.data - Data to send to the partner
   * @param {Object} options.user - User making the request (for audit logs)
   * @returns {Promise<Object>} - Response from the partner's callback URL
   */
  async notifyPartner(options) {
    const { partnerId, callbackUrl, eventType, data, user } = options;
    
    if (!callbackUrl) {
      console.warn(`No callback URL configured for partner: ${partnerId}`);
      return { success: false, message: 'No callback URL configured' };
    }

    try {
      // Create a notification object
      const notification = {
        eventType,
        timestamp: new Date().toISOString(),
        partnerId,
        data
      };

      // Send the notification to the partner's callback URL
      console.log(`Attempting to send notification to ${callbackUrl}`);
      console.log(`Notification payload:`, JSON.stringify(notification, null, 2));
      
      const response = await fetch(callbackUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Event-Type': eventType,
        },
        body: JSON.stringify(notification),
      });
      
      console.log(`Notification response status: ${response.status}`);
    
      // Check if the notification was successfully sent
      const success = response.ok;
      const responseData = await response.json().catch(() => ({}));

      // Log the notification event
      await auditService.logEvent({
        eventType: 'partner_notification_sent',
        actorType: user?.role || 'system',
        actorId: user?._id || 'system',
        partnerId,
        actionDetails: {
          eventType,
          callbackUrl,
          success,
          responseStatus: response.status,
        },
        metadata: { 
          responseBody: JSON.stringify(responseData).slice(0, 1000) // Truncate if too long
        }
      }).catch(err => console.error('Error logging notification:', err));

      return { 
        success, 
        status: response.status, 
        message: success ? 'Notification sent successfully' : 'Failed to send notification',
        response: responseData
      };
    } catch (error) {
      console.error(`Error notifying partner ${partnerId}:`, error);
      
      // Log the error
      await auditService.logEvent({
        eventType: 'partner_notification_failed',
        actorType: user?.role || 'system',
        actorId: user?._id || 'system',
        partnerId,
        actionDetails: {
          eventType,
          callbackUrl,
          error: error.message
        }
      }).catch(err => console.error('Error logging notification failure:', err));
      
      return { success: false, message: `Error: ${error.message}` };
    }
  },

  /**
   * Send a contract status notification to a partner's callback URL
   * This is a specialized version of notifyPartner for contract events
   * @param {Object} options - Notification options
   * @param {string} options.partnerId - Partner ID
   * @param {string} options.callbackUrl - Partner's callback URL
   * @param {string} options.eventType - Type of event (e.g., 'contract_approved')
   * @param {Object} options.data - Data to send to the partner including signature
   * @param {Object} options.user - User making the request (for audit logs)
   * @returns {Promise<Object>} - Response from the partner's callback URL
   */
  async notifyPartnerContractStatus(options) {
    const { partnerId, callbackUrl, eventType, data, user, publicKey } = options;
    
    if (!callbackUrl) {
      console.warn(`No callback URL configured for partner: ${partnerId}`);
      return { success: false, message: 'No callback URL configured' };
    }

    try {
      console.log(`Attempting to send ${eventType} notification to ${callbackUrl}`);
      
      const notificationPayload = {
        eventType,
        timestamp: new Date().toISOString(),
        partnerId,
        data
      };
      
      console.log(`Notification payload:`, JSON.stringify(notificationPayload, null, 2));
      
      // For contract status notifications, send unencrypted for easier partner integration
      // Only encrypt customer data notifications for security
      const shouldEncrypt = eventType === 'customer_data_shared' && publicKey;
      
      let headers = {
        'Content-Type': 'application/json',
        'X-Event-Type': eventType,
        'X-Partner-Id': partnerId
      };
      
      let body;
      
      if (shouldEncrypt) {
        try {
          // Use secure encryption that generates temporary keys per request
          // This eliminates the need for partners to have bank's internal encryption key
          let encryptedPayload;
          
          if (data.customerData) {
            // For customer data, use the new secure field encryption
            console.log('🔐 Using secure encryption for customer data');
            encryptedPayload = await encryptionService.encryptCustomerFieldsSecure(
              data.customerData,
              publicKey
            );
            
            headers['X-Encryption-Algorithm'] = 'SECURE-TEMPORARY-KEY';
            headers['X-Security-Level'] = 'HIGH';
            
            body = JSON.stringify({
              encrypted: true,
              encryptionType: 'secure-temporary-key',
              data: encryptedPayload,
              metadata: {
                ...data,
                customerData: undefined // Remove unencrypted customer data
              }
            });
            
            console.log('✅ Sending securely encrypted customer data notification');
          } else {
            // Fallback to regular RSA encryption for non-customer data
            encryptedPayload = encryptionService.encryptWithPublicKey(
              JSON.stringify(notificationPayload),
              publicKey
            );
            
            headers['X-Encryption-Algorithm'] = 'RSA-OAEP-SHA256+AES-256-GCM';
            body = JSON.stringify({
              encrypted: true,
              data: encryptedPayload
            });
            
            console.log('Sending standard encrypted notification');
          }
        } catch (encryptError) {
          console.error('Failed to encrypt notification:', encryptError);
          body = JSON.stringify(notificationPayload);
          console.log('Falling back to unencrypted notification');
        }
      } else {
        body = JSON.stringify(notificationPayload);
        console.log(`Sending unencrypted ${eventType} notification for easier partner integration`);
      }
      
      const response = await fetch(callbackUrl, {
        method: 'POST',
        headers,
        body
      });
      
      console.log(`Contract notification response status: ${response.status}`);
    
      // Check if the notification was successfully sent
      const success = response.ok;
      const responseData = await response.json().catch(() => ({}));

      // Log the notification event
      await auditService.logEvent({
        eventType: `partner_${eventType}_notification_sent`,
        actorType: user?.role || 'system',
        actorId: user?._id || 'system',
        partnerId,
        actionDetails: {
          eventType,
          callbackUrl,
          success,
          responseStatus: response.status,
        },
        metadata: { 
          responseBody: JSON.stringify(responseData).slice(0, 1000) // Truncate if too long
        }
      }).catch(err => console.error('Error logging notification:', err));

      return { 
        success, 
        status: response.status, 
        message: success ? 'Contract notification sent successfully' : 'Failed to send contract notification',
        response: responseData
      };
    } catch (error) {
      console.error(`Error notifying partner ${partnerId} about contract status:`, error);
      
      // Log the error
      await auditService.logEvent({
        eventType: `partner_${eventType}_notification_failed`,
        actorType: user?.role || 'system',
        actorId: user?._id || 'system',
        partnerId,
        actionDetails: {
          eventType,
          callbackUrl,
          error: error.message
        }
      }).catch(err => console.error('Error logging notification failure:', err));
      
      return { success: false, message: `Error: ${error.message}` };
    }
  },
};

export default notificationService;
