import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

class SignatureService {
  constructor() {
    // In production, these would be loaded from secure storage
    try {
      // Try to load keys if available
      this.privateKey = null;
      this.publicKey = null;
      
      // This is a placeholder - in production these keys would be properly managed
      // Create keys for development if they don't exist yet
      this.generateKeysIfNeeded();
    } catch (error) {
      console.error('Error initializing signature service:', error);
    }
  }

  generateKeysIfNeeded() {
    // This is just for development
    // In production, keys would be managed securely (e.g., via AWS KMS, HashiCorp Vault)
    // and loaded from there
    console.log('Using dynamically generated keys for development - NOT FOR PRODUCTION');
    
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem'
      }
    });
    
    this.privateKey = privateKey;
    this.publicKey = publicKey;
  }

  signData(data) {
    if (!this.privateKey) {
      throw new Error('Private key not available');
    }
    
    const dataString = typeof data === 'string' ? data : JSON.stringify(data);
    const hash = crypto.createHash('sha256').update(dataString).digest();
    const signature = crypto.sign('rsa-sha256', hash, this.privateKey);
    
    return signature.toString('base64');
  }

  verifySignature(data, signature, publicKey) {
    const dataString = typeof data === 'string' ? data : JSON.stringify(data);
    const hash = crypto.createHash('sha256').update(dataString).digest();
    
    return crypto.verify(
      'rsa-sha256',
      hash,
      publicKey || this.publicKey,
      Buffer.from(signature, 'base64')
    );
  }

  getPublicKey() {
    return this.publicKey;
  }
}

export default new SignatureService();
