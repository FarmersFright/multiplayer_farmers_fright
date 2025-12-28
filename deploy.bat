@echo off
REM Farmer's Fright Multiplayer Deployment Script for Windows

echo 🚀 Deploying Farmer's Fright Multiplayer...

REM Check if Vercel CLI is installed
vercel --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Vercel CLI not found. Installing...
    npm install -g vercel
)

REM Check if user is logged in to Vercel
vercel whoami >nul 2>&1
if %errorlevel% neq 0 (
    echo 🔐 Please login to Vercel:
    vercel login
)

REM Deploy to Vercel
echo 📦 Deploying frontend to Vercel...
vercel --prod

echo ✅ Frontend deployment complete!
echo.
echo 📋 Next steps:
echo 1. Deploy your backend server (see DEPLOYMENT.md)
echo 2. Set SERVER_URL environment variable in Vercel dashboard
echo 3. Test the multiplayer functionality
echo.
echo 📖 See DEPLOYMENT.md for detailed instructions

pause
