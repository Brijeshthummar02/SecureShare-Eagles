import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const auditLogSchema = new mongoose.Schema({
  logId: { 
    type: String, 
    default: () => uuidv4(),
    unique: true
  },
  eventType: {
    type: String,
    required: [true, 'Event type is required']
  },
  actorType: {
    type: String,
    required: [true, 'Actor type is required'],
    enum: ['customer', 'partner', 'admin', 'system']
  },
  actorId: {
    type: String,
    required: [true, 'Actor ID is required']
  },
  consentId: String,
  customerId: String,
  partnerId: String,
  actionDetails: mongoose.Schema.Types.Mixed,
  metadata: mongoose.Schema.Types.Mixed,
  eventHash: String,
  previousHash: String,
  digitalSignature: String,
  createdAt: { 
    type: Date, 
    default: Date.now,
    immutable: true // once set, can't be modified
  }
}, {
  // Disallow modification of audit logs
  timestamps: false
});

// Create indexes for performance
auditLogSchema.index({ eventType: 1 });
auditLogSchema.index({ actorId: 1 });
auditLogSchema.index({ consentId: 1 });
auditLogSchema.index({ customerId: 1 });
auditLogSchema.index({ partnerId: 1 });
auditLogSchema.index({ createdAt: 1 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

export default AuditLog;
