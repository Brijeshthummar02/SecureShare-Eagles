import jwt from 'jsonwebtoken';
import User from '../models/userModel.js';
import auditService from '../utils/auditService.js';

// Helper to create JWT token
const sendTokenResponse = async (user, statusCode, res) => {
  const accessToken = user.generateAccessToken();
  const refreshToken = user.generateRefreshToken();

  // Store refresh token (will be encrypted by pre-save hook)
  user.refreshToken = refreshToken;
  await user.save({ validateBeforeSave: false });

  // Remove sensitive fields
  user.password = undefined;
  user.refreshToken = undefined;

  res.status(statusCode).json({
    status: 'success',
    accessToken,
    refreshToken,
    data: { user }
  });
};

// @desc    Login user
// @route   POST /api/v1/auth/login
// @access  Public
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Check if email and password exist
    if (!email || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide email and password'
      });
    }

    // Check if user exists && password is correct
    const user = await User.findOne({ email }).select('+password');

    if (!user || !(await user.isPasswordCorrect(password))) {
      return res.status(401).json({
        status: 'error',
        message: 'Incorrect email or password'
      });
    }

    // If everything is ok, send tokens to client
    user.lastLogin = Date.now();
    await user.save({ validateBeforeSave: false });

    // Try to log the login event but continue even if it fails
    try {
      await auditService.logEvent({
        eventType: 'user_login',
        actorType: user.role,
        actorId: user._id,
        actionDetails: { email: user.email },
        metadata: { ip: req.ip }
      });
    } catch (auditError) {
      console.warn('Audit logging failed but continuing with login:', auditError.message);
    }

    await sendTokenResponse(user, 200, res);
  } catch (error) {
    next(error);
  }
};

// @desc    Signup user
// @route   POST /api/v1/auth/signup
// @access  Public
export const signup = async (req, res, next) => {
  try {
    // For security, only create regular users from public signup
    // Admin creation would be a separate process
    const newUser = await User.create({
      username: req.body.username,
      email: req.body.email,
      password: req.body.password,
      role: 'customer' // Default role
    });

    // Try to log the signup event but continue even if it fails
    try {
      await auditService.logEvent({
        eventType: 'user_signup',
        actorType: 'customer',
        actorId: newUser._id,
        actionDetails: { email: newUser.email },
        metadata: { ip: req.ip }
      });
    } catch (auditError) {
      console.warn('Audit logging failed but continuing with signup:', auditError.message);
    }

    await sendTokenResponse(newUser, 201, res);
  } catch (error) {
    next(error);
  }
};

// @desc    Logout user
// @route   POST /api/v1/auth/logout
// @access  Public
export const logout = async (req, res, next) => {
  try {
    // Clear the refresh token
    req.user.refreshToken = undefined;
    await req.user.save({ validateBeforeSave: false });

    res.status(200).json({ status: 'success' });
  } catch (error) {
    next(error);
  }
};

// @desc    Refresh token
// @route   POST /api/v1/auth/refresh-token
// @access  Public
export const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide a refresh token'
      });
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);

    // Find user
    const user = await User.findById(decoded._id).select('+refreshToken');

    if (!user) {
      return res.status(401).json({
        status: 'error',
        message: 'The user belonging to this token no longer exists'
      });
    }

    // Check if stored refresh token matches (decrypt stored one)
    const storedRefreshToken = await user.getDecryptedRefreshToken();
    if (storedRefreshToken !== refreshToken) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid refresh token'
      });
    }

    // Check if user changed password after the token was issued
    if (user.changedPasswordAfter(decoded.iat)) {
      return res.status(401).json({
        status: 'error',
        message: 'User recently changed password. Please log in again'
      });
    }

    // Generate new tokens
    await sendTokenResponse(user, 200, res);
  } catch (error) {
    next(error);
  }
};

// @desc    Verify token
// @route   POST /api/v1/auth/verify-token
// @access  Public
export const verifyToken = async (req, res, next) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide a token'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check if user still exists
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({
        status: 'error',
        message: 'The user belonging to this token no longer exists'
      });
    }

    // If everything is ok, send response
    res.status(200).json({
      status: 'success',
      data: {
        user: {
          id: user._id,
          email: user.email,
          role: user.role
        }
      }
    });
  } catch (error) {
    next(error);
  }
};
