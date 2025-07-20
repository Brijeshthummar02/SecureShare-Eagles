import mongoose from 'mongoose';
import crypto from 'crypto';
import dotenv from 'dotenv';
import Partner from '../models/partnerModel.js';
import User from '../models/userModel.js';

// Load environment variables
dotenv.config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected for token regeneration'))
  .catch(err => console.error('MongoDB connection error:', err));

async function regeneratePartnerToken(partnerId) {
  try {
    console.log(`Regenerating token for partner: ${partnerId}`);
    
    // Find the partner
    const partner = await Partner.findOne({ partnerId });
    if (!partner) {
      console.error(`Partner not found: ${partnerId}`);
      return { success: false, message: 'Partner not found' };
    }
    
    // Generate a new API token
    const apiToken = crypto.randomBytes(32).toString('hex');
    const apiTokenHash = crypto.createHash('sha256').update(apiToken).digest('hex');
    
    // Update the partner's API token hash
    partner.apiTokenHash = apiTokenHash;
    await partner.save();
    
    // Find the associated user and update password
    const user = await User.findOne({ partnerId });
    if (user) {
      // The userModel's pre-save hook will hash this password
      user.password = apiToken;
      await user.save();
      console.log(`Updated user: ${user.email}`);
    } else {
      console.warn(`No user found for partner: ${partnerId}`);
    }
    
    console.log('Token regenerated successfully');
    
    return {
      success: true,
      partner: partner.partnerName,
      partnerId: partner.partnerId,
      apiToken,  // Important: This will be shown only once
      message: 'Store this token securely. It will not be shown again.'
    };
  } catch (error) {
    console.error('Error regenerating token:', error);
    return { success: false, message: error.message };
  } finally {
    // Close the MongoDB connection
    mongoose.connection.close();
  }
}

// Execute for the specific partner
const partnerId = 'partner-80b7d20a';  // Change this as needed

regeneratePartnerToken(partnerId)
  .then(result => {
    console.log('\nRESULT:');
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  })
  .catch(error => {
    console.error('Script error:', error);
    process.exit(1);
  });
