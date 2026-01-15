# Demand Letter Generator

An AI-powered document generation platform designed for law firms to streamline the creation and management of demand letters. Built with a modern microservices architecture, it combines intelligent document processing with real-time collaboration capabilities.

## Overview

Demand Letter Generator automates the labor-intensive process of drafting demand letters by leveraging large language models to analyze source documents and generate professionally structured legal correspondence. The platform supports multi-user collaboration, version control, and customizable templates tailored to each firm's requirements.

### Key Capabilities

- **AI-Powered Generation**: Automated demand letter drafting using OpenAI's GPT models with context from uploaded case documents
- **Real-Time Collaboration**: Google Docs-style simultaneous editing with live cursor tracking and conflict-free synchronization
- **Template Management**: Firm-specific templates with placeholder support and approval workflows
- **Change Tracking**: Comprehensive revision history with accept/reject functionality for tracked changes
- **Document Processing**: Support for PDF, DOCX, and TXT file uploads with automatic text extraction
- **Export Options**: Generate formatted DOCX documents preserving styling and structure

## Architecture

The platform follows a microservices architecture with three primary components:

```text
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    Frontend     │────▶│  Backend API    │────▶│   AI Service    │
│   React + TS    │     │  Node.js/Express│     │  Python/FastAPI │
│   Port: 5173    │     │   Port: 3001    │     │   Port: 8000    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌─────────────────┐
                        │     SQLite      │
                        │    Database     │
                        └─────────────────┘
```

### Technology Stack

**Frontend**
- React 19 with TypeScript
- Vite for build tooling
- TanStack Query for server state management
- Tiptap rich text editor with Yjs CRDT for collaboration
- Socket.IO client for real-time communication

**Backend API**
- Node.js with Express 5
- SQLite with connection pooling
- JWT authentication
- Socket.IO for WebSocket connections
- Helmet, CORS, and rate limiting for security

**AI Service**
- Python with FastAPI
- OpenAI SDK for LLM integration
- PyPDF2 and python-docx for document processing
- Pydantic for request validation

## Getting Started

### Prerequisites

- Node.js 20 or later
- Python 3.11 or later
- npm or yarn
- OpenAI API key

### Installation

Clone the repository and install dependencies:

```bash
# Install all dependencies (frontend, backend, and AI service)
npm run install:all
```

Or install each service manually:

```bash
# Root dependencies
npm install

# Frontend
cd frontend && npm install

# Backend
cd backend && npm install

# AI Service
cd ai-service
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### Configuration

Create a `.env` file in the root directory:

```env
# OpenAI Configuration
OPENAI_API_KEY=sk-your-api-key

# Backend Configuration
BACKEND_PORT=3001
JWT_SECRET=your-secure-jwt-secret
NODE_ENV=development
ENCRYPTION_SECRET=your-encryption-key

# AI Service Configuration
AI_SERVICE_PORT=8000
AI_SERVICE_URL=http://localhost:8000

# Frontend Configuration
VITE_API_URL=http://localhost:3001
VITE_AI_SERVICE_URL=http://localhost:8000
FRONTEND_URL=http://localhost:5173

# Database Configuration
DATABASE_PATH=./data/database.sqlite
```

### Running the Application

Start all services concurrently:

```bash
npm run dev
```

Or start each service individually:

```bash
# Frontend (http://localhost:5173)
npm run dev:frontend

# Backend API (http://localhost:3001)
npm run dev:backend

# AI Service (http://localhost:8000)
npm run dev:ai
```

### Database Setup

Seed the database with initial data:

```bash
cd backend
npm run db:seed
```

To reset the database:

```bash
npm run db:reset
```

## Project Structure

```text
├── frontend/               # React frontend application
│   ├── src/
│   │   ├── components/    # Reusable UI components
│   │   ├── pages/         # Route page components
│   │   ├── contexts/      # React context providers
│   │   ├── hooks/         # Custom React hooks
│   │   ├── lib/           # Utilities and API clients
│   │   └── types/         # TypeScript type definitions
│   └── e2e/               # Playwright E2E tests
│
├── backend/                # Node.js API server
│   ├── src/
│   │   ├── routes/        # Express route handlers
│   │   ├── services/      # Business logic services
│   │   ├── middleware/    # Express middleware
│   │   ├── db/            # Database schema and utilities
│   │   └── types/         # TypeScript type definitions
│   └── tests/             # Unit and integration tests
│
├── ai-service/             # Python AI processing service
│   ├── app/
│   │   ├── routers/       # FastAPI route handlers
│   │   ├── services/      # AI and document processing
│   │   └── models/        # Pydantic models
│   └── tests/             # Pytest test suite
│
├── docs/                   # Project documentation
│   ├── PRD.md             # Product requirements document
│   └── development/       # Development resources
│       └── TASK_LIST.md   # Implementation task tracking
│
└── .github/workflows/      # CI/CD pipeline configuration
```

## Documentation

Additional documentation is available in the `docs/` directory:

- **[Product Requirements](docs/PRD.md)**: Detailed product specifications and feature requirements
- **[Task List](docs/development/TASK_LIST.md)**: Development progress and implementation tracking

## API Reference

### Authentication

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/register` | POST | Register a new user |
| `/api/auth/login` | POST | Authenticate and receive JWT |
| `/api/auth/refresh-token` | POST | Refresh access token |
| `/api/auth/logout` | POST | Invalidate session |

### Documents

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/documents` | GET | List uploaded documents |
| `/api/documents` | POST | Upload a new document |
| `/api/documents/:id` | GET | Retrieve document details |
| `/api/documents/:id` | DELETE | Remove a document |
| `/api/documents/:id/download` | GET | Download original file |

### Demand Letters

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/demand-letters` | GET | List demand letters |
| `/api/demand-letters` | POST | Generate new demand letter |
| `/api/demand-letters/:id` | GET | Retrieve demand letter |
| `/api/demand-letters/:id` | PUT | Update demand letter |
| `/api/demand-letters/:id/versions` | GET | Version history |
| `/api/demand-letters/:id/export` | POST | Export to DOCX |

### AI Service

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/ai/generate` | POST | Generate demand letter content |
| `/ai/refine` | POST | Refine existing content |
| `/ai/analyze` | POST | Analyze uploaded documents |
| `/ai/extract-text` | POST | Extract text from documents |
| `/ai/export` | POST | Export to DOCX format |

## Testing

Run the complete test suite:

```bash
# All unit tests
npm run test

# Frontend tests
cd frontend && npm test

# Backend tests
cd backend && npm test

# AI service tests
cd ai-service && pytest

# End-to-end tests
npm run test:e2e

# Load testing
npm run test:load
```

## Deployment

The application is configured for deployment on Vercel with serverless functions.

### Vercel Deployment

1. Connect your repository to Vercel
2. Configure environment variables in the Vercel dashboard
3. Deploy via push to the main branch

The CI/CD pipeline runs automatically on pull requests and merges:
- Linting and type checking
- Unit and integration tests
- E2E tests
- Security audits
- Automated deployment

### Production Configuration

```env
NODE_ENV=production
STATELESS_MODE=true
MIN_INSTANCES=1
MAX_INSTANCES=10
TARGET_CPU=70
```

## Security

The platform implements multiple security layers:

- **Authentication**: JWT-based authentication with refresh token rotation
- **Encryption**: Sensitive data encrypted at rest
- **Rate Limiting**: Configurable request throttling per endpoint
- **Input Validation**: Request validation on all endpoints
- **Security Headers**: Helmet middleware for CSP, HSTS, and XSS protection
- **Audit Logging**: Comprehensive activity logging for compliance

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes (`git commit -m 'Add your feature'`)
4. Push to the branch (`git push origin feature/your-feature`)
5. Open a Pull Request

Please ensure all tests pass and follow the existing code style.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
