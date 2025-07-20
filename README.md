# SecureShare - Secure Data Sharing Platform for Fintech

SecureShare is a comprehensive secure data sharing platform designed for fintech organizations that need to share sensitive customer data with trusted partners while maintaining strict security, consent management, and regulatory compliance.

## 🔑 Key Features

- **End-to-end Encryption**: Field-level AES-256-GCM encryption and hybrid RSA+AES for secure data sharing
- **Comprehensive Consent Management**: Fine-grained, time-bound customer consent for data sharing
- **Immutable Audit Trail**: Blockchain-inspired immutable audit logs with hash chaining
- **Role-based Access Control**: Admin, customer, and partner-specific permissions
- **Partner Integration**: Secure webhook notifications and encrypted data transfer
- **Regulatory Compliance**: Designed with privacy regulations in mind (GDPR, CCPA, etc.)

## 📋 System Architecture

SecureShare consists of two main components:

### Main Backend (Bank API)

Core service that handles:
- User authentication and authorization
- Customer data management with field-level encryption
- Consent creation, management, and validation
- Partner registration and contract approval
- Secure data sharing with encryption
- Immutable audit logging

### Partner Backend

Reference implementation for partners to:
- Receive encrypted customer data
- Decrypt data using partner's private key
- Process bank notifications via webhooks
- Generate RSA key pairs for secure communication
- Request data from the bank API

## 🚀 Getting Started

### Prerequisites

- Node.js 16+ and npm
- MongoDB 4.4+
- OpenSSL (for key generation)

### Installation

1. **Clone the repository**

```bash
git clone https://github.com/your-org/secureshare-backend.git
cd secureshare-backend
```

2. **Install dependencies for both backends**

```bash
# Install main backend dependencies
cd backend
npm install

# Install partner backend dependencies
cd ../partner-backend
npm install
```

3. **Generate encryption keys for partner backend**

```bash
cd partner-backend
node generate-keys.js
```

4. **Set up environment variables**

Create `.env` files in both the `backend` and `partner-backend` directories based on the provided `.env.example` files.

### Backend Environment Variables

```
# Server Configuration
PORT=5000
NODE_ENV=development
API_BASE_URL=http://localhost:5000/api/v1

# MongoDB Connection
MONGODB_URI=mongodb://localhost:27017/secureshare

# Security Keys
JWT_SECRET=your-jwt-secret-key
JWT_REFRESH_SECRET=your-jwt-refresh-secret-key
ENCRYPTION_KEY=your-32-byte-encryption-key
SIGNATURE_PRIVATE_KEY_PATH=path/to/private-key.pem
SIGNATURE_PUBLIC_KEY_PATH=path/to/public-key.pem

# Consent Settings
MIN_CONSENT_DURATION_MS=3600000
```

### Partner Backend Environment Variables

```
# Server Configuration
PORT=3001
NODE_ENV=development

# Bank Integration
BANK_API_URL=http://localhost:5000/api/v1
PARTNER_ID=your-partner-id
API_TOKEN=your-api-token

# Encryption Keys (Optional - can use files instead)
PRIVATE_KEY_BASE64=your-base64-encoded-private-key
```

## 🔧 Configuration

### Data Encryption

SecureShare uses three layers of encryption:

1. **Field-level Encryption**: Sensitive customer data is encrypted with AES-256-GCM
2. **Standard Hybrid Encryption**: RSA-OAEP-SHA256 + AES-256-GCM for secure partner data sharing
3. **Secure-Temporary-Key Encryption**: Enhanced security with double encryption and per-request keys

The encryption key must be 32 bytes (256 bits) and should be securely stored in environment variables.

### MongoDB Setup

SecureShare requires a MongoDB database. The connection string should be specified in the `MONGODB_URI` environment variable.


## 📚 API Documentation

### Main Backend Endpoints

#### Authentication

- `POST /api/v1/auth/signup`: Register a new user
- `POST /api/v1/auth/login`: Authenticate user and get JWT tokens
- `POST /api/v1/auth/logout`: Logout and invalidate tokens
- `POST /api/v1/auth/refresh-token`: Get new access token using refresh token
- `POST /api/v1/auth/verify-token`: Verify JWT token validity

#### Customer Management

- `GET /api/v1/customers`: List all customers (admin only)
- `POST /api/v1/customers`: Create customer (admin only)
- `GET /api/v1/customers/:customerId`: Get customer details (admin only)
- `PUT /api/v1/customers/:customerId`: Update customer (admin only)
- `DELETE /api/v1/customers/:customerId`: Delete customer (admin only)
- `GET /api/v1/customers/my-profile`: Get own profile (customer)
- `POST /api/v1/customers/my-profile`: Create/update own profile (customer)

#### Partner Management

- `GET /api/v1/partners`: List all partners (admin only)
- `POST /api/v1/partners/register`: Register new partner (admin only)
- `GET /api/v1/partners/:partnerId`: Get partner details (admin only)
- `PUT /api/v1/partners/:partnerId`: Update partner details (admin only)
- `POST /api/v1/partners/:partnerId/keys`: Update partner public key (admin only)
- `GET /api/v1/partners/approved`: List approved partners
- `GET /api/v1/partners/:partnerId/contract`: Get partner contract details
- `GET /api/v1/partners/pending-contracts`: List partners with pending contracts (admin only)
- `POST /api/v1/partners/:partnerId/contract/approve`: Approve partner contract (admin only)
- `POST /api/v1/partners/data-request`: Request customer data (partner)
- `GET /api/v1/partners/consents`: List consents for partner (partner)

#### Consent Management

- `GET /api/v1/consents`: List all consents (admin only)
- `POST /api/v1/consents`: Create new consent
- `GET /api/v1/consents/:consentId`: Get consent details
- `PUT /api/v1/consents/:consentId`: Update consent
- `POST /api/v1/consents/:consentId/revoke`: Revoke consent
- `GET /api/v1/consents/customer/:customerId`: List consents for customer
- `GET /api/v1/consents/partner/:partnerId`: List consents for partner (admin only)

#### Audit Logging

- `GET /api/v1/audit/logs`: List all audit logs (admin only)
- `GET /api/v1/audit/consents/:consentId`: List audit logs for consent
- `GET /api/v1/audit/customers/:customerId`: List audit logs for customer
- `GET /api/v1/audit/partners/:partnerId`: List audit logs for partner (admin only)

### Partner Backend Endpoints

- `GET /`: Information about the partner service
- `GET /health`: Health check endpoint
- `GET /public-key`: Get public key for bank registration
- `POST /generate-keys`: Generate new RSA key pair
- `POST /receive-data`: Receive encrypted data from bank
- `POST /webhook`: Receive notifications from bank
- `POST /decrypt`: Manual decryption endpoint
- `POST /request-data`: Request data from bank API
- `GET /test-decrypt`: Test decryption functionality

## 🔒 Security Features

### Authentication & Authorization

- JWT-based authentication with refresh tokens
- Role-based access control (admin, customer, partner)
- API token authentication for partners
- Token hashing for enhanced security

### Data Protection

- AES-256-GCM field-level encryption for PII data
- SHA-256 hashing for searchable fields
- RSA-OAEP asymmetric encryption for secure key exchange
- Hybrid encryption (RSA+AES) for efficient data sharing

### API Security

- Rate limiting (100 requests per 15-minute window)
- Helmet for secure HTTP headers
- CORS protection
- Input validation and sanitization
- Error handling without leaking sensitive information

### Audit Trail

- Immutable audit logs with UUID for each event
- Hash chaining for tamper detection
- Digital signatures for data integrity verification
- Complete history of all system operations

## 🤝 Partner Integration Guide

### Step 1: Generate RSA Key Pair

Partners should generate an RSA key pair (2048-bit or stronger) to:
1. Register with the bank
2. Decrypt data received from the bank

The provided partner-backend includes a key generation tool:
```bash
cd partner-backend
node generate-keys.js
```

### Step 2: Register with the Bank

Partners need to:
1. Provide their public key to the bank administrator
2. Define the data fields they need access to
3. Specify webhook URL for notifications (optional)

The bank admin will:
1. Register the partner
2. Review and approve the data sharing contract
3. Provide partner credentials (Partner ID and API Token)

### Step 3: Configure Partner Backend

Update the partner-backend `.env` file with:
```
PARTNER_ID=your-assigned-partner-id
API_TOKEN=your-assigned-api-token
BANK_API_URL=https://bank-api-url/api/v1
```

### Step 4: Receive and Decrypt Data

Partners can receive data in two ways:
1. **Push model**: Bank sends data to partner's webhook when customer consents
2. **Pull model**: Partner requests data using the `/request-data` endpoint

Data is always encrypted and requires the partner's private key for decryption.

## ⚙️ Development

### Running the Applications

```bash
# Run main backend
cd backend
npm run dev

# Run partner backend
cd partner-backend
npm run dev
```

### Testing

```bash
# Run tests for main backend
cd backend
npm test

# Run tests for partner backend
cd partner-backend
npm test
```

### Logging

Both backends use console logging for development. In production, consider:
- Implementing a proper logging service (Winston, Bunyan, etc.)
- Setting up log aggregation
- Configuring alert thresholds