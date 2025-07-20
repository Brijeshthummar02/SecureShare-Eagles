import Customer from '../models/customerModel.js';
import encryptionService from '../utils/encryptionService.js';
import auditService from '../utils/auditService.js';
import User from '../models/userModel.js';

// Helper function to decrypt customer data
const decryptCustomerData = async (customer) => {
  if (!customer) return null;
  
  const decryptedCustomer = {
    _id: customer._id,
    createdAt: customer.createdAt,
    updatedAt: customer.updatedAt,
    isActive: customer.isActive
  };

  // Decrypt phone if it exists
  if (customer.encryptedPhone) {
    try {
      const encryptedPhoneData = JSON.parse(customer.encryptedPhone);
      decryptedCustomer.phone = await encryptionService.decryptField(encryptedPhoneData);
    } catch (error) {
      console.error('Error decrypting phone:', error);
    }
  }

  // Decrypt email if it exists
  if (customer.encryptedEmail) {
    try {
      const encryptedEmailData = JSON.parse(customer.encryptedEmail);
      decryptedCustomer.email = await encryptionService.decryptField(encryptedEmailData);
    } catch (error) {
      console.error('Error decrypting email:', error);
    }
  }

  // Decrypt PAN if it exists
  if (customer.encryptedPan) {
    try {
      const encryptedPanData = JSON.parse(customer.encryptedPan);
      decryptedCustomer.pan = await encryptionService.decryptField(encryptedPanData);
    } catch (error) {
      console.error('Error decrypting PAN:', error);
    }
  }

  // Decrypt address if it exists
  if (customer.encryptedAddress) {
    try {
      const encryptedAddressData = JSON.parse(customer.encryptedAddress);
      decryptedCustomer.address = await encryptionService.decryptField(encryptedAddressData);
    } catch (error) {
      console.error('Error decrypting address:', error);
    }
  }

  // Decrypt name if it exists
  if (customer.encryptedName) {
    try {
      const encryptedNameData = JSON.parse(customer.encryptedName);
      decryptedCustomer.name = await encryptionService.decryptField(encryptedNameData);
    } catch (error) {
      console.error('Error decrypting name:', error);
    }
  }

  return decryptedCustomer;
};

// @desc    Get all customers
// @route   GET /api/v1/customers
// @access  Admin
export const getAllCustomers = async (req, res, next) => {
  try {
    const customers = await Customer.find();

    res.status(200).json({
      status: 'success',
      results: customers.length,
      data: {
        customers: await Promise.all(customers.map(decryptCustomerData))
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get customer by ID
// @route   GET /api/v1/customers/:customerId
// @access  Admin
export const getCustomer = async (req, res, next) => {
  try {
    const customer = await Customer.findById(req.params.customerId);

    if (!customer) {
      return res.status(404).json({
        status: 'error',
        message: 'No customer found with that ID'
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        customer: await decryptCustomerData(customer)
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create new customer
// @route   POST /api/v1/customers
// @access  Admin
export const createCustomer = async (req, res, next) => {
  try {
    const { phone, email, pan, address, name } = req.body;

    // Encrypt sensitive data
    const encryptedPhone = phone ? await encryptionService.encryptField(phone) : null;
    const encryptedEmail = email ? await encryptionService.encryptField(email) : null;
    const encryptedPan = pan ? await encryptionService.encryptField(pan) : null;
    const encryptedAddress = address ? await encryptionService.encryptField(address) : null;
    const encryptedName = name ? await encryptionService.encryptField(name) : null;

    const newCustomer = await Customer.create({
      encryptedPhone: encryptedPhone ? JSON.stringify(encryptedPhone) : null,
      encryptedEmail: encryptedEmail ? JSON.stringify(encryptedEmail) : null,
      encryptedPan: encryptedPan ? JSON.stringify(encryptedPan) : null,
      encryptedAddress: encryptedAddress ? JSON.stringify(encryptedAddress) : null,
      encryptedName: encryptedName ? JSON.stringify(encryptedName) : null,
      phoneHash: phone ? encryptionService.createHash(phone) : null,
      emailHash: email ? encryptionService.createHash(email) : null,
      panHash: pan ? encryptionService.createHash(pan) : null,
    });

    // Log customer creation
    await auditService.logEvent({
      eventType: 'customer_created',
      actorType: 'admin',
      actorId: req.user._id,
      customerId: newCustomer._id,
      actionDetails: { customerId: newCustomer._id },
      metadata: { ip: req.ip }
    });

    res.status(201).json({
      status: 'success',
      data: {
        customer: await decryptCustomerData(newCustomer)
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update customer
// @route   PUT /api/v1/customers/:customerId
// @access  Admin
export const updateCustomer = async (req, res, next) => {
  try {
    const { phone, email, pan, address, name, isActive } = req.body;
    const updateData = {};

    // Only encrypt and update the fields that were provided
    if (phone !== undefined) {
      const encryptedPhone = await encryptionService.encryptField(phone);
      updateData.encryptedPhone = JSON.stringify(encryptedPhone);
      updateData.phoneHash = encryptionService.createHash(phone);
    }

    if (email !== undefined) {
      const encryptedEmail = await encryptionService.encryptField(email);
      updateData.encryptedEmail = JSON.stringify(encryptedEmail);
      updateData.emailHash = encryptionService.createHash(email);
    }

    if (pan !== undefined) {
      const encryptedPan = await encryptionService.encryptField(pan);
      updateData.encryptedPan = JSON.stringify(encryptedPan);
      updateData.panHash = encryptionService.createHash(pan);
    }

    if (address !== undefined) {
      const encryptedAddress = await encryptionService.encryptField(address);
      updateData.encryptedAddress = JSON.stringify(encryptedAddress);
    }

    if (name !== undefined) {
      const encryptedName = await encryptionService.encryptField(name);
      updateData.encryptedName = JSON.stringify(encryptedName);
    }

    if (isActive !== undefined) {
      updateData.isActive = isActive;
    }

    // Set the updated timestamp
    updateData.updatedAt = Date.now();

    const customer = await Customer.findByIdAndUpdate(
      req.params.customerId,
      updateData,
      {
        new: true,
        runValidators: true
      }
    );

    if (!customer) {
      return res.status(404).json({
        status: 'error',
        message: 'No customer found with that ID'
      });
    }

    // Log customer update
    await auditService.logEvent({
      eventType: 'customer_updated',
      actorType: 'admin',
      actorId: req.user._id,
      customerId: customer._id,
      actionDetails: { 
        customerId: customer._id,
        updatedFields: Object.keys(req.body)
      },
      metadata: { ip: req.ip }
    });

    res.status(200).json({
      status: 'success',
      data: {
        customer: await decryptCustomerData(customer)
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete customer
// @route   DELETE /api/v1/customers/:customerId
// @access  Admin
export const deleteCustomer = async (req, res, next) => {
  try {
    const customer = await Customer.findByIdAndDelete(req.params.customerId);

    if (!customer) {
      return res.status(404).json({
        status: 'error',
        message: 'No customer found with that ID'
      });
    }

    // Log customer deletion
    await auditService.logEvent({
      eventType: 'customer_deleted',
      actorType: 'admin',
      actorId: req.user._id,
      customerId: req.params.customerId,
      actionDetails: { customerId: req.params.customerId },
      metadata: { ip: req.ip }
    });

    res.status(204).json({
      status: 'success',
      data: null
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create or update customer's own profile
// @route   POST /api/v1/customers/my-profile
// @access  Customer
export const createMyProfile = async (req, res, next) => {
  try {
    const { phone, email, pan, address, name } = req.body;
    const userId = req.user._id;

    // Check if the customer already exists for this user
    const user = await User.findById(userId);
    let customer;
    let existingCustomerId = user.customerId;

    // Encrypt sensitive data
    const encryptedPhone = phone ? await encryptionService.encryptField(phone) : null;
    const encryptedEmail = email ? await encryptionService.encryptField(email) : null;
    const encryptedPan = pan ? await encryptionService.encryptField(pan) : null;
    const encryptedAddress = address ? await encryptionService.encryptField(address) : null;
    const encryptedName = name ? await encryptionService.encryptField(name) : null;

    if (existingCustomerId) {
      // Update existing customer
      const updateData = {};

      if (phone !== undefined) {
        updateData.encryptedPhone = JSON.stringify(encryptedPhone);
        updateData.phoneHash = encryptionService.createHash(phone);
      }

      if (email !== undefined) {
        updateData.encryptedEmail = JSON.stringify(encryptedEmail);
        updateData.emailHash = encryptionService.createHash(email);
      }

      if (pan !== undefined) {
        updateData.encryptedPan = JSON.stringify(encryptedPan);
        updateData.panHash = encryptionService.createHash(pan);
      }

      if (address !== undefined) {
        updateData.encryptedAddress = JSON.stringify(encryptedAddress);
      }

      if (name !== undefined) {
        updateData.encryptedName = JSON.stringify(encryptedName);
      }

      // Set the updated timestamp
      updateData.updatedAt = Date.now();

      customer = await Customer.findByIdAndUpdate(
        existingCustomerId,
        updateData,
        {
          new: true,
          runValidators: true
        }
      );

      // Log customer update
      await auditService.logEvent({
        eventType: 'customer_profile_updated',
        actorType: 'customer',
        actorId: userId,
        customerId: customer._id,
        actionDetails: { 
          customerId: customer._id,
          updatedFields: Object.keys(req.body)
        },
        metadata: { ip: req.ip }
      });
    } else {
      // Create new customer
      customer = await Customer.create({
        encryptedPhone: encryptedPhone ? JSON.stringify(encryptedPhone) : null,
        encryptedEmail: encryptedEmail ? JSON.stringify(encryptedEmail) : null,
        encryptedPan: encryptedPan ? JSON.stringify(encryptedPan) : null,
        encryptedAddress: encryptedAddress ? JSON.stringify(encryptedAddress) : null,
        encryptedName: encryptedName ? JSON.stringify(encryptedName) : null,
        phoneHash: phone ? encryptionService.createHash(phone) : null,
        emailHash: email ? encryptionService.createHash(email) : null,
        panHash: pan ? encryptionService.createHash(pan) : null,
      });

      // Update the user with the customer ID
      await User.findByIdAndUpdate(userId, { customerId: customer._id });

      // Log customer creation
      await auditService.logEvent({
        eventType: 'customer_profile_created',
        actorType: 'customer',
        actorId: userId,
        customerId: customer._id,
        actionDetails: { customerId: customer._id },
        metadata: { ip: req.ip }
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        customer: await decryptCustomerData(customer)
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get customer's own profile
// @route   GET /api/v1/customers/my-profile
// @access  Customer
export const getMyProfile = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId);
    
    if (!user.customerId) {
      return res.status(404).json({
        status: 'error',
        message: 'You have not created a customer profile yet'
      });
    }

    const customer = await Customer.findById(user.customerId);

    if (!customer) {
      return res.status(404).json({
        status: 'error',
        message: 'Customer profile not found'
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        customer: await decryptCustomerData(customer)
      }
    });
  } catch (error) {
    next(error);
  }
};
