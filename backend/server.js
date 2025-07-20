import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/authRoutes.js';
import customerRoutes from './routes/customerRoutes.js';
import consentRoutes from './routes/consentRoutes.js';
import partnerRoutes from './routes/partnerRoutes.js';
import auditRoutes from './routes/auditRoutes.js';
import { errorHandler } from './middleware/errorMiddleware.js';

// Load environment variables
dotenv.config();

// Initialize express app
const app = express();

// Set API base URL for notifications if not provided in environment
if (!process.env.API_BASE_URL) {
  process.env.API_BASE_URL = 'https://localhost:5000/v1';
}

// Set minimum consent duration if not provided (default: 1 hour in milliseconds)
if (!process.env.MIN_CONSENT_DURATION_MS) {
  process.env.MIN_CONSENT_DURATION_MS = 60 * 60 * 1000; // 1 hour
}

// Middleware
app.use(helmet()); // Set security headers
app.use(express.json()); // Parse JSON bodies
app.use(cors()); // Enable CORS
app.use(morgan('dev')); // Request logging

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});
app.use('/api', limiter);

// Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/customers', customerRoutes);
app.use('/api/v1/consents', consentRoutes);
app.use('/api/v1/partners', partnerRoutes);
app.use('/api/v1/audit', auditRoutes);

// Root route
app.get('/', (req, res) => {
  res.send('Fintech Bank API is running');
});

// Error handler middleware
app.use(errorHandler);

// Connect to MongoDB and start server
const PORT = process.env.PORT || 5000; // Using port 5000 as specified

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('Connected to MongoDB');
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`API Base URL for partners: ${process.env.API_BASE_URL}`);
    });
  })
  .catch((error) => {
    console.error('Failed to connect to MongoDB:', error.message);
    process.exit(1);
  });

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.log('UNHANDLED REJECTION! 💥 Shutting down...');
  console.log(err.name, err.message);
  process.exit(1);
});
