## SecureShare Backend Technical Documentation

This document provides a comprehensive technical overview of the SecureShare backend codebase, based on an in-depth analysis of every code file. It covers the system architecture, project structure, data flows, all endpoints (A-Z), how components interact, and every detail without omissions. The codebase consists of two main parts: the primary backend (fintech bank API) and the partner-backend (example partner service for data decryption).

References to code use the required format: `filepath:startLine`.

### 1. Project Overview
- **Purpose**: Secure data sharing platform for fintech, emphasizing consent management, encryption, auditing, and partner integration. Supports user authentication, customer data management, consent handling, and secure data requests.
- **Key Technologies**: Node.js, Express.js, MongoDB (Mongoose), JWT, bcrypt, crypto (AES/RSA), UUID, node-fetch/axios.
- **Dependencies** (from `backend/package.json:1` and `partner-backend/package.json:1`): Express, Mongoose, JWT, bcryptjs, crypto, dotenv, cors, helmet, morgan, rate-limit, uuid, validator, axios (partner), nodemon (dev).

### 2. System Architecture
- **High-Level Design**: Client-server architecture with MVC pattern (Models, Controllers, Routes). Two separate Express apps:
  - **Backend**: Main API for bank admins, customers, and partners. Handles authentication, data storage (encrypted), consents, audits.
  - **Partner-Backend**: Example service for partners to receive/decrypt data via webhooks and API requests.
- **Components**:
  - **Authentication**: JWT for users (`backend/models/userModel.js:1`), API tokens for partners (`backend/utils/apiTokenService.js:1`).
  - **Data Storage**: MongoDB with encrypted PII fields (`backend/utils/encryptionService.js:1`).
  - **Encryption**: Hybrid RSA + AES for partner data sharing; AES-256-GCM for field-level encryption.
  - **Auditing**: Immutable logs with hashing/signing (`backend/utils/auditService.js:1`).
  - **Notifications**: Webhooks to partners (`backend/utils/notificationService.js:1`).
  - **Signature**: Data signing for integrity (`backend/utils/signatureService.js:1`).
- **Security Layers**: Rate limiting, Helmet, CORS, input validation, role-based access, token hashing.
- **Deployment**: Node.js runtime; MongoDB connection via env URI (`backend/server.js:1`).
- **Scalability**: Stateless API; can scale horizontally with load balancer.

### 3. Detailed Data Flows and How It Works
This section expands on the system's operations, detailing step-by-step flows and inter-component interactions for all major processes. Each flow references relevant files and explains mechanics.

#### 1. Server Startup and Initialization (`backend/server.js:1`)
- Loads dotenv config.
- Sets API base URL and min consent duration if not in env.
- Initializes Express with security middleware (helmet for headers, rate-limit to prevent abuse).
- Mounts routes for auth, customers, consents, partners, audit.
- Connects to MongoDB (`mongoose.connect`), starts server on PORT 5000.
- Handles unhandled rejections by logging and exiting.
- **How it works**: Non-blocking async connection; server listens only after DB connect succeeds.

#### 2. User Registration and Login Flow (`backend/controllers/authController.js:1`, `backend/routes/authRoutes.js:1`)
- **Signup**: POST `/api/v1/auth/signup` (public). Creates user with hashed password (`bcrypt`), default 'customer' role. Logs audit event. Generates/sends tokens.
- **Login**: POST `/api/v1/auth/login` (public). Verifies email/password (`bcrypt.compare`), updates lastLogin, logs audit, generates tokens.
- **Token Generation** (`backend/models/userModel.js:1`): Signs JWT with secrets, encrypts refresh token before save.
- **Logout**: POST `/api/v1/auth/logout` (protected). Clears refresh token.
- **Refresh**: POST `/api/v1/auth/refresh-token` (public). Verifies refresh token, decrypts stored one for comparison, issues new tokens.
- **Verify**: POST `/api/v1/auth/verify-token` (public). Verifies JWT and user existence.
- **How it works**: Protected by `protect` middleware (`backend/middleware/authMiddleware.js:1`) for auth checks. Tokens include user details. Password changes invalidate old tokens.

#### 3. Customer Profile Management Flow (`backend/controllers/customerController.js:1`, `backend/routes/customerRoutes.js:1`)
- **Self Create/Update**: POST/GET `/api/v1/customers/my-profile` (customer-protected). Encrypts PII fields (`encryptionService.encryptField`), stores hashes, links to user model.
- **Admin CRUD**: GET/POST/PUT/DELETE `/api/v1/customers(/:id)` (admin-protected). Similar encryption; decrypts on read (`decryptCustomerData`).
- **How it works**: Uses `protect` and `restrictTo('admin')` or customer checks. Encryption ensures PII security; hashes enable searches without decryption. Audits all changes.

#### 4. Partner Management Flow (`backend/controllers/partnerController.js:1`, `backend/routes/partnerRoutes.js:1`)
- **Registration**: POST `/api/v1/partners/register` (admin). Generates ID, token (`apiTokenService`), stores requested contract, notifies via webhook if callback set (`notificationService.notifyPartner`).
- **Update/Key Update**: PUT/POST `/api/v1/partners/:id(/keys)` (admin). Updates details, contract; notifies on changes.
- **Contract Approval**: POST `/api/v1/partners/:id/contract/approve` (admin). Sets approvedContract, generates contract ID, notifies with bank public key and endpoints.
- **Lists**: GET `/api/v1/partners(/approved/pending-contracts/:id/contract)` (varied access). Filters by status.
- **How it works**: Admin-only for management; public key stored for encryption. Notifications signed (`signatureService.signData`). Partner auth via `partnerProtect` middleware.

#### 5. Consent Management Flow (`backend/controllers/consentController.js:1`, `backend/routes/consentRoutes.js:1`)
- **Create**: POST `/api/v1/consents` (protected). Validates duration, copies approved contract from partner, calculates expiry, notifies partner.
- **Update/Revoke**: PUT/POST `/api/v1/consents/:id(/revoke)` (owner). Updates fields/sets status, recalculates expiry, notifies.
- **Gets**: GET `/api/v1/consents(/:id/customer/:customerId/partner/:partnerId)` (varied). Permission checks.
- **How it works**: Uses partner's approved contract data. Expiry based on duration/retention. Status changes trigger audits and notifications.

#### 6. Data Request and Sharing Flow (`backend/controllers/partnerController.js:1`)
- **Request**: POST `/api/v1/partners/data-request` (partner auth). Validates consent/active status, requested fields match allowed.
- **Processing**: Fetches customer data, decrypts, re-encrypts with partner's public key (`encryptionService.encryptWithPublicKey`), signs response.
- **Partner Side** (`partner-backend/server.js:1`): Receives at `/receive-data`, decrypts (`decryptionService.decryptHybridData`), handles field decryption if needed.
- **How it works**: Hybrid encryption ensures only partner can decrypt. Temporary keys per request enhance security. Audited at each step.

#### 7. Audit Logging and Verification Flow (`backend/controllers/auditController.js:1`, `backend/utils/auditService.js:1`)
- **Logging**: Called throughout (e.g., `auditService.logEvent`). Generates UUID, hashes event, signs, chains previous hash.
- **Querying**: GET endpoints with filters/pagination, integrity check via hash chain verification.
- **How it works**: Immutable (no timestamps update, immutable fields). Verification traverses chain, checks signatures (`signatureService.verifySignature`).

#### 8. Utility Services
- **Encryption** (`backend/utils/encryptionService.js:1`): AES for fields, hybrid for sharing. Partner-backend mirrors for decryption (`partner-backend/decryptionService.js:1`).
- **Notifications** (`backend/utils/notificationService.js:1`): Async POST to callback with signing.
- **Signatures** (`backend/utils/signatureService.js:1`): RSA signing/verification.
- **Tokens** (`backend/utils/apiTokenService.js:1`): Generate/hash/verify partner tokens.
- **Regenerate Token** (`backend/utils/regeneratePartnerToken.js:1`): Script to reset partner tokens.

- **Error Handling**: Caught in controllers, passed to `errorHandler` middleware.
- **No Tests**: Repo lacks test files; recommend adding Jest/Mocha.

### 4. Project Structure
Root: `C:\Users\brije\Documents\secureshare-backend`
- `.gitignore`: Ignores node_modules, .env, etc.
- `forge.yaml`: Untracked config file (likely tool-specific).
- **backend/**: Main API.
  - `.env`: Environment variables (not in repo).
  - `BACKEND_DOCUMENTATION.md`: API docs (`backend/BACKEND_DOCUMENTATION.md:1`).
  - `controllers/`: Business logic.
  - `middleware/`: Auth and error handlers.
  - `models/`: Mongoose schemas.
  - `package.json`: Deps (`backend/package.json:1`).
  - `README.md`: Overview (`backend/README.md:1`).
  - `routes/`: Express routers.
  - `server.js`: App entry (`backend/server.js:1`).
  - `utils/`: Helpers (encryption, auditing, etc.).
- **partner-backend/**: Partner example.
  - `.env`, `.env.example`: Config.
  - `decryptionService.js`: Decryption logic (`partner-backend/decryptionService.js:1`).
  - `generate-keys.js`: Key gen script (`partner-backend/generate-keys.js:1`).
  - `keys/`: PEM keys and README (`partner-backend/keys/README.md:1`).
  - `package.json`: Deps (`partner-backend/package.json:1`).
  - `README.md`: Guide (`partner-backend/README.md:1`).
  - `SECURITY.md`: Security notes (`partner-backend/SECURITY.md:1`).
  - `server.js`: App entry (`partner-backend/server.js:1`).

MVC pattern in backend; flat structure in partner-backend.

### 5. Endpoints (A-Z)
All backend endpoints under `/api/v1/`. Partner-backend under `/`.

#### Backend Endpoints
- **Audit** (`backend/routes/auditRoutes.js:1`):
  - GET `/audit/logs`: All logs (admin) (`backend/controllers/auditController.js:1`).
  - GET `/audit/consents/:consentId`: Consent logs.
  - GET `/audit/customers/:customerId`: Customer logs.
  - GET `/audit/partners/:partnerId`: Partner logs (admin).

- **Auth** (`backend/routes/authRoutes.js:1`):
  - POST `/auth/login`: Login (`backend/controllers/authController.js:1`).
  - POST `/auth/logout`: Logout.
  - POST `/auth/refresh-token`: Refresh.
  - POST `/auth/signup`: Signup.
  - POST `/auth/verify-token`: Verify.

- **Consents** (`backend/routes/consentRoutes.js:1`):
  - GET `/consents`: All (admin) (`backend/controllers/consentController.js:1`).
  - POST `/consents`: Create.
  - GET `/consents/:consentId`: Get one.
  - PUT `/consents/:consentId`: Update.
  - POST `/consents/:consentId/revoke`: Revoke.
  - GET `/consents/customer/:customerId`: By customer.
  - GET `/consents/partner/:partnerId`: By partner (admin).

- **Customers** (`backend/routes/customerRoutes.js:1`):
  - GET `/customers`: All (admin) (`backend/controllers/customerController.js:1`).
  - POST `/customers`: Create (admin).
  - GET `/customers/:customerId`: Get one (admin).
  - PUT `/customers/:customerId`: Update (admin).
  - DELETE `/customers/:customerId`: Delete (admin).
  - GET `/customers/my-profile`: Self get.
  - POST `/customers/my-profile`: Self create/update.

- **Partners** (`backend/routes/partnerRoutes.js:1`):
  - GET `/partners`: All (admin) (`backend/controllers/partnerController.js:1`).
  - POST `/partners/register`: Register (admin).
  - GET `/partners/:partnerId`: Get one (admin).
  - PUT `/partners/:partnerId`: Update (admin).
  - POST `/partners/:partnerId/keys`: Update key (admin).
  - GET `/partners/approved`: Approved partners.
  - GET `/partners/:partnerId/contract`: Contract details.
  - GET `/partners/pending-contracts`: Pending (admin).
  - POST `/partners/:partnerId/contract/approve`: Approve (admin).
  - POST `/partners/data-request`: Request data (partner auth).
  - GET `/partners/consents`: Partner's consents (partner auth).

#### Partner-Backend Endpoints (`partner-backend/server.js:1`):
- GET `/`: Info.
- GET `/health`: Health check.
- GET `/public-key`: Get public key.
- POST `/generate-keys`: Generate keys.
- POST `/receive-data`: Receive encrypted data.
- POST `/webhook`: Bank notifications.
- POST `/decrypt`: Manual decrypt.
- POST `/request-data`: Request from bank.
- GET `/test-decrypt`: Test info.

### 6. Detailed File Summaries
- **backend/server.js:1**: Initializes Express, loads env, sets middleware (helmet, json, cors, morgan, rate-limit), mounts routes, connects MongoDB, handles errors.
- **Controllers**: Handle req/res logic, call models/utils.
  - auditController.js:1: Log querying with integrity verification (`backend/utils/auditService.js:1`).
  - authController.js:1: Auth ops with token generation (`backend/models/userModel.js:1`).
  - consentController.js:1: Consent management with validation, notifications (`backend/utils/notificationService.js:1`).
  - customerController.js:1: Customer CRUD with encryption/decryption (`backend/utils/encryptionService.js:1`).
  - partnerController.js:1: Partner ops, contract approval, data requests with encryption and notifications.
- **Middleware**: 
  - authMiddleware.js:1: JWT verify.
  - errorMiddleware.js:1: Error handling.
  - partnerProtect.js:1: Token hash check.
- **Models**: Define schemas, validators.
- **Routes**: Map URLs to controllers.
- **Utils**: Core services (encryption, auditing, etc.).
- **partner-backend**: Demo partner app for testing integration, focusing on decryption (`partner-backend/decryptionService.js:1`).

No tests; assume manual/integration testing.

This covers everything from the codebase.