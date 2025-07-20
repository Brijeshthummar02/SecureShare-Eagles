import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const customerSchema = new mongoose.Schema({
  _id: { 
    type: String, 
    default: () => uuidv4() 
  },
  encryptedPhone: String,
  encryptedEmail: String,
  encryptedPan: String,
  encryptedAddress: String,
  encryptedName: String,
  phoneHash: String,
  emailHash: String,
  panHash: String,
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  },
  isActive: { 
    type: Boolean, 
    default: true 
  }
});

// Update the updatedAt timestamp before saving
customerSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

const Customer = mongoose.model('Customer', customerSchema);

export default Customer;
