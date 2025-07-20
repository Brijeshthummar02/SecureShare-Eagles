import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

class DecryptionService {
  constructor() {
    this.privateKey = this.loadPrivateKey();
  }

  loadPrivateKey() {
    try {
      // Try to load from environment variable first
      if (process.env.PRIVATE_KEY_BASE64) {
        return Buffer.from(process.env.PRIVATE_KEY_BASE64, 'base64').toString('utf8');
      }
      
      // Try to load from file
      if (process.env.PRIVATE_KEY_PATH) {
        const keyPath = path.resolve(process.env.PRIVATE_KEY_PATH);
        if (fs.existsSync(keyPath)) {
          return fs.readFileSync(keyPath, 'utf8');
        }
      }
      
      // Default path
      const defaultPath = path.join(process.cwd(), 'keys', 'private_key.pem');
      if (fs.existsSync(defaultPath)) {
        return fs.readFileSync(defaultPath, 'utf8');
      }
      
      throw new Error('Private key not found. Please set PRIVATE_KEY_BASE64 or PRIVATE_KEY_PATH');
    } catch (error) {
      console.error('Error loading private key:', error.message);
      return null;
    }
  }

  /**
   * Decrypt data using RSA-OAEP + AES-256-GCM hybrid encryption
   * This matches the bank's encryptWithPublicKey method exactly
   * @param {Object} encryptedResponse - Response from bank API
   * @returns {Object} - Decrypted data
   */
  decryptHybridData(encryptedResponse) {
    if (!this.privateKey) {
      throw new Error('Private key not available for decryption');
    }

    try {
      const { encryptedData, encryptedKey, iv, authTag, algorithm } = encryptedResponse;
      
      console.log('🔍 Decryption Details:');
      console.log('- Algorithm:', algorithm);
      console.log('- Encrypted data length:', encryptedData ? encryptedData.length : 'N/A');
      console.log('- Encrypted key length:', encryptedKey ? encryptedKey.length : 'N/A');
      console.log('- IV length:', iv ? iv.length : 'N/A');
      console.log('- Auth tag length:', authTag ? authTag.length : 'N/A');

      if (algorithm === 'RSA-OAEP-SHA256+AES-256-GCM') {
        // Step 1: Decrypt the AES key using RSA private key
        const aesKey = crypto.privateDecrypt(
          {
            key: this.privateKey,
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: 'sha256'
          },
          Buffer.from(encryptedKey, 'base64')
        );

        // Step 2: Decrypt the data using AES-256-GCM
        const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, Buffer.from(iv, 'base64'));
        decipher.setAuthTag(Buffer.from(authTag, 'base64'));

        let decrypted = decipher.update(Buffer.from(encryptedData, 'base64'), null, 'utf8');
        decrypted += decipher.final('utf8');

        return JSON.parse(decrypted);
      } else if (algorithm === 'RSA-OAEP-SHA256') {
        console.log('🔓 Starting direct RSA decryption...');
        
        // Direct RSA decryption (for smaller data)
        const decryptedBuffer = crypto.privateDecrypt(
          {
            key: this.privateKey,
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: 'sha256'
          },
          Buffer.from(encryptedData, 'base64')
        );

        const decryptedText = decryptedBuffer.toString('utf8');
        console.log('✅ Direct RSA decryption successful');
        return JSON.parse(decryptedText);
      } else {
        throw new Error(`Unsupported encryption algorithm: ${algorithm}`);
      }
    } catch (error) {
      console.error('❌ Decryption error:', error);
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack?.split('\n')[0]
      });
      throw new Error(`Failed to decrypt data: ${error.message}`);
    }
  }

  /**
   * @deprecated This method is deprecated as of secure encryption implementation
   * Partners no longer need bank's encryption key with the new secure-temporary-key system
   * Enhanced field decryption to handle bank's double encryption (legacy)
   */
  decryptCustomerFields(customerData, bankEncryptionKey = null) {
    console.log('⚠️  WARNING: Using deprecated field decryption method');
    console.log('💡 Recommendation: Upgrade to secure-temporary-key encryption');
    console.log('🔍 Starting legacy field-level decryption...');
    
    if (!bankEncryptionKey) {
      console.log('❌ No bank encryption key provided - cannot decrypt legacy format');
      console.log('💡 With secure encryption, this is no longer needed!');
      return customerData; // Return as-is if no key
    }
    
    console.log('🔑 Using bank encryption key:', bankEncryptionKey ? 'Present' : 'Missing');
    
    const decryptedData = { ...customerData };
    
    // List of fields that might be encrypted
    const encryptedFields = ['name', 'email', 'phone', 'address', 'account_number', 'aadhaar'];
    
    for (const field of encryptedFields) {
      if (decryptedData[field] && typeof decryptedData[field] === 'string') {
        // Check if the field looks encrypted
        if (this.isEncryptedField(decryptedData[field])) {
          console.log(`🔓 Decrypting field: ${field}`);
          console.log(`📥 Encrypted value: ${decryptedData[field].substring(0, 50)}...`);
          
          const decryptedValue = this.decryptField(decryptedData[field], bankEncryptionKey);
          if (decryptedValue !== decryptedData[field]) {
            decryptedData[field] = decryptedValue;
            console.log(`✅ Successfully decrypted ${field}: ${decryptedValue}`);
          } else {
            console.log(`❌ Failed to decrypt ${field}`);
          }
        } else {
          console.log(`ℹ️  Field ${field} appears to be plain text: ${decryptedData[field]}`);
        }
      }
    }
    
    console.log('🎉 Field decryption completed');
    return decryptedData;
  }

  // Check if a field value looks encrypted
  isEncryptedField(value) {
    if (!value || typeof value !== 'string') return false;
    
    // Check if it looks like JSON (encrypted object with encryptedValue property)
    if (value.startsWith('{') && value.includes('encryptedValue')) {
      return true;
    }
    
    // Check if it looks like a hex string (even length, only hex chars, reasonably long)
    if (value.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(value) && value.length > 20) {
      return true;
    }
    
    return false;
  }

  /**
   * @deprecated Legacy field decryption method
   * This method is no longer needed with secure-temporary-key encryption
   * Decrypt individual field that was encrypted with AES-256-GCM (legacy)
   * @param {Object|string} encryptedField - Encrypted field object from bank
   * @param {string} bankEncryptionKey - Bank's field encryption key (32 bytes) - NO LONGER NEEDED
   * @returns {string} - Decrypted field value
   */
  decryptField(encryptedField, bankEncryptionKey = null) {
    console.log('⚠️  WARNING: Using deprecated field decryption method');
    
    try {
      // Handle string input (JSON stringified encrypted data)
      if (typeof encryptedField === 'string') {
        try {
          encryptedField = JSON.parse(encryptedField);
        } catch {
          // If it's not JSON, return as is (might be plain text)
          return encryptedField;
        }
      }

      // Check if this is an encrypted field object
      if (!encryptedField.encryptedValue || !encryptedField.iv || !encryptedField.authTag) {
        return encryptedField; // Return as is if not encrypted
      }

      // For individual field decryption, we need the bank's encryption key
      if (!bankEncryptionKey) {
        console.log('⚠️  Bank encryption key not provided for field decryption');
        return `[ENCRYPTED FIELD - ${encryptedField.encryptedValue.substring(0, 20)}...]`;
      }

      console.log('🔓 Decrypting individual field...');
      
      console.log(`🔑 Raw bank key from param: "${bankEncryptionKey}"`);
      console.log(`🔑 Raw bank key from env: "${process.env.BANK_ENCRYPTION_KEY}"`);
      console.log(`🔑 Final key to use: "${bankEncryptionKey || process.env.BANK_ENCRYPTION_KEY}"`);
      
      // Convert key using UTF-8 encoding (matching bank's method)
      // Bank uses: Buffer.from(process.env.ENCRYPTION_KEY, 'utf8')
      const keyString = bankEncryptionKey || process.env.BANK_ENCRYPTION_KEY;
      const key = Buffer.from(keyString, 'utf8');
      console.log(`🔑 Key string: "${keyString}" (${keyString?.length || 0} chars)`);
      console.log(`🔑 Key buffer: ${key.length} bytes`);
      
      if (key.length !== 32) {
        throw new Error(`Bank encryption key must be 32 bytes (256 bits), got ${key.length} bytes`);
      }

      // Decrypt using AES-256-GCM (matches bank's encryptField method)
      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        key,
        Buffer.from(encryptedField.iv, 'hex')
      );
      
      decipher.setAuthTag(Buffer.from(encryptedField.authTag, 'hex'));
      
      let decrypted = decipher.update(encryptedField.encryptedValue, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      console.log('✅ Field decrypted successfully');
      return decrypted;
    } catch (error) {
      console.error('❌ Field decryption error:', error);
      return `[DECRYPTION ERROR: ${error.message}]`;
    }
  }

  /**
   * Decrypt all encrypted fields in customer data
   * @param {Object} customerData - Customer data with encrypted fields
   * @param {string} bankEncryptionKey - Bank's field encryption key
   * @returns {Object} - Customer data with decrypted fields
   */
  decryptCustomerData(customerData, bankEncryptionKey = null) {
    if (!customerData || !bankEncryptionKey) {
      return customerData;
    }

    const decryptedData = { ...customerData };
    
    // Common encrypted field patterns in customer data
    const encryptedFields = ['encryptedName', 'encryptedEmail', 'encryptedPhone', 'encryptedPan', 'encryptedAddress'];
    
    encryptedFields.forEach(fieldName => {
      if (decryptedData[fieldName]) {
        try {
          const decryptedValue = this.decryptField(decryptedData[fieldName], bankEncryptionKey);
          // Remove 'encrypted' prefix for clean field names
          const cleanFieldName = fieldName.replace('encrypted', '').toLowerCase();
          decryptedData[cleanFieldName] = decryptedValue;
          console.log(`✅ Decrypted ${fieldName} -> ${cleanFieldName}`);
        } catch (error) {
          console.error(`❌ Failed to decrypt ${fieldName}:`, error.message);
        }
      }
    });

    return decryptedData;
  }

  /**
   * Verify signature from bank
   * @param {string} data - Original data
   * @param {string} signature - Base64 encoded signature
   * @param {string} bankPublicKey - Bank's public key
   * @returns {boolean} - Verification result
   */
  verifySignature(data, signature, bankPublicKey) {
    try {
      const verify = crypto.createVerify('SHA256');
      verify.update(data);
      return verify.verify(bankPublicKey, signature, 'base64');
    } catch (error) {
      console.error('Signature verification error:', error);
      return false;
    }
  }

  /**
   * Generate RSA key pair for partner registration
   * @param {number} keySize - Key size in bits (default: 2048)
   * @returns {Object} - Generated key pair
   */
  generateKeyPair(keySize = 2048) {
    try {
      console.log(`🔑 Generating ${keySize}-bit RSA key pair...`);
      
      const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: keySize,
        publicKeyEncoding: {
          type: 'spki',
          format: 'pem'
        },
        privateKeyEncoding: {
          type: 'pkcs8',
          format: 'pem'
        }
      });

      console.log('✅ Key pair generated successfully');
      console.log('📋 Public key preview:', publicKey.substring(0, 100) + '...');
      
      return { publicKey, privateKey };
    } catch (error) {
      console.error('❌ Key generation error:', error);
      throw new Error(`Failed to generate key pair: ${error.message}`);
    }
  }

  /**
   * Decrypt data using the new secure encryption method with temporary keys
   * This handles the SECURE-TEMPORARY-KEY encryption type from the bank
   * @param {Object} encryptedResponse - Response with secure encryption
   * @returns {Object} - Decrypted customer data
   */
  decryptSecureData(encryptedResponse) {
    if (!this.privateKey) {
      throw new Error('Private key not available for decryption');
    }

    try {
      // First, decrypt the RSA-encrypted payload to get the temporary key and encrypted fields
      const decryptedPayload = this.decryptHybridData(encryptedResponse);
      
      const { encryptedFields, tempKey, algorithm } = decryptedPayload;
      
      if (algorithm !== 'AES-256-GCM-TEMP-KEY') {
        throw new Error(`Unsupported secure algorithm: ${algorithm}`);
      }
      
      // Convert the base64 temporary key back to buffer
      const tempAesKey = Buffer.from(tempKey, 'base64');
      
      // Decrypt each customer field using the temporary key
      const decryptedCustomerData = {};
      
      for (const [fieldName, encryptedField] of Object.entries(encryptedFields)) {
        try {
          const decipher = crypto.createDecipheriv(
            'aes-256-gcm',
            tempAesKey,
            Buffer.from(encryptedField.iv, 'hex')
          );
          
          decipher.setAuthTag(Buffer.from(encryptedField.authTag, 'hex'));
          
          let decrypted = decipher.update(encryptedField.encryptedValue, 'hex', 'utf8');
          decrypted += decipher.final('utf8');
          
          decryptedCustomerData[fieldName] = decrypted;
          
        } catch (fieldError) {
          console.error(`❌ Failed to decrypt field ${fieldName}:`, fieldError.message);
          decryptedCustomerData[fieldName] = `[DECRYPTION_FAILED: ${fieldError.message}]`;
        }
      }
      
      return decryptedCustomerData;
      
    } catch (error) {
      console.error('❌ Secure decryption error:', error);
      throw new Error(`Failed to decrypt secure data: ${error.message}`);
    }
  }

  /**
   * Get public key from private key
   * @returns {string} - Public key in PEM format
   */
  getPublicKey() {
    if (!this.privateKey) {
      throw new Error('Private key not loaded');
    }

    try {
      const publicKey = crypto.createPublicKey(this.privateKey).export({
        type: 'spki',
        format: 'pem'
      });
      
      return publicKey;
    } catch (error) {
      console.error('❌ Public key extraction error:', error);
      throw new Error(`Failed to extract public key: ${error.message}`);
    }
  }
}

export default new DecryptionService();
