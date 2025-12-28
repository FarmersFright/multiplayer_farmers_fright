# Farmer's Fright Multiplayer - Deployment Guide

This guide explains how to deploy the Farmer's Fright multiplayer game to Vercel (frontend) and a separate server host (backend).

## Architecture Overview

- **Frontend**: Static HTML/CSS/JS deployed to Vercel
- **Backend**: Node.js server with Socket.IO for real-time multiplayer functionality

## Prerequisites

- Vercel account (free tier available)
- Server hosting for the backend (Railway, Render, Heroku, DigitalOcean, etc.)
- Git repository with your code

## Frontend Deployment (Vercel)

### 1. Install Vercel CLI
```bash
npm install -g vercel
```

### 2. Deploy to Vercel
```bash
# Login to Vercel
vercel login

# Deploy the project
vercel

# Follow the prompts:
# - Link to existing project or create new? → Create new
# - Project name → farmers-fright-multiplayer (or your choice)
# - Directory → ./ (current directory)

# For production deployment
vercel --prod
```

### 3. Configure Environment Variables
In your Vercel dashboard or using CLI:

```bash
# Set the server URL (replace with your backend URL)
vercel env add SERVER_URL
# Enter: https://your-backend-server.com
```

## Backend Deployment

Choose one of the following hosting services:

### Option 1: Railway (Recommended)

1. Go to [Railway.app](https://railway.app) and create an account
2. Connect your GitHub repository
3. Railway will automatically detect the Node.js app
4. The server will be deployed at `https://your-project-name.railway.app`

### Option 2: Render

1. Go to [Render.com](https://render.com) and create an account
2. Create a new Web Service
3. Connect your GitHub repository
4. Configure:
   - Runtime: Node
   - Build Command: `npm install`
   - Start Command: `npm run server`
5. Deploy

### Option 3: Heroku

1. Install Heroku CLI
```bash
# Deploy to Heroku
heroku create your-app-name
git push heroku main
```

## Configuration

### Environment Variables

After deploying your backend, update the `SERVER_URL` environment variable in Vercel:

```bash
vercel env add SERVER_URL
# Enter your backend URL, e.g.:
# https://farmers-fright-server.railway.app
```

### Testing the Deployment

1. **Frontend**: Visit your Vercel deployment URL
2. **Backend**: Your backend should be running at the server URL you configured
3. **Multiplayer**: Open the game in multiple browser tabs/windows to test multiplayer functionality

## File Structure After Deployment

```
your-vercel-app.vercel.app/
├── index.html              # Main menu
├── multiplayer-queue.html  # Queue system
├── index (7).html          # Game interface
├── game.js                 # Game logic
├── multiplayer-client.js   # Client networking
├── ui-system.js           # UI components
├── style.css              # Game styling
├── config.js              # Configuration
└── vercel.json            # Vercel config
```

## Troubleshooting

### Common Issues

1. **"Socket.IO not loaded" error**
   - Make sure your backend server is running and accessible
   - Check that the SERVER_URL environment variable is set correctly

2. **Players can't connect**
   - Verify CORS settings in server.js
   - Check that the backend server allows WebSocket connections

3. **Game not loading**
   - Check browser console for JavaScript errors
   - Ensure all script files are loading correctly

### Server Logs

Check your backend server logs for connection issues:
- Railway: Dashboard → Deployments → View Logs
- Render: Dashboard → Service → Logs tab
- Heroku: `heroku logs --tail`

## Performance Optimization

### Frontend (Vercel)
- Files are automatically served from Vercel's global CDN
- Consider enabling Vercel's analytics for performance monitoring

### Backend
- Monitor server resource usage
- Consider implementing rate limiting for production
- Use connection pooling if needed

## Security Considerations

1. **HTTPS**: Both frontend and backend should use HTTPS
2. **CORS**: Configure appropriate CORS policies in server.js
3. **Input Validation**: Validate all player inputs on the server
4. **Rate Limiting**: Implement rate limiting to prevent abuse

## Updating the Deployment

### Frontend Updates
```bash
# Deploy changes to Vercel
vercel --prod
```

### Backend Updates
- Push changes to your Git repository
- The hosting service will automatically redeploy (Railway, Render)
- For Heroku: `git push heroku main`

## Cost Estimation

- **Vercel**: Free for personal projects, ~$20/month for pro features
- **Railway**: Free tier available, ~$5-10/month for basic usage
- **Render**: Free tier available, ~$7/month for persistent apps
- **Heroku**: Free tier discontinued, ~$7/month minimum

## Support

If you encounter issues:
1. Check the browser developer console for errors
2. Verify server logs
3. Test locally first: `npm run server` for backend, `npm run dev` for frontend
4. Ensure all environment variables are set correctly
