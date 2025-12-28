const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

// Global error handling for production
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  console.error('Stack:', err.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

const app = express();
const server = http.createServer(app);
// CORS configuration - secure for production
const corsOrigins = process.env.NODE_ENV === 'production'
  ? [process.env.FRONTEND_URL || 'https://your-frontend-domain.vercel.app']
  : ['http://localhost:3000', 'http://127.0.0.1:3000'];

const io = new Server(server, {
  cors: {
    origin: corsOrigins,
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Serve static files
app.use(express.static(__dirname));

// Health check endpoint for Render
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    connectedPlayers: connectedPlayers.size,
    queueSize: queue.length,
    gameRunning: gameState.isGameRunning
  });
});

// Game state
let gameState = {
  gameObjects: [],
  players: {},
  gameStartTime: Date.now(),
  isGameRunning: false
};

// Environment validation for production
if (process.env.NODE_ENV === 'production') {
  const requiredEnvVars = ['PORT'];
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:', missingVars.join(', '));
    console.error('Please set these environment variables in your Render dashboard.');
    process.exit(1);
  }

  console.log('✅ Environment validation passed');
}

// Connected players
const connectedPlayers = new Map(); // socketId -> { playerId, socket }

// Queue system
const queue = []; // Array of { socketId, socket }
const QUEUE_SIZE_REQUIRED = 2;

// Basic rate limiting
const connectionTracker = new Map(); // IP -> { count, resetTime }
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX_CONNECTIONS = 10; // Max connections per IP per minute

function checkRateLimit(ip) {
  const now = Date.now();
  const userLimit = connectionTracker.get(ip);

  if (!userLimit) {
    connectionTracker.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (now > userLimit.resetTime) {
    // Reset the window
    connectionTracker.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (userLimit.count >= RATE_LIMIT_MAX_CONNECTIONS) {
    return false;
  }

  userLimit.count++;
  return true;
}

// Clean up old rate limit entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of connectionTracker.entries()) {
    if (now > data.resetTime) {
      connectionTracker.delete(ip);
    }
  }
}, 60000); // Clean up every minute

// Game constants (must match client)
const MAP_WIDTH = 4800;
const MAP_HEIGHT = 4800;
const TILE_COUNT = 8;
const TILE_WIDTH = MAP_WIDTH / TILE_COUNT;
const TILE_HEIGHT = MAP_HEIGHT / TILE_COUNT;
const GRID_CELLS_PER_TILE = 4;
const INNER_TILE_RATIO = 0.45;
const INNER_TILE_WIDTH = Math.floor(TILE_WIDTH * INNER_TILE_RATIO);
const INNER_TILE_HEIGHT = Math.floor(TILE_HEIGHT * INNER_TILE_RATIO);
const INNER_TILE_OFFSET_X = Math.floor((TILE_WIDTH - INNER_TILE_WIDTH) / 2);
const INNER_TILE_OFFSET_Y = Math.floor((TILE_HEIGHT - INNER_TILE_HEIGHT) / 2);
const GRID_CELL_WIDTH = Math.floor(INNER_TILE_WIDTH / GRID_CELLS_PER_TILE);
const GRID_CELL_HEIGHT = Math.floor(INNER_TILE_HEIGHT / GRID_CELLS_PER_TILE);

// Initialize players
const maxSupplyCap = 45;
const players = {
  1: { team: 1, supplyCap: maxSupplyCap, currentSupply: 0, resources: 50, color: 'hsl(0, 75%, 65%)', killResourceScore: 0 },
  2: { team: 1, supplyCap: maxSupplyCap, currentSupply: 0, resources: 50, color: 'hsl(0, 75%, 40%)', killResourceScore: 0 },
  3: { team: 2, supplyCap: maxSupplyCap, currentSupply: 0, resources: 50, color: 'hsl(210, 75%, 65%)', killResourceScore: 0 },
  4: { team: 2, supplyCap: maxSupplyCap, currentSupply: 0, resources: 50, color: 'hsl(210, 75%, 40%)', killResourceScore: 0 },
  5: { team: 3, supplyCap: maxSupplyCap, currentSupply: 0, resources: 50, color: 'hsl(120, 75%, 60%)', killResourceScore: 0 },
  6: { team: 3, supplyCap: maxSupplyCap, currentSupply: 0, resources: 50, color: 'hsl(120, 75%, 35%)', killResourceScore: 0 },
  7: { team: 4, supplyCap: maxSupplyCap, currentSupply: 0, resources: 50, color: 'hsl(30, 70%, 60%)', killResourceScore: 0 },
  8: { team: 4, supplyCap: maxSupplyCap, currentSupply: 0, resources: 50, color: 'hsl(30, 70%, 35%)', killResourceScore: 0 }
};

// Helper function to convert grid to world coordinates
function gridToWorld(gridX, gridY) {
  const tileX = Math.floor(gridX / GRID_CELLS_PER_TILE);
  const tileY = Math.floor(gridY / GRID_CELLS_PER_TILE);
  const gridXInTile = gridX % GRID_CELLS_PER_TILE;
  const gridYInTile = gridY % GRID_CELLS_PER_TILE;
  const tileWorldX = tileX * TILE_WIDTH;
  const tileWorldY = tileY * TILE_HEIGHT;
  const innerAreaX = tileWorldX + INNER_TILE_OFFSET_X;
  const innerAreaY = tileWorldY + INNER_TILE_OFFSET_Y;
  const worldX = innerAreaX + gridXInTile * GRID_CELL_WIDTH + GRID_CELL_WIDTH / 2;
  const worldY = innerAreaY + gridYInTile * GRID_CELL_HEIGHT + GRID_CELL_HEIGHT / 2;
  return { x: worldX, y: worldY };
}

// Helper function to get bunker position in appropriate corner of building grid
function getBunkerCornerPosition(tileX, tileY, corner) {
  let gridOffsetX, gridOffsetY;
  switch(corner) {
    case 'top-left':
      gridOffsetX = 1; gridOffsetY = 1; break;
    case 'top-right':
      gridOffsetX = 2; gridOffsetY = 1; break;
    case 'bottom-left':
      gridOffsetX = 1; gridOffsetY = 2; break;
    case 'bottom-right':
      gridOffsetX = 2; gridOffsetY = 2; break;
  }
  const globalGridX = tileX * GRID_CELLS_PER_TILE + gridOffsetX;
  const globalGridY = tileY * GRID_CELLS_PER_TILE + gridOffsetY;
  return gridToWorld(globalGridX, globalGridY);
}

// Initialize game (legacy - for direct join)
function initializeGame() {
  gameState.gameObjects = [];
  gameState.players = JSON.parse(JSON.stringify(players));
  gameState.gameStartTime = Date.now();
  gameState.isGameRunning = true;

  // Helper function to get bunker position
  function getBunkerCornerPositionLocal(tileX, tileY, corner) {
    let gridOffsetX, gridOffsetY;
    switch(corner) {
      case 'top-left':
        gridOffsetX = 1; gridOffsetY = 1; break;
      case 'top-right':
        gridOffsetX = 2; gridOffsetY = 1; break;
      case 'bottom-left':
        gridOffsetX = 1; gridOffsetY = 2; break;
      case 'bottom-right':
        gridOffsetX = 2; gridOffsetY = 2; break;
    }
    const globalGridX = tileX * GRID_CELLS_PER_TILE + gridOffsetX;
    const globalGridY = tileY * GRID_CELLS_PER_TILE + gridOffsetY;
    return gridToWorld(globalGridX, globalGridY);
  }

  // Create bunkers and workers for each player
  // Team 1 (Red) - Top-left quadrant
  const bunker1Pos = getBunkerCornerPositionLocal(1, 0, 'top-left');
  gameState.gameObjects.push({
    id: 'bunker_1_' + Date.now(),
    type: 'bunker',
    x: bunker1Pos.x,
    y: bunker1Pos.y,
    playerId: 1,
    health: 500,
    maxHealth: 500,
    rallyPoint: { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 }
  });
  gameState.gameObjects.push({
    id: 'worker_1_' + Date.now(),
    type: 'worker',
    x: bunker1Pos.x + 113,
    y: bunker1Pos.y,
    playerId: 1,
    health: 100,
    maxHealth: 100
  });

  const bunker2Pos = getBunkerCornerPositionLocal(0, 1, 'top-left');
  gameState.gameObjects.push({
    id: 'bunker_2_' + Date.now(),
    type: 'bunker',
    x: bunker2Pos.x,
    y: bunker2Pos.y,
    playerId: 2,
    health: 500,
    maxHealth: 500,
    rallyPoint: { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 }
  });
  gameState.gameObjects.push({
    id: 'worker_2_' + Date.now(),
    type: 'worker',
    x: bunker2Pos.x + 113,
    y: bunker2Pos.y,
    playerId: 2,
    health: 100,
    maxHealth: 100
  });

  // Team 2 (Blue) - Top-right quadrant
  const bunker3Pos = getBunkerCornerPositionLocal(6, 0, 'top-right');
  gameState.gameObjects.push({
    id: 'bunker_3_' + Date.now(),
    type: 'bunker',
    x: bunker3Pos.x,
    y: bunker3Pos.y,
    playerId: 3,
    health: 500,
    maxHealth: 500,
    rallyPoint: { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 }
  });
  gameState.gameObjects.push({
    id: 'worker_3_' + Date.now(),
    type: 'worker',
    x: bunker3Pos.x - 113,
    y: bunker3Pos.y,
    playerId: 3,
    health: 100,
    maxHealth: 100
  });

  const bunker4Pos = getBunkerCornerPositionLocal(7, 1, 'top-right');
  gameState.gameObjects.push({
    id: 'bunker_4_' + Date.now(),
    type: 'bunker',
    x: bunker4Pos.x,
    y: bunker4Pos.y,
    playerId: 4,
    health: 500,
    maxHealth: 500,
    rallyPoint: { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 }
  });
  gameState.gameObjects.push({
    id: 'worker_4_' + Date.now(),
    type: 'worker',
    x: bunker4Pos.x - 113,
    y: bunker4Pos.y,
    playerId: 4,
    health: 100,
    maxHealth: 100
  });

  // Team 3 (Green) - Bottom-left quadrant
  const bunker5Pos = getBunkerCornerPositionLocal(1, 7, 'bottom-left');
  gameState.gameObjects.push({
    id: 'bunker_5_' + Date.now(),
    type: 'bunker',
    x: bunker5Pos.x,
    y: bunker5Pos.y,
    playerId: 5,
    health: 500,
    maxHealth: 500,
    rallyPoint: { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 }
  });
  gameState.gameObjects.push({
    id: 'worker_5_' + Date.now(),
    type: 'worker',
    x: bunker5Pos.x + 113,
    y: bunker5Pos.y,
    playerId: 5,
    health: 100,
    maxHealth: 100
  });

  const bunker6Pos = getBunkerCornerPositionLocal(0, 6, 'bottom-left');
  gameState.gameObjects.push({
    id: 'bunker_6_' + Date.now(),
    type: 'bunker',
    x: bunker6Pos.x,
    y: bunker6Pos.y,
    playerId: 6,
    health: 500,
    maxHealth: 500,
    rallyPoint: { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 }
  });
  gameState.gameObjects.push({
    id: 'worker_6_' + Date.now(),
    type: 'worker',
    x: bunker6Pos.x + 113,
    y: bunker6Pos.y,
    playerId: 6,
    health: 100,
    maxHealth: 100
  });

  // Team 4 (Brown) - Bottom-right quadrant
  const bunker7Pos = getBunkerCornerPositionLocal(6, 7, 'bottom-right');
  gameState.gameObjects.push({
    id: 'bunker_7_' + Date.now(),
    type: 'bunker',
    x: bunker7Pos.x,
    y: bunker7Pos.y,
    playerId: 7,
    health: 500,
    maxHealth: 500,
    rallyPoint: { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 }
  });
  gameState.gameObjects.push({
    id: 'worker_7_' + Date.now(),
    type: 'worker',
    x: bunker7Pos.x - 113,
    y: bunker7Pos.y,
    playerId: 7,
    health: 100,
    maxHealth: 100
  });

  const bunker8Pos = getBunkerCornerPositionLocal(7, 6, 'bottom-right');
  gameState.gameObjects.push({
    id: 'bunker_8_' + Date.now(),
    type: 'bunker',
    x: bunker8Pos.x,
    y: bunker8Pos.y,
    playerId: 8,
    health: 500,
    maxHealth: 500,
    rallyPoint: { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 }
  });
  gameState.gameObjects.push({
    id: 'worker_8_' + Date.now(),
    type: 'worker',
    x: bunker8Pos.x - 113,
    y: bunker8Pos.y,
    playerId: 8,
    health: 100,
    maxHealth: 100
  });
}

// Helper function to get team color based on team number
function getTeamColor(team, playerId) {
  const teamColors = {
    1: ['hsl(0, 75%, 65%)', 'hsl(0, 75%, 40%)'],      // Red team
    2: ['hsl(210, 75%, 65%)', 'hsl(210, 75%, 40%)'],  // Blue team
    3: ['hsl(120, 75%, 60%)', 'hsl(120, 75%, 35%)'],  // Green team
    4: ['hsl(30, 70%, 60%)', 'hsl(30, 70%, 35%)']     // Brown team
  };
  
  const colors = teamColors[team] || teamColors[1];
  // Use playerId to determine which shade (odd/even)
  return colors[playerId % 2];
}

// Helper function to get bunker position based on team
function getTeamBunkerPosition(team, playerIndex) {
  // playerIndex: 0 or 1 (first or second player on team)
  const teamPositions = {
    1: [
      { tileX: 1, tileY: 0, corner: 'top-left', offsetX: 113, offsetY: 0 },
      { tileX: 0, tileY: 1, corner: 'top-left', offsetX: 113, offsetY: 0 }
    ],
    2: [
      { tileX: 6, tileY: 0, corner: 'top-right', offsetX: -113, offsetY: 0 },
      { tileX: 7, tileY: 1, corner: 'top-right', offsetX: -113, offsetY: 0 }
    ],
    3: [
      { tileX: 1, tileY: 7, corner: 'bottom-left', offsetX: 113, offsetY: 0 },
      { tileX: 0, tileY: 6, corner: 'bottom-left', offsetX: 113, offsetY: 0 }
    ],
    4: [
      { tileX: 6, tileY: 7, corner: 'bottom-right', offsetX: -113, offsetY: 0 },
      { tileX: 7, tileY: 6, corner: 'bottom-right', offsetX: -113, offsetY: 0 }
    ]
  };
  
  return teamPositions[team]?.[playerIndex] || teamPositions[1][0];
}

// Initialize game with player assignments
function initializeGameWithAssignments(playerAssignments) {
  gameState.gameObjects = [];
  gameState.players = {};
  gameState.gameStartTime = Date.now();
  gameState.isGameRunning = true;

  // Group players by team
  const playersByTeam = {};
  playerAssignments.forEach((assignment, index) => {
    if (!playersByTeam[assignment.team]) {
      playersByTeam[assignment.team] = [];
    }
    playersByTeam[assignment.team].push({ ...assignment, index });
  });

  // Create players and their starting units
  playerAssignments.forEach(assignment => {
    const originalPlayer = players[assignment.playerId];
    if (originalPlayer) {
      gameState.players[assignment.playerId] = {
        ...originalPlayer,
        team: assignment.team,
        color: getTeamColor(assignment.team, assignment.playerId),
        supplyCap: maxSupplyCap,
        currentSupply: 0,
        resources: 50,
        killResourceScore: 0
      };
    }

    // Find player's position in their team
    const teamPlayers = playersByTeam[assignment.team];
    const playerIndexInTeam = teamPlayers.findIndex(p => p.playerId === assignment.playerId);
    
    // Get bunker position for this team and player
    const pos = getTeamBunkerPosition(assignment.team, playerIndexInTeam);
    const bunkerPos = getBunkerCornerPosition(pos.tileX, pos.tileY, pos.corner);
    
    // Create bunker
    gameState.gameObjects.push({
      id: `bunker_${assignment.playerId}_${Date.now()}`,
      type: 'bunker',
      x: bunkerPos.x,
      y: bunkerPos.y,
      playerId: assignment.playerId,
      health: 500,
      maxHealth: 500,
      rallyPoint: { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 }
    });
    
    // Create worker
    gameState.gameObjects.push({
      id: `worker_${assignment.playerId}_${Date.now()}`,
      type: 'worker',
      x: bunkerPos.x + pos.offsetX,
      y: bunkerPos.y + pos.offsetY,
      playerId: assignment.playerId,
      health: 100,
      maxHealth: 100,
      movementSpeed: 1.125,
      speed: 1.125,
      size: 30,
      targetX: bunkerPos.x + pos.offsetX,
      targetY: bunkerPos.y + pos.offsetY,
      commandState: 'idle'
    });
  });
}

// Broadcast queue update to all queued players
function broadcastQueueUpdate() {
  const queueData = queue.map((item, index) => ({
    socketId: item.socketId,
    playerId: item.playerId || index + 1
  }));
  
  queue.forEach(item => {
    item.socket.emit('queueUpdate', { players: queueData });
  });
}

// Start game when queue is full
function startGameFromQueue() {
  if (queue.length < QUEUE_SIZE_REQUIRED) return;
  
  // Randomly assign players to teams
  // For 2 players: randomly assign to 2 different teams
  const shuffled = [...queue].sort(() => Math.random() - 0.5);
  const teamAssignments = [];
  
  // Assign teams randomly
  const availableTeams = [1, 2, 3, 4];
  const shuffledTeams = [...availableTeams].sort(() => Math.random() - 0.5);
  
  shuffled.forEach((item, index) => {
    const team = shuffledTeams[index % shuffledTeams.length];
    const playerId = index + 1; // Assign player IDs 1, 2, etc.
    teamAssignments.push({ playerId, team });
    item.playerId = playerId;
    item.team = team;
  });
  
  // Initialize game with assignments
  initializeGameWithAssignments(teamAssignments);
  
  // Add players to connectedPlayers map and notify them
  queue.forEach((item, index) => {
    const assignment = teamAssignments[index];
    // Add to connected players
    connectedPlayers.set(item.socketId, { playerId: assignment.playerId, socket: item.socket });
    item.socket.playerId = assignment.playerId;
    
    // Send initial game state immediately
    item.socket.emit('gameStateUpdate', {
      gameObjects: gameState.gameObjects,
      players: gameState.players,
      gameTime: Date.now() - gameState.gameStartTime
    });
    
    // Notify player and redirect them
    item.socket.emit('gameStarting', {
      playerId: assignment.playerId,
      team: assignment.team
    });
  });
  
  // Clear queue
  queue.length = 0;
}

// Game loop (simplified - client handles most logic, server validates)
let lastUpdateTime = Date.now();
const UPDATE_RATE = 1000 / 60; // 60 FPS

setInterval(() => {
  if (!gameState.isGameRunning) return;

  const now = Date.now();
  const deltaTime = now - lastUpdateTime;
  lastUpdateTime = now;

  // Update resources (passive income)
  const resourceIncomeRate = 5; // Resources per second
  const resourceUpdateInterval = 1000;
  Object.keys(gameState.players).forEach(playerId => {
    const player = gameState.players[playerId];
    if (now - (player.lastResourceUpdate || gameState.gameStartTime) >= resourceUpdateInterval) {
      player.resources += resourceIncomeRate;
      player.lastResourceUpdate = now;
    }
  });

  // Update unit positions based on movement commands (simplified simulation)
  gameState.gameObjects.forEach(obj => {
    if (obj.type === 'worker' || obj.type === 'marine' || obj.type === 'reaper' || 
        obj.type === 'marauder' || obj.type === 'ghost') {
      // Ensure unit has speed property
      if (!obj.speed && obj.movementSpeed) {
        obj.speed = obj.movementSpeed;
      }
      if (!obj.speed) {
        obj.speed = 1.125; // Default speed
      }
      
      // Update position towards target if moving
      if (obj.commandState === 'moving' && obj.targetX !== undefined && obj.targetY !== undefined) {
        const dx = obj.targetX - obj.x;
        const dy = obj.targetY - obj.y;
        const distance = Math.hypot(dx, dy);
        const speed = obj.speed;
        
        if (distance > speed) {
          obj.x += (dx / distance) * speed;
          obj.y += (dy / distance) * speed;
        } else {
          obj.x = obj.targetX;
          obj.y = obj.targetY;
          obj.commandState = 'idle';
        }
      } else if (obj.commandState === 'attackMoving' && obj.aMoveTargetX !== undefined && obj.aMoveTargetY !== undefined) {
        const dx = obj.aMoveTargetX - obj.x;
        const dy = obj.aMoveTargetY - obj.y;
        const distance = Math.hypot(dx, dy);
        const speed = obj.speed;
        
        if (distance > speed) {
          obj.x += (dx / distance) * speed;
          obj.y += (dy / distance) * speed;
        } else {
          obj.x = obj.aMoveTargetX;
          obj.y = obj.aMoveTargetY;
        }
      }
    }
  });

  // Broadcast game state to all connected clients
  io.emit('gameStateUpdate', {
    gameObjects: gameState.gameObjects,
    players: gameState.players,
    gameTime: now - gameState.gameStartTime
  });
}, UPDATE_RATE);

// Socket.IO connection handling
io.on('connection', (socket) => {
  try {
    // Basic rate limiting by IP
    const clientIP = socket.handshake.address || socket.request.connection.remoteAddress;
    if (!checkRateLimit(clientIP)) {
      console.log(`Rate limit exceeded for IP: ${clientIP}`);
      socket.emit('error', { message: 'Rate limit exceeded. Please try again later.' });
      socket.disconnect(true);
      return;
    }

    console.log('Player connected:', socket.id, 'from IP:', clientIP);

  // Queue system handlers
  socket.on('joinQueue', () => {
    try {
      // Check if player is already in queue
      const alreadyInQueue = queue.some(item => item.socketId === socket.id);
      if (alreadyInQueue) {
        socket.emit('queueError', { message: 'Already in queue' });
        return;
      }

      // Add to queue
      queue.push({ socketId: socket.id, socket, playerId: null, team: null });
      console.log(`Player ${socket.id} joined queue. Queue size: ${queue.length}`);

      // Broadcast update
      broadcastQueueUpdate();

      // Check if we can start the game
      if (queue.length >= QUEUE_SIZE_REQUIRED) {
        setTimeout(() => {
          try {
            startGameFromQueue();
          } catch (error) {
            console.error('Error starting game from queue:', error);
          }
        }, 1000); // Small delay to ensure all clients are ready
      }
    } catch (error) {
      console.error('Error in joinQueue:', error);
      socket.emit('queueError', { message: 'Internal server error' });
    }
  });
  
  socket.on('leaveQueue', () => {
    const index = queue.findIndex(item => item.socketId === socket.id);
    if (index !== -1) {
      queue.splice(index, 1);
      console.log(`Player ${socket.id} left queue. Queue size: ${queue.length}`);
      broadcastQueueUpdate();
    }
  });

  socket.on('joinGame', (data) => {
    const requestedPlayerId = data.playerId;
    
    // Check if player ID is available
    if (requestedPlayerId >= 1 && requestedPlayerId <= 8) {
      // Check if this player ID is already taken
      let playerIdTaken = false;
      connectedPlayers.forEach((player, sid) => {
        if (player.playerId === requestedPlayerId && sid !== socket.id) {
          playerIdTaken = true;
        }
      });

      if (!playerIdTaken) {
        connectedPlayers.set(socket.id, { playerId: requestedPlayerId, socket });
        socket.playerId = requestedPlayerId;
        
        // Initialize game if first player
        if (!gameState.isGameRunning) {
          initializeGame();
        }

        // Send current game state to the new player
        socket.emit('gameStateUpdate', {
          gameObjects: gameState.gameObjects,
          players: gameState.players,
          gameTime: Date.now() - gameState.gameStartTime
        });

        socket.emit('joinSuccess', { playerId: requestedPlayerId });
        console.log(`Player ${requestedPlayerId} joined as socket ${socket.id}`);
      } else {
        socket.emit('joinError', { message: 'Player ID already taken' });
      }
    } else {
      socket.emit('joinError', { message: 'Invalid player ID' });
    }
  });

  // Handle player actions
  socket.on('playerAction', (action) => {
    try {
      if (!socket.playerId) return;

      // Validate action object
      if (!action || typeof action !== 'object' || !action.type) {
        socket.emit('error', { message: 'Invalid action format' });
        return;
      }

    const playerId = socket.playerId;

    // Validate and process action
    switch (action.type) {
      case 'moveUnits':
        // Find units and update their target positions
        action.unitIds.forEach(unitId => {
          const unit = gameState.gameObjects.find(obj => obj.id === unitId && obj.playerId === playerId);
          if (unit) {
            unit.targetX = action.x;
            unit.targetY = action.y;
            unit.commandState = 'moving';
          }
        });
        break;

      case 'attackMove':
        action.unitIds.forEach(unitId => {
          const unit = gameState.gameObjects.find(obj => obj.id === unitId && obj.playerId === playerId);
          if (unit) {
            unit.aMoveTargetX = action.x;
            unit.aMoveTargetY = action.y;
            unit.commandState = 'attackMoving';
          }
        });
        break;

      case 'attackUnit':
        action.unitIds.forEach(unitId => {
          const unit = gameState.gameObjects.find(obj => obj.id === unitId && obj.playerId === playerId);
          const target = gameState.gameObjects.find(obj => obj.id === action.targetId);
          if (unit && target) {
            unit.targetUnit = target.id;
            unit.commandState = 'attacking';
          }
        });
        break;

      case 'setRallyPoint':
        action.bunkerIds.forEach(bunkerId => {
          const bunker = gameState.gameObjects.find(obj => obj.id === bunkerId && obj.playerId === playerId && obj.type === 'bunker');
          if (bunker) {
            bunker.rallyPoint = { x: action.x, y: action.y };
          }
        });
        break;

      case 'buildBuilding':
        // Validate resources and placement
        const buildingCosts = {
          bunker: 500,
          supplyDepot: 150,
          shieldTower: 60,
          sensorTower: 50
        };
        const cost = buildingCosts[action.buildingType];
        const player = gameState.players[playerId];
        
        if (player && player.resources >= cost) {
          player.resources -= cost;
          // Building creation will be handled by client, server just validates
          // The client will send a 'buildingCreated' event after validation
        }
        break;

      case 'buildingCreated':
        // Add building to game state
        gameState.gameObjects.push(action.building);
        break;

      case 'upgrade':
        const upgradeBasePrice = 25;
        const upgradeLevel = gameState.players[playerId].upgrades?.[action.upgradeType] || 0;
        const price = upgradeBasePrice * (upgradeLevel + 1);
        const playerState = gameState.players[playerId];
        
        if (playerState && playerState.resources >= price) {
          playerState.resources -= price;
          if (!playerState.upgrades) playerState.upgrades = {};
          if (!playerState.upgrades[action.upgradeType]) playerState.upgrades[action.upgradeType] = 0;
          playerState.upgrades[action.upgradeType]++;
        }
        break;

      case 'unitSpawned':
        // Add spawned unit to game state
        if (action.unit) {
          // Ensure unit has movement speed and speed property
          if (!action.unit.movementSpeed) {
            action.unit.movementSpeed = 1.125; // Default movement speed
          }
          if (!action.unit.speed) {
            action.unit.speed = action.unit.movementSpeed || 1.125;
          }
          if (!action.unit.size) {
            // Default sizes based on type
            const defaultSizes = {
              'marine': 27,
              'reaper': 28,
              'marauder': 32,
              'ghost': 25,
              'worker': 30
            };
            action.unit.size = defaultSizes[action.unit.type] || 30;
          }
          gameState.gameObjects.push(action.unit);
          // Update player supply
          const spawnPlayer = gameState.players[playerId];
          if (spawnPlayer && action.unit.supplyCost) {
            spawnPlayer.currentSupply += action.unit.supplyCost;
          }
        }
        break;

      case 'chatMessage':
        // Broadcast chat message to all players (or team if team chat)
        if (action.isTeamChat) {
          // Send to same team only
          const senderTeam = gameState.players[playerId]?.team;
          connectedPlayers.forEach((player, sid) => {
            const playerTeam = gameState.players[player.playerId]?.team;
            if (playerTeam === senderTeam) {
              player.socket.emit('chatMessage', {
                playerId: playerId,
                message: action.message,
                isTeamChat: true
              });
            }
          });
        } else {
          // Send to all players
          io.emit('chatMessage', {
            playerId: playerId,
            message: action.message,
            isTeamChat: false
          });
        }
        return; // Don't broadcast action for chat
    }

      // Broadcast action to all clients (for validation and synchronization)
      socket.broadcast.emit('playerAction', { ...action, playerId });
    } catch (error) {
      console.error('Error in playerAction:', error);
      socket.emit('error', { message: 'Internal server error' });
    }
  });

  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);

    try {
      // Get player info before deletion
      const playerInfo = connectedPlayers.get(socket.id);

      // Remove from connected players
      connectedPlayers.delete(socket.id);

      // Remove from queue if present
      const queueIndex = queue.findIndex(item => item.socketId === socket.id);
      if (queueIndex !== -1) {
        queue.splice(queueIndex, 1);
        console.log(`Player ${socket.id} removed from queue. Queue size: ${queue.length}`);
        broadcastQueueUpdate();
      }

      // Clean up game state if player was in a game
      if (playerInfo && playerInfo.playerId) {
        // Remove any units owned by this player if game is running
        if (gameState.isGameRunning) {
          const initialUnitCount = gameState.gameObjects.length;
          gameState.gameObjects = gameState.gameObjects.filter(obj =>
            !obj.playerId || obj.playerId !== playerInfo.playerId
          );
          const removedCount = initialUnitCount - gameState.gameObjects.length;
          if (removedCount > 0) {
            console.log(`Cleaned up ${removedCount} units for disconnected player ${playerInfo.playerId}`);
          }
        }

        // Remove player from gameState.players if they exist
        if (gameState.players[playerInfo.playerId]) {
          delete gameState.players[playerInfo.playerId];
          console.log(`Removed player ${playerInfo.playerId} from game state`);
        }
      }

      console.log(`Total connected players: ${connectedPlayers.size}`);
    } catch (error) {
      console.error('Error during disconnect cleanup:', error);
    }
  });

  } catch (error) {
    console.error('Error in socket connection handler:', error);
    socket.emit('error', { message: 'Internal server error' });
    socket.disconnect(true);
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  const isProduction = process.env.NODE_ENV === 'production';
  console.log(`🚀 Multiplayer server running on port ${PORT}`);
  console.log(`🌍 Environment: ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);

  if (isProduction) {
    console.log(`✅ Server ready for production deployment`);
    console.log(`📊 Connected players: ${connectedPlayers.size}`);
    console.log(`🎮 Game status: ${gameState.isGameRunning ? 'Running' : 'Waiting'}`);
  } else {
    console.log(`🧪 Open http://localhost:${PORT} to play locally`);
  }
});

