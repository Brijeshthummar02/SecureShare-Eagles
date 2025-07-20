import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const dataRequestSchema = new mongoose.Schema({
  requestId: { 
    type: String, 
    default: () => uuidv4(),
    unique: true
  },
  consentId: { 
    type: String, 
    ref: 'Consent',
    required: [true, 'Consent ID is required']
  },
  partnerId: { 
    type: String, 
    ref: 'Partner',
    required: [true, 'Partner ID is required']
  },
  requestedFields: {
    type: [String],
    required: [true, 'At least one field must be requested']
  },
  requestSignature: String,
  responseSignature: String,
  status: { 
    type: String, 
    default: 'pending',
    enum: ['pending', 'approved', 'rejected', 'fulfilled', 'failed']
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  processedAt: Date,
  expiresAt: Date
});

// Create indexes for performance
dataRequestSchema.index({ consentId: 1 });
dataRequestSchema.index({ partnerId: 1 });
dataRequestSchema.index({ status: 1 });
dataRequestSchema.index({ createdAt: 1 });

const DataRequest = mongoose.model('DataRequest', dataRequestSchema);

export default DataRequest;
