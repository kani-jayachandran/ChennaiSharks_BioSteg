@echo off
echo 🔧 Setting up BioSteg-Locker Backend...

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js is not installed. Please install Node.js 18+ first.
    pause
    exit /b 1
)

REM Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Python is not installed. Please install Python 3.8+ first.
    pause
    exit /b 1
)

REM Create .env file if it doesn't exist
if not exist .env (
    echo 📝 Creating .env file...
    copy .env.example .env
    echo ✅ Created .env file. Please update it with your actual credentials.
)

REM Install Node.js dependencies
echo 📦 Installing Node.js dependencies...
npm install

REM Install Python dependencies
echo 🐍 Installing Python dependencies...
pip install -r requirements.txt

REM Create temp directory
if not exist temp mkdir temp

echo ✅ Backend setup complete!
echo.
echo 📋 Next steps:
echo 1. Update the .env file with your Supabase and AWS credentials
echo 2. Run 'npm run dev' to start the development server
echo 3. Or run 'npm start' for production mode
echo.
echo 🔗 The server will be available at: http://localhost:3001
echo 🏥 Health check endpoint: http://localhost:3001/health
pause