const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static(__dirname));

let rooms = {}; 

io.on('connection', (socket) => {
    socket.on('joinGame', (data) => {
        const { name, room } = data;
        socket.join(room);
        socket.room = room;

        if (!rooms[room]) {
            rooms[room] = { players: {}, roundResults: {}, currentRound: 1, gameType: 'birds' };
        }

        const roomData = rooms[room];
        if (Object.keys(roomData.players).length < 2) {
            roomData.players[socket.id] = { id: socket.id, name: name, totalScore: 0, ready: false };
            io.to(room).emit('updatePlayerList', Object.values(roomData.players));
        } else {
            socket.emit('errorMsg', "This room is full!");
        }
    });

    socket.on('playerReady', (type) => {
        const room = socket.room;
        const roomData = rooms[room];
        if (!roomData || !roomData.players[socket.id]) return;

        roomData.players[socket.id].ready = true;
        roomData.gameType = type || 'birds'; // Store if we are playing birds or boxes
        let readyPlayers = Object.values(roomData.players).filter(p => p.ready);

        if (readyPlayers.length === 2) {
            roomData.currentRound = 1;
            const data = roomData.gameType === 'boxes' ? generateBoxLevel(1) : generateLevelData(1);
            io.to(room).emit('startGame', data);
        } else {
            socket.emit('waitingForOpponent');
        }
    });

    socket.on('updateCount', (count) => {
        const room = socket.room;
        if (rooms[room] && rooms[room].players[socket.id]) {
            socket.to(room).emit('partnerUpdate', { 
                name: rooms[room].players[socket.id].name, 
                count: count 
            });
        }
    });

    socket.on('lockIn', (data) => {
        const room = socket.room;
        const roomData = rooms[room];
        if (!roomData) return;

        roomData.roundResults[socket.id] = data;
        socket.to(room).emit('partnerLockedIn');

        if (Object.keys(roomData.roundResults).length >= 2) {
            const calculatedScores = {};
            for (let id in roomData.roundResults) {
                const res = roomData.roundResults[id];
                // We use 'actualCount' as a generic name for birds or boxes
                const isPerfect = res.count === res.actualCount;
                const accuracy = 1 - (Math.abs(res.count - res.actualCount) / res.actualCount);
                const score = Math.max(0, Math.round((1000 / res.timeTaken) * (isPerfect ? 1 : accuracy * 0.5)));
                
                roomData.players[id].totalScore += score;
                calculatedScores[id] = {
                    roundScore: score,
                    totalScore: roomData.players[id].totalScore,
                    isPerfect: isPerfect,
                    originalCount: res.count
                };
            }
            io.to(room).emit('startReveal', calculatedScores);
            roomData.roundResults = {}; 

            io.to(room).emit('startReveal', calculatedScores);

            const firstResult = Object.values(roomData.roundResults)[0];
            const countToReveal = firstResult ? firstResult.actualCount : 10;

            // Math: (Cubes * 250ms) + 3.5 seconds for results/reading time
            const revealDuration = (countToReveal * 250) + 3500;

            roomData.roundResults = {}; // Clear for next round

            setTimeout(() => {
                const maxRounds = roomData.gameType === 'boxes' ? 7 : 5;
                if (roomData.currentRound < maxRounds) {
                    roomData.currentRound++;
                    const nextData = roomData.gameType === 'boxes' ? 
                        generateBoxLevel(roomData.currentRound) : 
                        generateLevelData(roomData.currentRound);
                    
                    io.to(room).emit('nextRoundData', nextData);
                } else {
                    io.to(room).emit('gameOver');
                }
            }, revealDuration);
        }
    });

    socket.on('disconnect', () => {
        const room = socket.room;
        if (room && rooms[room]) {
            delete rooms[room].players[socket.id];
            if (Object.keys(rooms[room].players).length === 0) delete rooms[room];
        }
    });
});

// --- GENERATORS ---

function generateLevelData(round) {
    const minBirds = 3 + (round * 2);
    const maxBirds = 6 + (round * 4);
    const birdCount = Math.floor(Math.random() * (maxBirds - minBirds + 1)) + minBirds;
    const decoyCount = 2 + round;
    let spots = [];
    for(let r=0; r<6; r++) for(let c=0; c<5; c++) spots.push({ x: 10 + (c * 20), y: 10 + (r * 15) });
    spots.sort(() => Math.random() - 0.5);
    return { birdCount, decoyCount, spots, round, gameType: 'birds' };
}

// server.js - Updated Generator
function generateBoxLevel(round) {
    // Randomize total count: Base range grows with rounds
    const minCubes = 4 + round;
    const maxCubes = 8 + (round * 2);
    const cubeCount = Math.floor(Math.random() * (maxCubes - minCubes + 1)) + minCubes;
    
    const cubes = [];
    const gridHeights = {}; // Keeps track of stacks at each (x,y)

    for (let i = 0; i < cubeCount; i++) {
        // Pick a random spot on the 5x5 grid
        let x = Math.floor(Math.random() * 5);
        let y = Math.floor(Math.random() * 5);
        let key = `${x},${y}`;
        
        // Stack logic: if spot is taken, go up (Z)
        let z = gridHeights[key] || 0;
        cubes.push({ x, y, z });
        gridHeights[key] = z + 1;
    }

    return { 
        cubes, 
        round, 
        gameType: 'boxes', 
        actualCount: cubes.length, // Explicitly send the total
        shouldSlide: round >= 4 
    };
}

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server running on port ${PORT}`));