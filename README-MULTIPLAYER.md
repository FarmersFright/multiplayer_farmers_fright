# Multiplayer Setup Guide

This guide explains how to set up and use the multiplayer version of Farmer's Fright.

## Prerequisites

- Node.js (version 14 or higher)
- npm (comes with Node.js)

## Installation

1. Install dependencies:
```bash
npm install
```

## Running the Server

1. Start the multiplayer server:
```bash
npm start
```

The server will start on port 3000 by default. You can change this by setting the `PORT` environment variable.

## Connecting to Multiplayer

### Option 1: Using the Main Menu

1. Open `index.html` in your browser
2. Click "PLAY GAME"
3. Select "Multiplayer Game" mode
4. You will be redirected to the game with multiplayer enabled

### Option 2: Direct URL

Open the game with multiplayer enabled by adding query parameters:
```
index (7).html?multiplayer=true&playerId=1
```

Parameters:
- `multiplayer=true` - Enables multiplayer mode
- `playerId=1-8` - Sets which player you want to be (1-8)
- `server=http://localhost:3000` - Optional: specify server URL (defaults to localhost:3000)

## How It Works

### Server-Side
- The server maintains the authoritative game state
- All player actions are validated on the server
- Game state is broadcast to all connected clients at 60 FPS
- The server handles resource income, player connections, and action validation

### Client-Side
- Clients send player actions (unit movement, building, upgrades) to the server
- Clients receive game state updates and apply them locally
- Local rendering and UI remain client-side for responsiveness
- The game automatically syncs with the server state

## Features

- **Real-time synchronization**: All players see the same game state
- **Action validation**: Server validates all player actions
- **Player management**: Each player can join as a specific player ID (1-8)
- **Resource sync**: Resources are managed server-side
- **Building sync**: Buildings are synchronized across all clients
- **Unit sync**: Unit positions and states are synchronized

## Troubleshooting

### Connection Issues
- Make sure the server is running before opening the game
- Check that port 3000 is not blocked by a firewall
- Verify Socket.IO is loaded (check browser console for errors)

### Player ID Already Taken
- Each player ID (1-8) can only be used by one player at a time
- Try a different player ID if you get this error

### Game State Not Syncing
- Check browser console for errors
- Verify you're connected to the server (check connection status indicator)
- Try refreshing the page

## Development

### Server Code
- `server.js` - Main server file with Socket.IO handling
- `package.json` - Dependencies and scripts

### Client Code
- `multiplayer-client.js` - Client-side multiplayer module
- `game.js` - Modified to integrate with multiplayer client

### Testing Locally
1. Start the server: `npm start`
2. Open multiple browser windows/tabs
3. Connect each with a different `playerId` parameter
4. Play and verify synchronization

## Deployment

For production deployment, see [DEPLOYMENT.md](DEPLOYMENT.md) for detailed instructions on deploying to Vercel (frontend) and various server hosting platforms (backend).

### Quick Deployment

1. **Frontend (Vercel)**:
   ```bash
   npm install -g vercel
   vercel login
   vercel --prod
   ```

2. **Backend (Railway/Render/Heroku)**:
   - Push code to GitHub
   - Connect repository to hosting service
   - Set environment variables (see `env.example`)

3. **Configure SERVER_URL**:
   - Update Vercel environment variable with your backend URL

## Notes

- The server runs a simplified game loop for state management
- Most game logic (unit movement, combat, etc.) is still handled client-side
- For production, you may want to move more logic server-side for better anti-cheat
- The current implementation prioritizes responsiveness over strict server authority

