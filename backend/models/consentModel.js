import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const consentSchema = new mongoose.Schema({
  consentId: { 
    type: String, 
    default: () => uuidv4(),
    unique: true
  },
  customerId: { 
    type: String, 
    ref: 'Customer',
    required: [true, 'Customer ID is required']
  },
  partnerId: { 
    type: String, 
    ref: 'Partner',
    required: [true, 'Partner ID is required'] 
  },
  consentVersion: { 
    type: String, 
    default: 'v1.0' 
  },
  allowedDataFields: {
    type: [String],
    required: [true, 'At least one data field must be specified']
  },
  purpose: {
    type: String,
    required: [true, 'Purpose is required']
  },
  retentionPeriod: {
    type: Number, // in days
    required: [true, 'Retention period is required']
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  },
  expiresAt: {
    type: Date,
    required: [true, 'Expiry date is required']
  },
  consentDuration: {
    type: Number, // in milliseconds
    required: [true, 'Consent duration is required'],
    validate: {
      validator: function(value) {
        return value >= parseInt(process.env.MIN_CONSENT_DURATION_MS);
      },
      message: props => `Consent duration must be at least ${parseInt(process.env.MIN_CONSENT_DURATION_MS) / (60 * 60 * 1000)} hour(s)`
    }
  },
  status: { 
    type: String, 
    default: 'active',
    enum: ['active', 'revoked', 'expired', 'pending']
  },
  consentMethod: String,
  ipAddressHash: String,
  deviceFingerprint: String,
  legalBasis: String,
  withdrawalMethod: String,
  contractText: {
    type: String,
    required: [true, 'Contract text is required']
  },
  contractId: {
    type: String,
    required: [true, 'Contract ID is required']
  }
});

// Update the updatedAt timestamp before saving
consentSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Create indexes for performance
consentSchema.index({ customerId: 1 });
consentSchema.index({ partnerId: 1 });
consentSchema.index({ status: 1 });
consentSchema.index({ expiresAt: 1 });

const Consent = mongoose.model('Consent', consentSchema);

export default Consent;
