#!/bin/bash

echo "🔧 Setting up BioSteg-Locker Backend..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed. Please install Python 3.8+ first."
    exit 1
fi

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cp .env.example .env
    echo "✅ Created .env file. Please update it with your actual credentials."
fi

# Install Node.js dependencies
echo "📦 Installing Node.js dependencies..."
npm install

# Install Python dependencies
echo "🐍 Installing Python dependencies..."
pip3 install -r requirements.txt

# Create temp directory
mkdir -p temp

echo "✅ Backend setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Update the .env file with your Supabase and AWS credentials"
echo "2. Run 'npm run dev' to start the development server"
echo "3. Or run 'npm start' for production mode"
echo ""
echo "🔗 The server will be available at: http://localhost:3001"
echo "🏥 Health check endpoint: http://localhost:3001/health"