// Configuration for Farmer's Fright Multiplayer
const config = {
    // Default server URL - can be overridden by environment variable
    SERVER_URL: process.env.SERVER_URL || 'http://localhost:3000',

    // For production, set SERVER_URL environment variable
    // Example: https://your-server-deployment-url.com
};

// Make config available globally
window.gameConfig = config;
