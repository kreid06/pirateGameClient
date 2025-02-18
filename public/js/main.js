import { GameClient } from './core/gameClient.js';

window.addEventListener('DOMContentLoaded', async () => {
    console.log('[Main] Starting game in local test mode');
    const game = new GameClient();
    await game.init();  // Wait for initialization
    
    // Hide login form and show game canvas
    const loginForm = document.getElementById('loginForm');
    const gameCanvas = document.getElementById('gameCanvas');
    const coordinates = document.getElementById('coordinates');
    
    if (loginForm) loginForm.classList.add('hidden');
    if (gameCanvas) gameCanvas.classList.remove('hidden');
    if (coordinates) coordinates.classList.remove('hidden');
});
