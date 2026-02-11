const socket = io();
let playerName = "Player", myTotalScore = 0, partnerTotalScore = 0;
let partnerName = "Partner";
let roundStartTime = 0, count = 0, actualBirdCount = 0, currentRound = 1;
const totalRounds = 5;

// --- AUDIO POOLING (Fixes silence after Round 1) ---
const soundFiles = {
    tap: 'https://assets.mixkit.co/active_storage/sfx/2585/2585-preview.mp3',
    lock: 'https://assets.mixkit.co/active_storage/sfx/93/93-preview.mp3',
    partnerLock: 'https://assets.mixkit.co/active_storage/sfx/94/94-preview.mp3',
    reveal: 'https://assets.mixkit.co/active_storage/sfx/2364/2364-preview.mp3',
    correct: 'https://assets.mixkit.co/active_storage/sfx/2870/2870-preview.mp3',
    wrong: 'https://assets.mixkit.co/active_storage/sfx/2876/2876-preview.mp3',
    swish: 'https://assets.mixkit.co/active_storage/sfx/756/756-preview.mp3',
    victory: 'https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3'
};

function playSound(type) {
    const audio = new Audio(soundFiles[type]);
    audio.play().catch(e => {});
}

function triggerHaptic(type) {
    // iPhone won't vibrate if "Low Power Mode" is on or if "Haptics" are off in System Settings
    if (!navigator.vibrate) return;
    if (type === 'light') navigator.vibrate(20);
    if (type === 'medium') navigator.vibrate(45);
    if (type === 'success') navigator.vibrate([30, 50, 30]);
    if (type === 'error') navigator.vibrate([60, 100, 60]);
}

function unlockAudioAndHaptics() {
    triggerHaptic('light'); // Crucial: "Blesses" haptics on iOS
    Object.values(soundFiles).forEach(url => {
        const a = new Audio(url);
        a.muted = true;
        a.play().then(() => { a.pause(); a.currentTime = 0; });
    });
}

// --- SOCKET LISTENERS ---

socket.on('startGame', (gameData) => {
    actualBirdCount = gameData.birdCount;
    currentRound = 1;
    startBirdsSequence(gameData);
});

socket.on('partnerUpdate', (data) => {
    partnerName = data.name;
    const label = document.querySelector('.label'); 
    if (label) label.innerText = partnerName.toUpperCase();
    const oppDisplay = document.getElementById('opponent-counter');
    if (oppDisplay) oppDisplay.innerText = data.count < 10 ? "0" + data.count : data.count;
});

socket.on('partnerLockedIn', () => {
    playSound('partnerLock');
    const oppDisplay = document.getElementById('opponent-counter');
    oppDisplay.innerText = "OK";
    oppDisplay.style.color = "#7b61ff";
});

socket.on('startReveal', (calculatedScores) => {
    runRevealSequence(calculatedScores);
});

socket.on('nextRoundData', (gameData) => {
    currentRound = gameData.round;
    actualBirdCount = gameData.birdCount;
    renderNewRound(gameData);
});

// Listener for the server-controlled Game Over
socket.on('gameOver', () => {
    showResults();
});

// --- UI EVENT LISTENERS ---

document.getElementById('name-submit-btn').addEventListener('click', () => {
    unlockAudioAndHaptics();
    const input = document.getElementById('player-name-input').value;
    
    // Get room from URL (e.g., #lobby123) or default to 'global'
    const roomName = window.location.hash.substring(1) || 'default-room';

    if(input) {
        playerName = input;
        // Send both name and room to server
        socket.emit('joinGame', { name: playerName, room: roomName });
        
        // Show the room name in the UI so they can share it
        document.getElementById('instruction').innerText = `ROOM: ${roomName}`;
    }
    
    document.getElementById('name-screen').classList.add('hidden');
    document.getElementById('menu-screen').classList.remove('hidden');
});

document.getElementById('start-birds-btn').addEventListener('click', () => {
    triggerHaptic('medium'); 
    socket.emit('playerReady');
    document.getElementById('menu-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
});

// --- GAME LOGIC ---

async function startBirdsSequence(gameData) {
    const instr = document.getElementById('instruction');
    myTotalScore = 0; partnerTotalScore = 0; 
    
    for(let i=3; i>0; i--) {
        instr.innerText = `READY... ${i}`;
        playSound('tap');
        triggerHaptic('light'); 
        await new Promise(r => setTimeout(r, 800));
    }
    renderNewRound(gameData);
}

function renderNewRound(gameData) {
    playSound('swish');
    count = 0;
    updateCounter();
    
    // UI Resets
    const oppDisplay = document.getElementById('opponent-counter');
    oppDisplay.innerText = "00";
    oppDisplay.style.color = "#4bffb4";
    document.getElementById('my-counter').style.color = "#333";
    document.getElementById('instruction').innerText = `ROUND ${currentRound}`;
    
    // Fix: Ensure buttons reappear and are clickable again
    const btnRow = document.querySelector('.button-row');
    const lockBtn = document.getElementById('lock-btn');
    btnRow.classList.remove('fade-out');
    lockBtn.classList.remove('fade-out');
    btnRow.style.pointerEvents = "auto";
    lockBtn.style.pointerEvents = "auto";
    
    const playArea = document.getElementById('play-area');
    playArea.innerHTML = "";
    
    for(let i=0; i < (gameData.birdCount + gameData.decoyCount); i++) {
        const isBird = i < gameData.birdCount;
        const el = document.createElement('div');
        el.className = 'game-object';
        el.innerText = isBird ? (Math.random() > 0.5 ? "🐦" : "🐤") : "🍎";
        if (currentRound > 3) el.style.fontSize = "38px";
        el.style.left = gameData.spots[i].x + "%";
        el.style.top = gameData.spots[i].y + "%";
        el.setAttribute('data-type', isBird ? 'bird' : 'decoy');
        playArea.appendChild(el);
    }
    roundStartTime = Date.now();
}

document.getElementById('plus-btn').addEventListener('touchstart', (e) => {
    e.preventDefault(); 
    count++; 
    updateCounter(); 
    triggerHaptic('light'); 
    playSound('tap');
    socket.emit('updateCount', count);
});

document.getElementById('minus-btn').addEventListener('touchstart', (e) => {
    e.preventDefault(); 
    if(count > 0) count--; 
    updateCounter(); 
    triggerHaptic('light');
    playSound('tap');
    socket.emit('updateCount', count);
});

function updateCounter() { document.getElementById('my-counter').innerText = count < 10 ? "0" + count : count; }

document.getElementById('lock-btn').addEventListener('click', () => {
    const timeTaken = (Date.now() - roundStartTime) / 1000;
    
    // Disable interaction IMMEDIATELY
    const btnRow = document.querySelector('.button-row');
    const lockBtn = document.getElementById('lock-btn');
    
    btnRow.style.pointerEvents = "none"; 
    lockBtn.style.pointerEvents = "none";
    btnRow.classList.add('fade-out');
    lockBtn.classList.add('fade-out');

    socket.emit('lockIn', { count, timeTaken, actualBirds: actualBirdCount });
    playSound('lock');
    triggerHaptic('medium');
    
    document.getElementById('instruction').innerText = "WAITING FOR PARTNER...";
});

async function runRevealSequence(calculatedScores) {
    const birds = document.querySelectorAll('.game-object[data-type="bird"]');
    let r = 0;
    const revealSpeed = actualBirdCount > 15 ? 150 : 300;

    // 1. Reveal the birds one by one
    for(let b of birds) {
        r++; 
        b.innerText = r; 
        b.style.color = "#ff4b4b"; 
        b.style.fontWeight = "bold";
        playSound('reveal');
        triggerHaptic('light'); 
        await new Promise(res => setTimeout(res, revealSpeed));
    }
    
    // 2. Identify Player vs Partner Data
    const myData = calculatedScores[socket.id];
    let partnerId = Object.keys(calculatedScores).find(id => id !== socket.id);
    let partnerData = calculatedScores[partnerId];

    myTotalScore = myData.totalScore;
    partnerTotalScore = partnerData ? partnerData.totalScore : 0;

    // 3. Update the UI to show the truth
    // Show the actual correct answer in the top bar
    document.getElementById('instruction').innerText = `ACTUAL: ${actualBirdCount}`;
    document.getElementById('instruction').style.color = "#ff4b4b";

    // Keep partner's guess visible in their counter (don't overwrite with actual)
    const oppDisplay = document.getElementById('opponent-counter');
    if (partnerData) {
        // We need the server to send the partner's original guess 'count' too.
        // For now, let's assume the server includes 'originalCount' in the score object.
        oppDisplay.innerText = partnerData.originalCount !== undefined ? partnerData.originalCount : "??";
    }

    if(myData.isPerfect) { 
        playSound('correct'); 
        triggerHaptic('success'); 
    } else { 
        playSound('wrong'); 
        triggerHaptic('error'); 
    }
    
    document.getElementById('my-counter').style.color = myData.isPerfect ? "#2ecc71" : "#e74c3c";
}

function showResults() {
    document.getElementById('game-screen').classList.add('hidden');
    document.getElementById('results-screen').classList.remove('hidden');
    document.getElementById('res-my-name').innerText = playerName;
    document.getElementById('res-my-score').innerText = myTotalScore;
    document.getElementById('res-partner-name').innerText = partnerName;
    document.getElementById('res-partner-score').innerText = partnerTotalScore;
    
    const winMsg = document.getElementById('winner-announcement');
    if(myTotalScore >= partnerTotalScore) {
        winMsg.innerText = `${playerName.toUpperCase()} WINS!`;
        playSound('victory');
        triggerHaptic('success');
    } else {
        winMsg.innerText = `${partnerName.toUpperCase()} WINS!`;
        triggerHaptic('error');
    }
}