const socket = io();
let playerName = "Player", myTotalScore = 0, partnerTotalScore = 0;
let partnerName = "Partner";
let roundStartTime = 0, count = 0, actualTargetCount = 0, currentRound = 1;
let lastBoxScene = null;
let lastBoxData = null; // This stores the cube array for the reveal

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

function playSound(type) { new Audio(soundFiles[type]).play().catch(e => {}); }
function triggerHaptic(t) { if(navigator.vibrate) navigator.vibrate(t==='light'?20:t==='medium'?45:t==='success'?[30,50,30]:[60,100,60]); }

function unlockAudioAndHaptics() {
    triggerHaptic('light');
    Object.values(soundFiles).forEach(url => {
        const a = new Audio(url); a.muted = true;
        a.play().then(() => { a.pause(); a.currentTime = 0; });
    });
}

// --- SOCKET LISTENERS ---

socket.on('startGame', (gameData) => {
    currentRound = 1;
    myTotalScore = 0; partnerTotalScore = 0;
    startSequence(gameData);
});

socket.on('nextRoundData', (gameData) => {
    currentRound = gameData.round;
    renderNewRound(gameData);
});

socket.on('partnerUpdate', (data) => {
    partnerName = data.name;
    document.querySelector('.label').innerText = partnerName.toUpperCase();
    const opp = document.getElementById('opponent-counter');
    opp.innerText = data.count < 10 ? "0" + data.count : data.count;
});

socket.on('partnerLockedIn', () => {
    playSound('partnerLock');
    const opp = document.getElementById('opponent-counter');
    opp.innerText = "OK";
    opp.style.color = "#7b61ff";
});

socket.on('startReveal', (calculatedScores) => { runRevealSequence(calculatedScores); });
socket.on('gameOver', () => { showResults(); });

// --- UI EVENTS ---

document.getElementById('name-submit-btn').addEventListener('click', () => {
    unlockAudioAndHaptics();
    const input = document.getElementById('player-name-input').value;
    const roomName = window.location.hash.substring(1) || 'default-room';
    if(input) {
        playerName = input;
        socket.emit('joinGame', { name: playerName, room: roomName });
        document.getElementById('instruction').innerText = `ROOM: ${roomName}`;
    }
    document.getElementById('name-screen').classList.add('hidden');
    document.getElementById('menu-screen').classList.remove('hidden');
});

document.getElementById('start-birds-btn').addEventListener('click', () => {
    socket.emit('playerReady', 'birds');
    document.getElementById('menu-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
});

document.getElementById('start-boxes-btn').addEventListener('click', () => {
    socket.emit('playerReady', 'boxes');
    document.getElementById('menu-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
});

// --- GAME LOGIC ---

async function startSequence(gameData) {
    const instr = document.getElementById('instruction');
    for(let i=3; i>0; i--) {
        instr.innerText = `READY... ${i}`;
        playSound('tap'); triggerHaptic('light');
        await new Promise(r => setTimeout(r, 800));
    }
    renderNewRound(gameData);
}

function renderNewRound(gameData) {
    playSound('swish');
    count = 0;
    updateCounter();
    actualTargetCount = gameData.gameType === 'boxes' ? gameData.cubeCount : gameData.birdCount;

    const playArea = document.getElementById('play-area');
    playArea.innerHTML = "";
    playArea.classList.remove('isometric-view');
    
    // UI RESET
    const opp = document.getElementById('opponent-counter');
    opp.innerText = "00"; opp.style.color = "#4bffb4";
    document.getElementById('my-counter').style.color = "#333";
    document.getElementById('instruction').innerText = `ROUND ${currentRound}`;
    toggleControls(true);

    if (gameData.gameType === 'birds') {
        renderBirds(gameData, playArea);
    } else {
        renderBoxes(gameData, playArea);
    }
}

function renderBirds(gameData, playArea) {
    for(let i=0; i < (gameData.birdCount + gameData.decoyCount); i++) {
        const isBird = i < gameData.birdCount;
        const el = document.createElement('div');
        el.className = 'game-object';
        el.innerText = isBird ? "🐦" : "🍎";
        el.style.left = gameData.spots[i].x + "%";
        el.style.top = gameData.spots[i].y + "%";
        el.setAttribute('data-type', isBird ? 'bird' : 'decoy');
        playArea.appendChild(el);
    }
    roundStartTime = Date.now();
}

async function renderBoxes(gameData, playArea) {
    lastBoxData = gameData; // <--- CRITICAL: Save the data here!
    actualTargetCount = gameData.actualCount || gameData.cubes.length;
    
    playArea.classList.add('isometric-view');
    toggleControls(false); 
    
    const scene = document.createElement('div');
    scene.className = 'scene-3d';
    playArea.appendChild(scene);

    const chunkSize = 3;
    const cubes = gameData.cubes;
    
    for (let i = 0; i < cubes.length; i += chunkSize) {
        scene.innerHTML = ""; 
        const chunk = cubes.slice(i, i + chunkSize);

        chunk.forEach(c => {
            const cube = document.createElement('div');
            cube.className = 'cube';
            cube.style.gridColumn = c.x + 1;
            cube.style.gridRow = c.y + 1;
            const tz = 19 + (c.z * 38);
            cube.style.transform = `translate3d(0, 0, ${tz}px)`;
            cube.innerHTML = `<div class="face-front"></div><div class="face-top"></div><div class="face-side"></div>`;
            scene.appendChild(cube);
        });

        await new Promise(r => setTimeout(r, 800)); // Burst duration
    }

    scene.innerHTML = "";
    playArea.innerHTML = `<div class="mystery-q">?</div>`;
    toggleControls(true);
    roundStartTime = Date.now();
}


function toggleControls(active) {
    const btns = document.querySelector('.button-row');
    const lock = document.getElementById('lock-btn');
    btns.style.pointerEvents = active ? "auto" : "none";
    lock.style.pointerEvents = active ? "auto" : "none";
    btns.style.opacity = active ? "1" : "0.3";
    lock.style.opacity = active ? "1" : "0.3";
}

// --- SHARED BUTTONS ---

document.getElementById('plus-btn').addEventListener('touchstart', (e) => {
    e.preventDefault(); count++; updateCounter(); playSound('tap');
    socket.emit('updateCount', count);
});

document.getElementById('minus-btn').addEventListener('touchstart', (e) => {
    e.preventDefault(); if(count > 0) count--; updateCounter(); playSound('tap');
    socket.emit('updateCount', count);
});

document.getElementById('lock-btn').addEventListener('click', () => {
    const timeTaken = (Date.now() - roundStartTime) / 1000;
    toggleControls(false);
    socket.emit('lockIn', { count, timeTaken, actualCount: actualTargetCount });
    playSound('lock');
    document.getElementById('instruction').innerText = "WAITING...";
});

function updateCounter() { document.getElementById('my-counter').innerText = count < 10 ? "0" + count : count; }

async function runRevealSequence(calculatedScores) {
    const playArea = document.getElementById('play-area');
    const instruction = document.getElementById('instruction');
    const isBoxes = playArea.classList.contains('isometric-view');

    if (isBoxes) {
        playArea.classList.remove('isometric-view'); // Flatten the grid
        playArea.innerHTML = `
            <div id="reveal-counter" class="reveal-counter">0</div>
            <div id="gallery" class="gallery-view"></div>
        `;
        
        const gallery = document.getElementById('gallery');
        const counterDisplay = document.getElementById('reveal-counter');

        if (!lastBoxData || !lastBoxData.cubes) return;

        const cubeElements = [];
        lastBoxData.cubes.forEach(() => {
            const cube = document.createElement('div');
            cube.className = 'cube gallery-item'; 
            // We give them a basic 3D look even in the gallery
            cube.innerHTML = `<div class="face-front"></div><div class="face-top"></div><div class="face-side"></div>`;
            gallery.appendChild(cube);
            cubeElements.push(cube);
        });

        for (let i = 0; i < cubeElements.length; i++) {
            await new Promise(r => setTimeout(r, 250));
            cubeElements[i].classList.add('counted'); 
            counterDisplay.innerText = i + 1;
            playSound('reveal');
            triggerHaptic('light');
        }
    } else {
        const birds = document.querySelectorAll('.game-object[data-type="bird"]');
        for (let i = 0; i < birds.length; i++) {
            birds[i].innerText = i + 1;
            birds[i].style.color = "#ff4b4b";
            birds[i].style.fontWeight = "bold";
            playSound('reveal');
            triggerHaptic('light');
            await new Promise(res => setTimeout(res, 250));
        }
    }

    // SCORING LOGIC (Keep this identical)
    instruction.innerText = `ACTUAL: ${actualTargetCount}`;
    const myData = calculatedScores[socket.id];
    let partnerId = Object.keys(calculatedScores).find(id => id !== socket.id);
    let partnerData = calculatedScores[partnerId];
    myTotalScore = myData.totalScore;
    partnerTotalScore = partnerData ? partnerData.totalScore : 0;
    
    if (partnerData) document.getElementById('opponent-counter').innerText = partnerData.originalCount;
    document.getElementById('my-counter').style.color = myData.isPerfect ? "#2ecc71" : "#e74c3c";

    const maxRounds = isBoxes ? 7 : 5;
    if (currentRound >= maxRounds) {
        setTimeout(() => { showResults(); }, 3000);
    }
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
        sounds.victory.play();
        triggerHaptic('success');
    } else {
        winMsg.innerText = `${partnerName.toUpperCase()} WINS!`;
        triggerHaptic('error');
    }
}