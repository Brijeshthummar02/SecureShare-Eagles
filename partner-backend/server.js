import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import decryptionService from './decryptionService.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Partner Backend - Data Decryption Service',
    status: 'running',
    version: '1.0.0',
    privateKeyLoaded: !!decryptionService.privateKey,
    endpoints: {
      'GET /': 'This endpoint',
      'GET /health': 'Health check',
      'GET /public-key': 'Get your public key for bank registration',
      'POST /receive-data': '🎯 MAIN ENDPOINT - Bank sends encrypted customer data here',
      'POST /webhook': 'Receive notifications from bank',
      'POST /decrypt': 'Decrypt data received from bank',
      'POST /request-data': 'Request customer data from bank',
      'POST /generate-keys': 'Generate new RSA key pair',
      'GET /test-decrypt': 'Test decryption endpoint'
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    privateKeyLoaded: !!decryptionService.privateKey
  });
});

// Get public key for bank registration
app.get('/public-key', (req, res) => {
  try {
    if (!decryptionService.privateKey) {
      return res.status(500).json({
        status: 'error',
        message: 'Private key not loaded. Please generate keys first.'
      });
    }

    const publicKey = decryptionService.getPublicKey();
    
    res.json({
      status: 'success',
      message: 'Public key retrieved successfully',
      publicKey: publicKey,
      instructions: [
        '1. Copy the public key below',
        '2. Register with the bank using this public key',
        '3. Configure your .env file with the partner credentials received from the bank'
      ]
    });
  } catch (error) {
    console.error('Public key retrieval error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve public key',
      error: error.message
    });
  }
});

// Generate new RSA key pair
app.post('/generate-keys', (req, res) => {
  try {
    const { keySize = 2048 } = req.body;
    
    console.log(`🔑 Generating new ${keySize}-bit RSA key pair...`);
    const { publicKey, privateKey } = decryptionService.generateKeyPair(keySize);
    
    // Save keys to files
    const keysDir = path.join(process.cwd(), 'keys');
    if (!fs.existsSync(keysDir)) {
      fs.mkdirSync(keysDir, { recursive: true });
    }
    
    fs.writeFileSync(path.join(keysDir, 'private_key.pem'), privateKey);
    fs.writeFileSync(path.join(keysDir, 'public_key.pem'), publicKey);
    
    // Reload the private key in the service
    decryptionService.privateKey = privateKey;
    
    console.log('✅ New key pair generated and saved');
    
    res.json({
      status: 'success',
      message: 'New RSA key pair generated successfully',
      keySize: keySize,
      publicKey: publicKey,
      warning: 'Keep your private key secure and never share it!',
      nextSteps: [
        '1. Register with the bank using the public key above',
        '2. Update your .env file with partner credentials from the bank',
        '3. Restart the server to ensure proper key loading'
      ]
    });
  } catch (error) {
    console.error('Key generation error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to generate key pair',
      error: error.message
    });
  }
});

// Receive encrypted data from bank (main data endpoint)
app.post('/receive-data', (req, res) => {
  console.log('\n� Data received from bank at', new Date().toISOString());
  console.log('📋 Request data:', JSON.stringify(req.body, null, 2));
  
  try {
    const { 
      encrypted, 
      data, 
      consentId, 
      requestId, 
      partnerId,
      timestamp,
      signature,
      ...otherFields
    } = req.body;
    
    const isEncrypted = encrypted || (data && data.encrypted) || false;
    const encryptionType = data && data.encryptionType;
    const actualData = data && data.customerData ? data.customerData : data;
    
    // Handle bank notifications
    if (otherFields.eventType) {
      console.log(`📧 Bank notification: ${otherFields.eventType}`);
      
      switch (otherFields.eventType) {
        case 'partner_registered':
          console.log('🎉 Registration successful - waiting for approval');
          break;
        case 'contract_approved':
          console.log('✅ Contract approved - ready to receive data');
          break;
        case 'contract_rejected':
          console.log('❌ Contract rejected - please review');
          break;
        case 'customer_data_shared':
          console.log('📊 Customer data received');
          break;
        default:
          console.log(`📧 Event: ${otherFields.eventType}`);
      }
    }
    let finalData = actualData;
    let decryptionSuccess = false;
    
    // Process encrypted data
    if (isEncrypted && actualData) {
      try {
        console.log(`🔓 Decrypting data using ${encryptionType || 'standard'} encryption...`);
        
        // Handle new secure encryption format
        if (encryptionType === 'secure-temporary-key' && actualData.encryptionType === 'secure-temporary-key') {
          console.log('🛡️ Using secure temporary key decryption');
          finalData = decryptionService.decryptSecureData(actualData);
          decryptionSuccess = true;
          console.log('✅ Secure decryption completed successfully');
          
        } else if (actualData.algorithm) {
          finalData = decryptionService.decryptHybridData(actualData);
          decryptionSuccess = true;
          console.log('✅ Standard decryption completed successfully');
          
          // Apply legacy field-level decryption if needed
          if (finalData && finalData.customerData) {
            const fullyDecryptedCustomerData = decryptionService.decryptCustomerFields(finalData.customerData);
            finalData.customerData = fullyDecryptedCustomerData;
          } else if (finalData && typeof finalData === 'object') {
            const fullyDecryptedData = decryptionService.decryptCustomerFields(finalData);
            Object.assign(finalData, fullyDecryptedData);
          }
        } else {
          console.log('❌ No valid encryption algorithm found');
        }
        
      } catch (decryptError) {
        console.error('❌ Decryption failed:', decryptError.message);
        return res.status(400).json({
          status: 'error',
          message: 'Failed to decrypt data',
          error: decryptError.message,
          requestId: requestId || 'unknown',
          receivedAt: new Date().toISOString()
        });
      }
    }
    
    console.log('\n🎯 PROCESSING COMPLETE');
    console.log('========================');
    console.log('✅ Data received and processed successfully');
    console.log(`📊 Data fields: ${finalData ? Object.keys(finalData).join(', ') : 'none'}`);
    console.log(`🔓 Decryption: ${decryptionSuccess ? 'SUCCESS' : 'NOT REQUIRED'}`);
    
    // Log the actual decrypted customer data
    if (decryptionSuccess && finalData) {
      console.log('\n📋 DECRYPTED CUSTOMER DATA:');
      console.log('============================');
      console.log(JSON.stringify(finalData, null, 2));
    }
    
    // Send success response
    const response = {
      status: 'success',
      message: 'Customer data received and processed successfully',
      requestId: requestId || `auto-${Date.now()}`,
      consentId: consentId || (data && data.consentId) || 'not-provided',
      dataReceived: !!finalData,
      decrypted: decryptionSuccess,
      processedAt: new Date().toISOString(),
      dataFields: finalData ? Object.keys(finalData) : [],
      // For testing purposes, include raw request info
      debug: {
        hasEncryptedFlag: !!encrypted,
        hasDataEncryptedFlag: !!(data && data.encrypted),
        detectedEncrypted: isEncrypted,
        hasDataField: !!actualData,
        hasConsentId: !!(consentId || (data && data.consentId)),
        hasRequestId: !!requestId,
        totalFields: Object.keys(req.body).length
      }
    };
    
    console.log('\n📤 SENDING RESPONSE:');
    console.log('====================');
    console.log(JSON.stringify(response, null, 2));
    console.log('\n🎯 ===== END RECEIVE-DATA PROCESSING =====\n');
    
    res.json(response);
    
  } catch (error) {
    console.error('\n❌ GENERAL ERROR!');
    console.error('==================');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    
    res.status(500).json({
      status: 'error',
      message: 'Failed to process received data',
      error: error.message,
      receivedAt: new Date().toISOString()
    });
  }
});

// Webhook endpoint to receive notifications from bank
app.post('/webhook', (req, res) => {
  console.log('\n🔔 Received webhook notification from bank:');
  console.log('Headers:', req.headers);
  console.log('Body:', JSON.stringify(req.body, null, 2));
  
  try {
    const { event, partnerId, status, message, signature, bankPublicKey } = req.body;
    
    // Log the notification details
    console.log(`\n📋 Notification Details:`);
    console.log(`- Event: ${event}`);
    console.log(`- Partner ID: ${partnerId}`);
    console.log(`- Status: ${status}`);
    console.log(`- Message: ${message}`);
    
    // Verify signature if provided
    if (signature && bankPublicKey) {
      const dataToVerify = JSON.stringify({ event, partnerId, status, message });
      const isValid = decryptionService.verifySignature(dataToVerify, signature, bankPublicKey);
      console.log(`- Signature Valid: ${isValid}`);
    }
    
    res.json({
      status: 'success',
      message: 'Webhook received successfully',
      receivedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(400).json({
      status: 'error',
      message: 'Failed to process webhook',
      error: error.message
    });
  }
});

// Decrypt data endpoint
app.post('/decrypt', (req, res) => {
  console.log('\n🔐 Decrypt request received:');
  
  try {
    const { encryptedData, metadata } = req.body;
    
    if (!encryptedData) {
      return res.status(400).json({
        status: 'error',
        message: 'No encrypted data provided'
      });
    }
    
    console.log('Encrypted data structure:', {
      algorithm: encryptedData.algorithm,
      hasEncryptedData: !!encryptedData.encryptedData,
      hasEncryptedKey: !!encryptedData.encryptedKey,
      hasIV: !!encryptedData.iv,
      hasAuthTag: !!encryptedData.authTag
    });
    
    // Decrypt the data
    const decryptedData = decryptionService.decryptHybridData(encryptedData);
    
    console.log('\n✅ Decryption successful!');
    console.log('Decrypted data:', JSON.stringify(decryptedData, null, 2));
    
    res.json({
      status: 'success',
      message: 'Data decrypted successfully',
      data: decryptedData,
      metadata: {
        decryptedAt: new Date().toISOString(),
        algorithm: encryptedData.algorithm,
        ...metadata
      }
    });
  } catch (error) {
    console.error('Decryption error:', error);
    res.status(400).json({
      status: 'error',
      message: 'Failed to decrypt data',
      error: error.message
    });
  }
});

// Request customer data from bank
app.post('/request-data', async (req, res) => {
  console.log('\n📤 Data request initiated:');
  
  try {
    const { consentId, requestedFields } = req.body;
    
    if (!consentId || !requestedFields) {
      return res.status(400).json({
        status: 'error',
        message: 'consentId and requestedFields are required'
      });
    }
    
    const partnerId = process.env.PARTNER_ID;
    const apiToken = process.env.API_TOKEN;
    const bankApiUrl = process.env.BANK_API_URL;
    
    if (!partnerId || !apiToken || !bankApiUrl) {
      return res.status(500).json({
        status: 'error',
        message: 'Partner credentials not configured. Check PARTNER_ID, API_TOKEN, and BANK_API_URL'
      });
    }
    
    console.log(`Requesting data for consent: ${consentId}`);
    console.log(`Requested fields: ${requestedFields.join(', ')}`);
    
    // Make request to bank API
    const response = await axios.post(`${bankApiUrl}/partners/data-request`, {
      consentId,
      requestedFields,
      requestId: `REQ-${Date.now()}`
    }, {
      headers: {
        'X-Partner-ID': partnerId,
        'X-API-Token': apiToken,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('\n🏦 Bank response received');
    console.log('Status:', response.status);
    console.log('Encrypted:', response.data.encrypted);
    
    let finalData = response.data;
    
    // If data is encrypted, decrypt it
    if (response.data.encrypted && response.data.data) {
      try {
        console.log('\n🔓 Decrypting received data...');
        const decryptedData = decryptionService.decryptHybridData(response.data.data);
        finalData = {
          ...response.data,
          data: decryptedData,
          decrypted: true
        };
        console.log('✅ Data decrypted successfully');
      } catch (decryptError) {
        console.error('❌ Decryption failed:', decryptError.message);
        finalData.decryptionError = decryptError.message;
      }
    }
    
    console.log('\n📋 Final response data:', JSON.stringify(finalData, null, 2));
    
    res.json({
      status: 'success',
      message: 'Data request completed',
      bankResponse: finalData,
      requestDetails: {
        consentId,
        requestedFields,
        requestedAt: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('Data request error:', error);
    
    if (error.response) {
      // Bank API returned an error
      res.status(error.response.status).json({
        status: 'error',
        message: 'Bank API error',
        bankError: error.response.data,
        statusCode: error.response.status
      });
    } else {
      // Network or other error
      res.status(500).json({
        status: 'error',
        message: 'Failed to request data from bank',
        error: error.message
      });
    }
  }
});

// Test endpoint for manual testing
app.get('/test-decrypt', (req, res) => {
  const sampleEncryptedData = {
    algorithm: 'RSA-OAEP-SHA256+AES-256-GCM',
    encryptedData: 'sample_encrypted_data_here',
    encryptedKey: 'sample_encrypted_key_here',
    iv: 'sample_iv_here',
    authTag: 'sample_auth_tag_here'
  };
  
  res.json({
    message: 'Use POST /decrypt with encrypted data',
    samplePayload: {
      encryptedData: sampleEncryptedData,
      metadata: {
        source: 'bank_api',
        timestamp: new Date().toISOString()
      }
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    status: 'error',
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// Start server
app.listen(PORT, () => {
  console.log('\n🚀 Partner Backend Server Started');
  console.log(`📡 Listening on port ${PORT}`);
  console.log(`🌐 API URL: http://localhost:${PORT}`);
  console.log(`🔑 Private key loaded: ${!!decryptionService.privateKey}`);
  console.log('\n📋 Available endpoints:');
  console.log(`   GET  http://localhost:${PORT}/`);
  console.log(`   GET  http://localhost:${PORT}/health`);
  console.log(`   GET  http://localhost:${PORT}/public-key`);
  console.log(`   POST http://localhost:${PORT}/receive-data`);
  console.log(`   POST http://localhost:${PORT}/webhook`);
  console.log(`   POST http://localhost:${PORT}/decrypt`);
  console.log(`   POST http://localhost:${PORT}/request-data`);
  console.log(`   POST http://localhost:${PORT}/generate-keys`);
  console.log(`   GET  http://localhost:${PORT}/test-decrypt`);
  console.log('\n🔧 Make sure to configure your .env file with partner credentials');
});
