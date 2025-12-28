// Configuration for Farmer's Fright Multiplayer
const config = {
    // Server URL - works for both server and client environments
    SERVER_URL: (typeof process !== 'undefined' && process.env && process.env.SERVER_URL)
        ? process.env.SERVER_URL
        : (typeof window !== 'undefined' && window.SERVER_URL)
        ? window.SERVER_URL
        : 'http://localhost:3000'
};

// Make config available globally
window.gameConfig = config;
