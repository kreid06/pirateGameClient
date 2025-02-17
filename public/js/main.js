import { GameClient } from './core/gameClient.js';

window.addEventListener('DOMContentLoaded', () => {
    console.log('[Main] Starting game in local test mode');
    window.game = new GameClient();
    
    // Hide login form and show game canvas immediately
    const loginForm = document.getElementById('loginForm');
    const gameCanvas = document.getElementById('gameCanvas');
    const coordinates = document.getElementById('coordinates');
    
    if (loginForm) loginForm.classList.add('hidden');
    if (gameCanvas) gameCanvas.classList.remove('hidden');
    if (coordinates) coordinates.classList.remove('hidden');
});
