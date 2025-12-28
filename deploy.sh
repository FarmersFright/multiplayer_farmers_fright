#!/bin/bash

# Farmer's Fright Multiplayer Deployment Script

echo "🚀 Deploying Farmer's Fright Multiplayer..."

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI not found. Installing..."
    npm install -g vercel
fi

# Check if user is logged in to Vercel
if ! vercel whoami &> /dev/null; then
    echo "🔐 Please login to Vercel:"
    vercel login
fi

# Deploy to Vercel
echo "📦 Deploying frontend to Vercel..."
vercel --prod

echo "✅ Frontend deployment complete!"
echo ""
echo "📋 Next steps:"
echo "1. Deploy your backend server (see DEPLOYMENT.md)"
echo "2. Set SERVER_URL environment variable in Vercel dashboard"
echo "3. Test the multiplayer functionality"
echo ""
echo "📖 See DEPLOYMENT.md for detailed instructions"
