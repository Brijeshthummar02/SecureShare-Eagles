#!/usr/bin/env node

/**
 * RSA Key Pair Generator for Partner Backend
 * This script generates the RSA key pair needed for secure communication with the bank.
 */

import fs from 'fs';
import path from 'path';
import decryptionService from './decryptionService.js';

console.log('🔐 Partner Backend - RSA Key Generator');
console.log('=====================================\n');

const keysDir = path.join(process.cwd(), 'keys');

// Ensure keys directory exists
if (!fs.existsSync(keysDir)) {
  fs.mkdirSync(keysDir, { recursive: true });
  console.log('📁 Created keys directory');
}

try {
  // Generate key pair
  const { publicKey, privateKey } = decryptionService.generateKeyPair(2048);
  
  // Write keys to files
  const privateKeyPath = path.join(keysDir, 'private_key.pem');
  const publicKeyPath = path.join(keysDir, 'public_key.pem');
  
  fs.writeFileSync(privateKeyPath, privateKey);
  fs.writeFileSync(publicKeyPath, publicKey);
  
  console.log('\n✅ Key pair generated successfully!');
  console.log(`📁 Private key saved to: ${privateKeyPath}`);
  console.log(`📁 Public key saved to: ${publicKeyPath}`);
  
  console.log('\n🔒 SECURITY REMINDERS:');
  console.log('• NEVER share your private key with anyone');
  console.log('• NEVER commit private keys to git');
  console.log('• Share ONLY the public key with the bank for registration');
  console.log('• Store private keys securely in production');
  
  console.log('\n📋 NEXT STEPS:');
  console.log('1. Copy the public key content from public_key.pem');
  console.log('2. Register with the bank using this public key');
  console.log('3. Configure your .env file with partner credentials');
  console.log('4. Start the partner backend server');
  
  console.log('\n🔑 PUBLIC KEY (share this with the bank):');
  console.log('=' .repeat(60));
  console.log(publicKey);
  console.log('=' .repeat(60));
  
} catch (error) {
  console.error('❌ Error generating keys:', error.message);
  process.exit(1);
}
