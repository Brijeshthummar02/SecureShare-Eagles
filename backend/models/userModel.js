import mongoose, { Schema } from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const userSchema = new Schema({
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    lowercase: true,
    trim: true,
    index: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: 8,
    select: false // Don't include password in query results by default
  },
  role: {
    type: String,
    enum: ['admin', 'customer'],
    default: 'customer'
  },
  partnerId: {
    type: String,
    ref: 'Partner'
    // Only populated for partner users
  },
  customerId: {
    type: String,
    ref: 'Customer'
    // Only populated for customer users
  },
  active: {
    type: Boolean,
    default: true
  },
  lastLogin: Date,
  passwordChangedAt: Date,
  passwordResetToken: String,
  passwordResetExpires: Date,
  refreshToken: {
    type: String,
    select: false // Don't include in query results by default
  }
}, { 
  timestamps: true // Automatically adds createdAt and updatedAt fields
});

// Pre-save hook to hash password before saving
userSchema.pre('save', async function(next) {
  // Only run this function if password was modified
  if (!this.isModified('password')) return next();
  
  // Hash the password with cost of 12
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Encrypt refresh token before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('refreshToken') || !this.refreshToken) return next();
  
  const encrypted = await encryptionService.encryptField(this.refreshToken);
  this.refreshToken = JSON.stringify(encrypted);
  next();
});

// Instance method to check if password is correct
userSchema.methods.isPasswordCorrect = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Method to check if password was changed after a token was issued
userSchema.methods.changedPasswordAfter = function(JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(
      this.passwordChangedAt.getTime() / 1000,
      10
    );
    return JWTTimestamp < changedTimestamp;
  }
  return false;
};

// Generate Access Token
userSchema.methods.generateAccessToken = function() {
  return jwt.sign(
    {
      _id: this._id,
      email: this.email,
      username: this.username,
      role: this.role,
      partnerId: this.partnerId,
      customerId: this.customerId
    },
    process.env.ACCESS_TOKEN_SECRET,
    { 
      expiresIn: process.env.ACCESS_TOKEN_EXPIRY || '15m'
    }
  );
};

// Generate Refresh Token
userSchema.methods.generateRefreshToken = function() {
  return jwt.sign(
    {
      _id: this._id
    },
    process.env.REFRESH_TOKEN_SECRET,
    {
      expiresIn: process.env.REFRESH_TOKEN_EXPIRY || '7d'
    }
  );
};

// Decrypt refresh token
userSchema.methods.getDecryptedRefreshToken = async function() {
  if (!this.refreshToken) return null;
  const encryptedData = JSON.parse(this.refreshToken);
  return await encryptionService.decryptField(encryptedData);
};

const User = mongoose.model('User', userSchema);

export default User;
