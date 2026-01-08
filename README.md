# BioSteg-Locker: Secure Document Storage using Steganography and Biometrics

A secure document storage system that uses steganography to hide encrypted documents inside images and biometric authentication for access control.

## Features

- **Steganographic Storage**: Documents are encrypted and hidden inside normal images using OpenCV
- **Biometric Authentication**: WebAuthn-based fingerprint/face recognition
- **Time-Based Access Control**: Documents are only accessible within specified time windows
- **Secure Cloud Storage**: Only steganographic images are stored in AWS S3, never raw documents
- **Role-Based Access**: User authentication with Supabase

## Tech Stack

### Frontend
- React + Vite + TypeScript
- Tailwind CSS
- WebAuthn for biometric authentication

### Backend
- Node.js + Express
- Supabase (Auth + Database)
- AWS S3 (image storage)
- OpenCV (steganography)
- ONNX Runtime (biometric AI inference)

## Project Structure

```
biosteg-locker/
├── frontend/                 # React frontend
├── backend/                  # Node.js backend
├── database/                 # Supabase schema
├── docker-compose.yml        # Development environment
└── README.md
```

## Setup Instructions

### Prerequisites
- Node.js 18+
- Python 3.8+ (for OpenCV)
- Supabase account
- AWS account
- Docker (optional, for containerized deployment)

### Quick Start with Docker

1. **Clone the repository**
```bash
git clone <repository>
cd biosteg-locker
```

2. **Setup environment variables**
```bash
cp .env.example .env
# Edit .env with your actual values
```

3. **Start with Docker Compose**
```bash
docker-compose up -d
```

4. **Setup database**
- Run the SQL scripts in `database/schema.sql` in your Supabase dashboard

### Manual Installation

#### Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

#### Backend Setup
```bash
cd backend
cp .env.example .env
npm install
pip install opencv-python onnxruntime numpy
npm run dev
```

#### Frontend Setup
```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

#### Database Setup
- Run the SQL scripts in `database/schema.sql` in your Supabase dashboard

### Usage

1. Register/Login with email and password
2. Upload a document (PDF/DOC) with time window settings
3. System encrypts document and hides it in a carrier image
4. Access document using biometric authentication within the time window
5. Document auto-locks after expiration

## Security Features

- Documents are never stored in plain text
- Only steganographic images are visible in cloud storage
- Time-based access control prevents unauthorized access
- Biometric verification using ONNX AI models
- HTTPS-only API endpoints
- JWT-based session management

## Development

```bash
# Start backend
cd backend && npm run dev

# Start frontend
cd frontend && npm run dev

# Run tests
npm test
```

## Deployment

The application is designed to be deployment-ready with proper error handling, security measures, and scalable architecture.