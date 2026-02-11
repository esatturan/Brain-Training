const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static(__dirname));

// Data structures organized by Room ID
let rooms = {}; 

io.on('connection', (socket) => {
    socket.on('joinGame', (data) => {
        const { name, room } = data;
        socket.join(room);
        socket.room = room; // Store room on socket for easy access

        if (!rooms[room]) {
            rooms[room] = { players: {}, roundResults: {}, currentRound: 1 };
        }

        const roomData = rooms[room];
        
        // Only allow 2 players per room
        if (Object.keys(roomData.players).length < 2) {
            roomData.players[socket.id] = { id: socket.id, name: name, totalScore: 0, ready: false };
            io.to(room).emit('updatePlayerList', Object.values(roomData.players));
        } else {
            socket.emit('errorMsg', "This room is full!");
        }
    });

    socket.on('playerReady', () => {
        const room = socket.room;
        const roomData = rooms[room];
        if (!roomData || !roomData.players[socket.id]) return;

        roomData.players[socket.id].ready = true;
        let readyPlayers = Object.values(roomData.players).filter(p => p.ready);

        if (readyPlayers.length === 2) {
            roomData.currentRound = 1;
            io.to(room).emit('startGame', generateLevelData(1));
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
                const isPerfect = res.count === res.actualBirds;
                const accuracy = 1 - (Math.abs(res.count - res.actualBirds) / res.actualBirds);
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

            setTimeout(() => {
                if (roomData.currentRound < 5) {
                    roomData.currentRound++;
                    io.to(room).emit('nextRoundData', generateLevelData(roomData.currentRound));
                } else {
                    io.to(room).emit('gameOver');
                }
            }, 7000);
        }
    });

    socket.on('disconnect', () => {
        const room = socket.room;
        if (room && rooms[room]) {
            delete rooms[room].players[socket.id];
            if (Object.keys(rooms[room].players).length === 0) {
                delete rooms[room]; // Clean up empty rooms
            }
        }
    });
});

function generateLevelData(round) {
    const minBirds = 3 + (round * 2);
    const maxBirds = 6 + (round * 4);
    const birdCount = Math.floor(Math.random() * (maxBirds - minBirds + 1)) + minBirds;
    const decoyCount = 2 + round;
    let spots = [];
    for(let r=0; r<6; r++) for(let c=0; c<5; c++) spots.push({ x: 10 + (c * 20), y: 10 + (r * 15) });
    spots.sort(() => Math.random() - 0.5);
    return { birdCount, decoyCount, spots, round };
}

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Server running on port ${PORT}`));