# 💍 BandhanBD — Server

> RESTful API for the BandhanBD matrimonial platform. Built with Node.js, Express, MongoDB Atlas, JWT authentication, and Stripe payments.

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-4.18-000000?logo=express)](https://expressjs.com)
[![MongoDB](https://img.shields.io/badge/MongoDB-6.0-47A248?logo=mongodb)](https://mongodb.com)
[![JWT](https://img.shields.io/badge/JWT-Auth-000000?logo=jsonwebtokens)](https://jwt.io)
[![Stripe](https://img.shields.io/badge/Stripe-Payments-635BFF?logo=stripe)](https://stripe.com)

---

## 🌐 Live API

| Resource | URL |
|---|---|
| 🔧 Base URL | `https://true-companions-server.vercel.app` |
| ❤️ Health Check | `GET /` |

---

## ✨ Features

- **JWT Authentication** — 7-day tokens issued on login; all sensitive routes protected
- **Role-Based Access Control** — `user`, `premium`, and `admin` roles enforced server-side
- **Biodata Management** — Auto-incrementing `biodataId`, upsert support, premium workflow
- **Contact Info Gating** — Contact details stripped from responses unless requester is premium or has an approved contact request
- **Stripe Payments** — Fixed $5 USD PaymentIntent creation; amount enforced server-side
- **Contact Request Workflow** — Create → Admin approves → requester sees contact info
- **Admin Dashboard Stats** — Parallel aggregation queries for KPI data
- **Success Stories** — Sorted by marriage date descending
- **User Search** — Server-side regex search on username for admin panel

---

## 🛠️ Tech Stack

| Category | Technology |
|---|---|
| Runtime | Node.js 18+ |
| Framework | Express 4.18 |
| Database | MongoDB Atlas (v6) via native driver |
| Authentication | JSON Web Tokens (jsonwebtoken) |
| Payments | Stripe Node.js SDK |
| Environment | dotenv |
| Dev Server | nodemon |
| Deployment | Vercel |

---

## 📁 Project Structure

```
bandhanbd-server/
├── index.js          # All routes, middleware, and DB logic
├── package.json
├── .env.example      # Environment variable template
└── .env              # Your local secrets (git-ignored)
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js **18+**
- npm
- MongoDB Atlas cluster
- Stripe account (test mode)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/your-username/bandhanbd-server.git
cd bandhanbd-server

# 2. Install dependencies
npm install

# 3. Configure environment variables
cp .env.example .env
# Fill in your values

# 4. Start development server
npm run dev
```

The server will run at `http://localhost:5500`.

---

## 🔐 Environment Variables

Create a `.env` file in the project root:

```env
# Server
PORT=5500
CLIENT_URL=https://your-frontend-domain.web.app

# MongoDB Atlas
DB_USER=your_mongodb_username
DB_PASS=your_mongodb_password

# JWT — use a long random string (e.g. openssl rand -base64 64)
ACCESS_TOKEN_SECRET=your_strong_random_jwt_secret

# Stripe
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxx
```

> ⚠️ Never commit `.env` to version control.

---

## 📡 API Reference

### Base URL
```
https://true-companions-server.vercel.app
```

### Authentication Header
```
Authorization: Bearer <jwt_token>
```

### Standard Response Format
```json
// Success
{ "success": true, "data": {}, "message": "..." }

// Error
{ "message": "Unauthorized access" }
```

---

### 🔑 Auth

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/jwt` | None | Issue a 7-day JWT for the given email |

**Request Body:**
```json
{ "email": "user@example.com" }
```

**Response:**
```json
{ "token": "eyJhbGci..." }
```

---

### 👤 Users

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/users` | Admin | List all users; supports `?search=name` |
| POST | `/users` | None | Register new user (upsert-safe) |
| GET | `/users/admin/:email` | Token | Check if user is admin |
| GET | `/users/premium/:email` | Token | Check if user is premium |
| PATCH | `/users/admin/:id` | Admin | Promote user to admin |
| PATCH | `/users/premium/:id` | Admin | Grant premium status |
| DELETE | `/users/:id` | Admin | Delete user |

---

### 📋 Biodatas

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/biodatas` | None | List with filters & pagination |
| POST | `/biodatas` | Token | Create biodata (auto-assigns biodataId) |
| PUT | `/biodatas/:email` | Token | Update own biodata |
| GET | `/biodatas/premium` | None | 6 premium profiles for homepage |
| GET | `/biodatas/stats` | None | Public counters (total, male, female, marriages) |
| GET | `/biodatas/mine` | Token | Get own biodata |
| GET | `/biodatas/by-email/:email` | Token | Get biodata by email |
| GET | `/biodatas/:id` | Token | Single biodata (contact info gated) |
| POST | `/biodatas/premium-request` | Token | Request premium status |
| GET | `/admin/biodatas` | Admin | All biodatas (paginated) |
| GET | `/admin/premium-requests` | Admin | Pending premium requests |
| PATCH | `/admin/biodatas/:id/approve-premium` | Admin | Approve premium request |
| PATCH | `/admin/biodatas/:id/reject-premium` | Admin | Reject premium request |

**GET /biodatas Query Parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `ageMin` | number | 18 | Minimum age filter |
| `ageMax` | number | 100 | Maximum age filter |
| `biodataType` | string | — | `Male` or `Female` |
| `division` | string | — | One of 7 BD divisions |
| `page` | number | — | Page number (requires `limit`) |
| `limit` | number | — | Items per page |
| `sort` | string | — | `asc` or `desc` by age |

---

### 💛 Favourites

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/favourites` | Token | Get current user's favourites |
| POST | `/favourites` | Token | Add a biodata to favourites |
| DELETE | `/favourites/:id` | Token | Remove a favourite (own only) |

---

### 💳 Payments

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/payment/create-intent` | Token | Create Stripe PaymentIntent ($5 fixed) |
| POST | `/payments` | Token | Save a completed payment record |
| GET | `/payments` | Admin | All payment records |
| GET | `/payments/:email` | Token | Own payment history |

---

### 📨 Contact Requests

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/contact-requests/mine` | Token | Current user's requests |
| GET | `/contact-requests` | Admin | All contact requests |
| POST | `/contact-requests` | Token | Create after payment |
| PATCH | `/contact-requests/:id/approve` | Admin | Approve request |
| DELETE | `/contact-requests/:id` | Token | Delete own request |

---

### 💌 Success Stories

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/success-stories` | None | All stories (newest first) |
| GET | `/success-stories/admin` | Admin | Admin view with full details |
| POST | `/success-stories` | Token | Submit a success story |

---

### 📊 Admin Stats

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/admin/stats` | Admin | KPI data: counts + revenue |

**Response:**
```json
{
  "biodataCount": 150,
  "maleCount": 72,
  "femaleCount": 78,
  "premiumCount": 24,
  "revenue": 120
}
```

---

## 🗄️ Database Schema

### Collections in `trueCompanions` DB

#### `users`
```js
{
  _id, name, email (unique), photoURL,
  role: "user" | "admin" | "premium",
  isPremium: Boolean,
  createdAt: Date
}
```

#### `biodatas`
```js
{
  _id,
  biodataId: Number,          // auto-increment, sequential
  biodataType: "Male" | "Female",
  name, profileImage, dob, age, height, weight,
  occupation, race, fatherName, motherName,
  permanentDivision, presentDivision,
  expectedPartnerAge, expectedPartnerHeight, expectedPartnerWeight,
  contactEmail, mobileNumber,  // stripped from responses unless authorised
  email,                       // linked to Firebase auth
  isPremium: Boolean,
  premiumStatus: "none" | "pending" | "approved" | "rejected",
  premiumRequestDate: Date,
  premiumApprovedDate: Date,
  createdAt, updatedAt
}
```

#### `contactRequests`
```js
{
  _id, biodataId, biodataName,
  requesterEmail,
  status: "pending" | "approved",
  stripePaymentId,
  amountPaid: 5,
  createdAt, approvedAt
}
```

#### `payments`
```js
{
  _id, email, amount, transactionId,
  biodataId, date, createdAt
}
```

#### `favourites`
```js
{
  _id, email,
  biodataMongoId, biodataId,
  name, permanentDivision, occupation, profileImage,
  addedAt
}
```

#### `successStories`
```js
{
  _id, selfBiodataId, partnerBiodataId,
  coupleImage, successStory,
  marriageDate, reviewStar (1–5),
  submitterEmail, createdAt
}
```

---

## 🛡️ Security

### JWT Flow
```
Client POSTs { email } to /jwt
     ↓
Server signs JWT (HS256, 7d expiry) with ACCESS_TOKEN_SECRET
     ↓
Client stores token in localStorage
     ↓
Client sends Authorization: Bearer <token> with every request
     ↓
verifyToken middleware validates signature → attaches req.decoded
     ↓
verifyAdmin middleware checks role in DB for admin routes
```

### Contact Info Gating
```
GET /biodatas/:id
     ↓
Server checks if requester is premium user
  OR has an approved contact request for this biodataId
     ↓
If not authorised → contactEmail and mobileNumber are deleted
  from the response object before sending
```

### Key Security Measures
- All secrets in environment variables — never in source code
- Payment amount ($5) enforced server-side — not trusted from client
- Users can only delete/modify their own resources (email cross-check)
- Admin role verified in DB on every admin route (not just JWT claim)
- CORS restricted to whitelisted origins

---

## 🧪 Testing the API

Import these into Postman or use cURL:

```bash
# Health check
curl https://true-companions-server.vercel.app/

# Get a JWT
curl -X POST https://true-companions-server.vercel.app/jwt \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com"}'

# Get biodatas (public)
curl "https://true-companions-server.vercel.app/biodatas?ageMin=20&ageMax=35&biodataType=Male&page=1&limit=20"

# Get admin stats (requires admin JWT)
curl https://true-companions-server.vercel.app/admin/stats \
  -H "Authorization: Bearer <your_admin_token>"
```

---

## 📦 Deploy to Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel --prod
```

Add all environment variables in the Vercel dashboard under **Project → Settings → Environment Variables**.

Make sure `vercel.json` exists:

```json
{
  "version": 2,
  "builds": [{ "src": "index.js", "use": "@vercel/node" }],
  "routes": [{ "src": "/(.*)", "dest": "/index.js" }]
}
```

---

## 📜 Scripts

| Command | Description |
|---|---|
| `npm start` | Start production server |
| `npm run dev` | Start with nodemon (hot reload) |

---

## 🗂️ Git Commit Convention

```
feat: add contact request approval endpoint
fix: strip contact info from unauthenticated responses
chore: update dependencies
refactor: extract verifyAdmin middleware
```

Maintain at least **12 meaningful commits** for server-side changes.

---

## 📄 License

This project is licensed under the MIT License.