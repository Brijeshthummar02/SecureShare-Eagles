import mongoose from 'mongoose';

const partnerSchema = new mongoose.Schema({
  partnerId: { 
    type: String, 
    unique: true,
    required: [true, 'Partner ID is required']
  },
  partnerName: {
    type: String,
    required: [true, 'Partner name is required']
  },
  publicKey: String,
  apiTokenHash: String,
  callbackUrl: String,
  trustScore: { 
    type: Number, 
    default: 0 
  },
  status: { 
    type: String, 
    default: 'active',
    enum: ['active', 'pending', 'suspended', 'inactive']
  },
  // New fields for contract management
  requestedContract: {
    allowedDataFields: [String],
    purpose: String,
    retentionPeriod: Number, // in days
    legalBasis: String,
    contractText: String,
    requestedAt: { 
      type: Date, 
      default: Date.now 
    }
  },
  // Store the full approved contract data
  approvedContract: {
    type: Boolean,
    default: false
  },
  contractData: {
    allowedDataFields: [String],
    purpose: String,
    retentionPeriod: Number, // in days
    legalBasis: String,
    contractText: String,
    contractId: String, // Unique identifier for the contract
    version: { type: Number, default: 1 }
  },
  contractApprovedAt: Date,
  contractApprovedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  }
});

// Update the updatedAt timestamp before saving
partnerSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

const Partner = mongoose.model('Partner', partnerSchema);

export default Partner;