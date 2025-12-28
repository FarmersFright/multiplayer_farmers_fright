// Multiplayer Client Module
class MultiplayerClient {
    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.playerId = null;
        this.isMultiplayerMode = false;
        this.lastStateUpdate = null;
        this.pendingActions = [];
    }

    connect(serverUrl = null) {
        // Use provided serverUrl, or config default, or localhost as fallback
        const defaultServerUrl = (window.gameConfig && window.gameConfig.SERVER_URL) || 'http://localhost:3000';
        serverUrl = serverUrl || defaultServerUrl;
        if (typeof io === 'undefined') {
            console.error('Socket.IO not loaded. Make sure to include socket.io.js before this script.');
            return false;
        }

        this.socket = io(serverUrl);
        this.isMultiplayerMode = true;

        this.socket.on('connect', () => {
            console.log('Connected to multiplayer server');
            this.isConnected = true;
            
        // Get player ID and team from URL parameters (set by queue system)
        const urlParams = new URLSearchParams(window.location.search);
        const requestedPlayerId = parseInt(urlParams.get('playerId'));
        const assignedTeam = parseInt(urlParams.get('team'));
        
        if (requestedPlayerId && assignedTeam) {
            // Coming from queue - player ID and team are already assigned
            this.playerId = requestedPlayerId;
            currentPlayerId = requestedPlayerId;
            
            // Update player team in local state
            if (players[requestedPlayerId]) {
                players[requestedPlayerId].team = assignedTeam;
                players[requestedPlayerId].color = this.getTeamColor(assignedTeam, requestedPlayerId);
            }
            
            // Join game with assigned player ID
            this.socket.emit('joinGame', { playerId: requestedPlayerId });
        } else {
            // Direct join - use requested or default player ID
            const playerId = requestedPlayerId || currentPlayerId || 1;
            this.socket.emit('joinGame', { playerId: playerId });
        }
        });

        this.socket.on('connect_error', (error) => {
            console.error('Connection error:', error);
            this.isConnected = false;
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.isConnected = false;
        });

        this.socket.on('joinSuccess', (data) => {
            console.log('Successfully joined game as Player', data.playerId);
            this.playerId = data.playerId;
            currentPlayerId = data.playerId;
            
            // Show connection status
            this.showConnectionStatus(true);
        });

        this.socket.on('joinError', (data) => {
            console.error('Failed to join game:', data.message);
            alert('Failed to join game: ' + data.message);
            this.showConnectionStatus(false);
        });

        this.socket.on('gameStateUpdate', (state) => {
            this.lastStateUpdate = state;
            this.applyGameState(state);
        });

        this.socket.on('playerAction', (action) => {
            // Handle actions from other players
            if (action.type === 'chatMessage') {
                // Handle chat messages
                if (window.chatSystem) {
                    const message = {
                        id: Date.now() + Math.random(),
                        text: action.message,
                        senderId: action.playerId,
                        senderName: `Player ${action.playerId}`,
                        isTeamChat: action.isTeamChat,
                        timestamp: Date.now()
                    };
                    window.chatSystem.receiveMessage(message);
                }
            }
            this.handleRemoteAction(action);
        });
        
        this.socket.on('chatMessage', (data) => {
            // Handle chat messages from server
            if (window.chatSystem) {
                const message = {
                    id: Date.now() + Math.random(),
                    text: data.message,
                    senderId: data.playerId,
                    senderName: `Player ${data.playerId}`,
                    isTeamChat: data.isTeamChat,
                    timestamp: Date.now()
                };
                window.chatSystem.receiveMessage(message);
            }
        });

        return true;
    }

    showConnectionStatus(connected) {
        // Create or update connection status indicator
        let statusEl = document.getElementById('multiplayer-status');
        if (!statusEl) {
            statusEl = document.createElement('div');
            statusEl.id = 'multiplayer-status';
            statusEl.style.cssText = 'position: fixed; top: 10px; right: 10px; padding: 10px; background: rgba(0,0,0,0.7); color: white; z-index: 10000; border-radius: 5px;';
            document.body.appendChild(statusEl);
        }
        
        if (connected) {
            statusEl.textContent = `Multiplayer: Connected (Player ${this.playerId})`;
            statusEl.style.color = '#2ecc71';
        } else {
            statusEl.textContent = 'Multiplayer: Disconnected';
            statusEl.style.color = '#e74c3c';
        }
    }

    applyGameState(state) {
        if (!state || !state.gameObjects) return;

        // Initialize fog of war if not already done
        if (!fogOfWar && typeof FogOfWar !== 'undefined') {
            fogOfWar = new FogOfWar();
        }

        // Update game objects from server state
        const serverObjectMap = new Map();
        state.gameObjects.forEach(obj => {
            serverObjectMap.set(obj.id, obj);
        });

        // Create or update game objects
        state.gameObjects.forEach(serverObj => {
            let localObj = gameObjects.find(obj => obj.id === serverObj.id);
            
            if (!localObj) {
                // Create new object from server data using proper class constructors
                if (serverObj.type === 'bunker') {
                    localObj = new Bunker(serverObj.x, serverObj.y, serverObj.playerId, false);
                    localObj.id = serverObj.id; // Preserve server ID
                } else if (serverObj.type === 'worker') {
                    localObj = new Worker(serverObj.x, serverObj.y, serverObj.playerId);
                    localObj.id = serverObj.id;
                } else if (serverObj.type === 'marine') {
                    localObj = new Marine(serverObj.x, serverObj.y, serverObj.playerId);
                    localObj.id = serverObj.id;
                } else if (serverObj.type === 'reaper') {
                    localObj = new Reaper(serverObj.x, serverObj.y, serverObj.playerId);
                    localObj.id = serverObj.id;
                } else if (serverObj.type === 'marauder') {
                    localObj = new Marauder(serverObj.x, serverObj.y, serverObj.playerId);
                    localObj.id = serverObj.id;
                } else if (serverObj.type === 'ghost') {
                    localObj = new Ghost(serverObj.x, serverObj.y, serverObj.playerId);
                    localObj.id = serverObj.id;
                } else if (serverObj.type === 'supplyDepot') {
                    localObj = new SupplyDepot(serverObj.x, serverObj.y, serverObj.playerId, false);
                    localObj.id = serverObj.id;
                } else if (serverObj.type === 'shieldTower') {
                    localObj = new ShieldTower(serverObj.x, serverObj.y, serverObj.playerId, false);
                    localObj.id = serverObj.id;
                } else if (serverObj.type === 'sensorTower') {
                    localObj = new SensorTower(serverObj.x, serverObj.y, serverObj.playerId, false);
                    localObj.id = serverObj.id;
                } else {
                    // Fallback: create plain object
                    localObj = { ...serverObj };
                }
                
                if (localObj) {
                    gameObjects.push(localObj);
                }
            }
            
            // Update object properties from server
            if (localObj) {
                // For units, only update position if it's significantly different (to allow smooth movement)
                // For buildings, always update position
                if (localObj.type === 'bunker' || localObj.type === 'supplyDepot' || 
                    localObj.type === 'shieldTower' || localObj.type === 'sensorTower') {
                    localObj.x = serverObj.x;
                    localObj.y = serverObj.y;
                } else {
                    // For units: only sync positions for OTHER players' units
                    // Let the client handle movement for own units to prevent stuttering
                    if (localObj.playerId !== this.playerId) {
                        // For other players' units, interpolate position smoothly
                        const posDiff = Math.hypot(localObj.x - serverObj.x, localObj.y - serverObj.y);
                        if (posDiff > 5) {
                            // Smooth interpolation towards server position
                            const lerpFactor = 0.15; // 15% towards server position per frame (smooth)
                            localObj.x += (serverObj.x - localObj.x) * lerpFactor;
                            localObj.y += (serverObj.y - localObj.y) * lerpFactor;
                        } else {
                            // Close enough, snap to position
                            localObj.x = serverObj.x;
                            localObj.y = serverObj.y;
                        }
                    }
                    // For own units, NEVER sync position from server - client handles it completely
                    // This prevents stuttering from server overriding client movement
                }
                
                // Update target positions for movement commands
                if (serverObj.targetX !== undefined) localObj.targetX = serverObj.targetX;
                if (serverObj.targetY !== undefined) localObj.targetY = serverObj.targetY;
                if (serverObj.aMoveTargetX !== undefined) localObj.aMoveTargetX = serverObj.aMoveTargetX;
                if (serverObj.aMoveTargetY !== undefined) localObj.aMoveTargetY = serverObj.aMoveTargetY;
                if (serverObj.commandState !== undefined) {
                    // Only update command state if it's not our own unit, or if it's a new command
                    if (localObj.playerId !== this.playerId || 
                        (serverObj.commandState !== 'moving' && serverObj.commandState !== 'attackMoving')) {
                        localObj.commandState = serverObj.commandState;
                    }
                }
                // Resolve targetUnit from ID to object reference
                if (serverObj.targetUnit !== undefined) {
                    if (serverObj.targetUnit === null || serverObj.targetUnit === '') {
                        localObj.targetUnit = null;
                    } else {
                        // targetUnit from server is an ID string, need to find the actual object
                        const targetObj = gameObjects.find(obj => obj.id === serverObj.targetUnit);
                        if (targetObj && targetObj.health > 0) {
                            localObj.targetUnit = targetObj;
                        } else {
                            localObj.targetUnit = null;
                            // Clear attacking state if target no longer exists
                            if (localObj.commandState === 'attacking') {
                                localObj.commandState = 'idle';
                            }
                        }
                    }
                }
                
                // Update speed and movement speed
                if (serverObj.speed !== undefined) localObj.speed = serverObj.speed;
                if (serverObj.movementSpeed !== undefined) {
                    localObj.movementSpeed = serverObj.movementSpeed;
                    if (!localObj.speed) localObj.speed = serverObj.movementSpeed;
                }
                if (serverObj.size !== undefined) localObj.size = serverObj.size;
                
                // Update health
                if (serverObj.health !== undefined) localObj.health = serverObj.health;
                if (serverObj.maxHealth !== undefined) localObj.maxHealth = serverObj.maxHealth;
                
                // Update rally point for bunkers - ensure it's always a valid object
                if (serverObj.rallyPoint) {
                    if (typeof serverObj.rallyPoint === 'object' && 
                        typeof serverObj.rallyPoint.x === 'number' && 
                        typeof serverObj.rallyPoint.y === 'number') {
                        localObj.rallyPoint = serverObj.rallyPoint;
                    } else {
                        // Fallback to center of map if rally point is invalid
                        localObj.rallyPoint = { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 };
                    }
                } else if (localObj.type === 'bunker' && !localObj.rallyPoint) {
                    // Ensure bunkers always have a rally point
                    localObj.rallyPoint = { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 };
                }
                
                // Update construction state
                if (serverObj.isUnderConstruction !== undefined) {
                    localObj.isUnderConstruction = serverObj.isUnderConstruction;
                }
                if (serverObj.constructionProgress !== undefined) {
                    localObj.constructionProgress = serverObj.constructionProgress;
                }
                
                // Update grid positions for buildings
                if (serverObj.gridX !== undefined) localObj.gridX = serverObj.gridX;
                if (serverObj.gridY !== undefined) localObj.gridY = serverObj.gridY;
                if (serverObj.gridWidth !== undefined) localObj.gridWidth = serverObj.gridWidth;
                if (serverObj.gridHeight !== undefined) localObj.gridHeight = serverObj.gridHeight;
            }
        });

        // Remove objects that no longer exist on server
        for (let i = gameObjects.length - 1; i >= 0; i--) {
            const obj = gameObjects[i];
            if (!serverObjectMap.has(obj.id)) {
                gameObjects.splice(i, 1);
            }
        }

        // Update player states
        if (state.players) {
            Object.keys(state.players).forEach(playerId => {
                const playerIdNum = parseInt(playerId);
                if (players[playerIdNum]) {
                    const serverPlayer = state.players[playerId];
                    players[playerIdNum].resources = serverPlayer.resources;
                    players[playerIdNum].currentSupply = serverPlayer.currentSupply;
                    players[playerIdNum].supplyCap = serverPlayer.supplyCap;
                    players[playerIdNum].killResourceScore = serverPlayer.killResourceScore;
                    if (serverPlayer.team !== undefined) {
                        players[playerIdNum].team = serverPlayer.team;
                    }
                    if (serverPlayer.color) {
                        players[playerIdNum].color = serverPlayer.color;
                    }
                    if (serverPlayer.upgrades) {
                        players[playerIdNum].upgrades = serverPlayer.upgrades;
                    }
                } else {
                    // Create new player entry if it doesn't exist
                    players[playerIdNum] = { ...serverPlayer };
                }
            });
        }

        // Initialize UI if this is the first state update
        if (this.firstStateReceived === undefined) {
            this.firstStateReceived = true;
            // Switch to the assigned player
            if (this.playerId && typeof switchPlayer === 'function') {
                switchPlayer(this.playerId);
            }
            // Update displays
            if (typeof updateResourceSupplyDisplay === 'function') {
                updateResourceSupplyDisplay();
            }
            if (typeof updateScoreboard === 'function') {
                updateScoreboard(players);
            }
        } else {
            // Update resource/supply display
            if (typeof updateResourceSupplyDisplay === 'function') {
                updateResourceSupplyDisplay();
            }
        }
    }

    handleRemoteAction(action) {
        // Handle actions from other players
        // Most actions are already reflected in game state updates
        // This is mainly for immediate visual feedback if needed
    }

    sendAction(action) {
        if (!this.isConnected || !this.socket) {
            // Store action for when connection is restored
            this.pendingActions.push(action);
            return false;
        }

        // Add player ID to action
        action.playerId = this.playerId;

        this.socket.emit('playerAction', action);
        return true;
    }

    sendMoveCommand(unitIds, x, y) {
        return this.sendAction({
            type: 'moveUnits',
            unitIds: unitIds,
            x: x,
            y: y
        });
    }

    sendAttackMoveCommand(unitIds, x, y) {
        return this.sendAction({
            type: 'attackMove',
            unitIds: unitIds,
            x: x,
            y: y
        });
    }

    sendAttackCommand(unitIds, targetId) {
        return this.sendAction({
            type: 'attackUnit',
            unitIds: unitIds,
            targetId: targetId
        });
    }

    sendRallyPointCommand(bunkerIds, x, y) {
        return this.sendAction({
            type: 'setRallyPoint',
            bunkerIds: bunkerIds,
            x: x,
            y: y
        });
    }

    sendBuildingCommand(buildingType, x, y, gridX, gridY) {
        return this.sendAction({
            type: 'buildBuilding',
            buildingType: buildingType,
            x: x,
            y: y,
            gridX: gridX,
            gridY: gridY
        });
    }

    sendBuildingCreated(building) {
        return this.sendAction({
            type: 'buildingCreated',
            building: building
        });
    }

    sendUpgradeCommand(upgradeType) {
        return this.sendAction({
            type: 'upgrade',
            upgradeType: upgradeType
        });
    }

    getTeamColor(team, playerId) {
        const teamColors = {
            1: ['hsl(0, 75%, 65%)', 'hsl(0, 75%, 40%)'],      // Red team
            2: ['hsl(210, 75%, 65%)', 'hsl(210, 75%, 40%)'],  // Blue team
            3: ['hsl(120, 75%, 60%)', 'hsl(120, 75%, 35%)'],  // Green team
            4: ['hsl(30, 70%, 60%)', 'hsl(30, 70%, 35%)']     // Brown team
        };
        
        const colors = teamColors[team] || teamColors[1];
        return colors[playerId % 2];
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        this.isConnected = false;
        this.isMultiplayerMode = false;
    }
}

// Create global multiplayer client instance
window.multiplayerClient = new MultiplayerClient();

