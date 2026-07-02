// server/index.js
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from './db.js';
import { 
  initGame, 
  rollDiceState, 
  moveTokenState, 
  handleBotTurn,
  COLORS 
} from './game.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

// Expose static files from the build folder if it exists
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));

// In-memory rooms cache containing sockets and operational objects.
// Persisted details are saved via db.js.
const rooms = {};

// Helper to get local network IPv4 address
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      // Skip internal (loopback) and non-IPv4 addresses
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
}

// REST API Endpoints
app.get('/api/lan-info', (req, res) => {
  const ip = getLocalIpAddress();
  res.json({
    ip,
    port: process.env.PORT || 3001,
    url: `http://${ip}:${process.env.PORT || 3001}`
  });
});

app.get('/api/history', async (req, res) => {
  try {
    const history = await db.getMatchHistory();
    res.json(history);
  } catch (err) {
    console.error('Error getting history:', err);
    res.status(500).json([]);
  }
});

// Fallback all frontend routes to React index.html in production
app.get('/*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'), (err) => {
    if (err) {
      res.status(200).send('Ludo Server is running! Frontend is not built yet.');
    }
  });
});

// Socket.IO Connection Handler
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // 1. Create Room (Host)
  socket.on('create_room', ({ playerName, settings, mode }, callback) => {
    try {
      const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      const hostId = Math.random().toString(36).substring(2, 11);

      const newRoom = {
        roomId: roomCode,
        status: 'lobby', // 'lobby', 'playing', 'finished'
        mode: mode || 'online', // 'local', 'wifi', 'online'
        hostId,
        players: [
          {
            id: hostId,
            name: playerName || 'Host',
            avatar: 0,
            color: COLORS[0],
            seatIndex: 0,
            isHost: true,
            isConnected: true,
            isBot: false,
            isSpectator: false,
            isReady: true,
            socketId: socket.id
          }
        ],
        settings: {
          playerCount: settings?.playerCount || 4,
          botsEnabled: settings?.botsEnabled !== false,
          bathroomChallenge: {
            enabled: settings?.bathroomChallenge?.enabled !== false,
            name: settings?.bathroomChallenge?.name || 'Bathroom Challenge'
          },
          rules: {
            threeSixesRule: true,
            extraTurnOnCapture: true,
            extraTurnOnFinish: true
          }
        },
        gameState: null
      };

      rooms[roomCode] = newRoom;
      db.saveRoom(newRoom).catch(e => console.error(e));

      socket.join(roomCode);
      socket.playerId = hostId;
      socket.roomId = roomCode;

      console.log(`Room created: ${roomCode} by ${playerName}`);
      callback({ success: true, room: newRoom, playerId: hostId });
    } catch (err) {
      console.error(err);
      callback({ success: false, error: err.message });
    }
  });

  // 2. Join Room (Player or Spectator)
  socket.on('join_room', async ({ roomId, playerName, playerId }, callback) => {
    try {
      const code = roomId.toUpperCase();
      const room = rooms[code] || await db.getRoom(code);

      if (!room) {
        return callback({ success: false, error: 'Room not found' });
      }

      // Restore active cache if loading from DB
      if (!rooms[code]) {
        rooms[code] = room;
      }

      let existingPlayer = null;
      
      // If client sent an existing player ID, attempt to reconnect them
      if (playerId) {
        existingPlayer = room.players.find(p => p.id === playerId);
      }

      if (existingPlayer) {
        // RECONNECTION
        existingPlayer.isConnected = true;
        existingPlayer.socketId = socket.id;
        socket.playerId = existingPlayer.id;
        socket.roomId = code;
        socket.join(code);
        
        console.log(`Player reconnected: ${existingPlayer.name} in Room ${code}`);
        io.to(code).emit('room_updated', room);
        return callback({ success: true, room, playerId: existingPlayer.id });
      }

      // Check if room is full for active players
      const activePlayersCount = room.players.filter(p => !p.isSpectator && !p.isBot).length;
      const isSpectator = activePlayersCount >= room.settings.playerCount || room.status !== 'lobby';

      const newPlayerId = Math.random().toString(36).substring(2, 11);
      
      let assignedSeat = -1;
      if (!isSpectator) {
        // Find first empty seat
        const filledSeats = room.players.filter(p => !p.isSpectator).map(p => p.seatIndex);
        for (let i = 0; i < room.settings.playerCount; i++) {
          if (!filledSeats.includes(i)) {
            assignedSeat = i;
            break;
          }
        }
      }

      const newPlayer = {
        id: newPlayerId,
        name: playerName || (isSpectator ? `Spectator ${activePlayersCount + 1}` : `Player ${assignedSeat + 1}`),
        avatar: Math.floor(Math.random() * 8),
        color: assignedSeat !== -1 ? COLORS[assignedSeat] : 'grey',
        seatIndex: assignedSeat,
        isHost: false,
        isConnected: true,
        isBot: false,
        isSpectator,
        isReady: isSpectator, // Spectators are always ready
        socketId: socket.id
      };

      room.players.push(newPlayer);
      db.saveRoom(room).catch(e => console.error(e));

      socket.join(code);
      socket.playerId = newPlayerId;
      socket.roomId = code;

      console.log(`Player joined: ${newPlayer.name} (Spectator: ${isSpectator}) in Room ${code}`);
      io.to(code).emit('room_updated', room);
      
      callback({ success: true, room, playerId: newPlayerId });
    } catch (err) {
      console.error(err);
      callback({ success: false, error: err.message });
    }
  });

  // 3. Ready Toggle
  socket.on('toggle_ready', () => {
    const room = rooms[socket.roomId];
    if (!room) return;

    const player = room.players.find(p => p.id === socket.playerId);
    if (!player) return;

    player.isReady = !player.isReady;
    db.saveRoom(room).catch(e => console.error(e));
    io.to(room.roomId).emit('room_updated', room);
  });

  // 4. Color / Seat Selection
  socket.on('select_seat', ({ seatIndex }) => {
    const room = rooms[socket.roomId];
    if (!room || room.status !== 'lobby') return;

    const player = room.players.find(p => p.id === socket.playerId);
    if (!player || player.isSpectator) return;

    // Check if seat is already occupied
    const isOccupied = room.players.some(p => !p.isSpectator && p.seatIndex === seatIndex);
    if (isOccupied) return;

    player.seatIndex = seatIndex;
    player.color = COLORS[seatIndex];
    db.saveRoom(room).catch(e => console.error(e));
    io.to(room.roomId).emit('room_updated', room);
  });

  // 5. Host Adjust Player Count
  socket.on('change_player_count', ({ count }) => {
    const room = rooms[socket.roomId];
    if (!room || room.status !== 'lobby') return;

    // Verify host
    const player = room.players.find(p => p.id === socket.playerId);
    if (!player || !player.isHost) return;

    if (count < 4 || count > 9) return;

    room.settings.playerCount = count;
    
    // Evict players who exceed the new count
    room.players.forEach(p => {
      if (!p.isSpectator && p.seatIndex >= count) {
        p.isSpectator = true;
        p.seatIndex = -1;
        p.color = 'grey';
      }
    });

    db.saveRoom(room).catch(e => console.error(e));
    io.to(room.roomId).emit('room_updated', room);
  });

  // 6. Host Kick Player
  socket.on('kick_player', ({ targetPlayerId }) => {
    const room = rooms[socket.roomId];
    if (!room || room.status !== 'lobby') return;

    const host = room.players.find(p => p.id === socket.playerId);
    if (!host || !host.isHost) return;

    const index = room.players.findIndex(p => p.id === targetPlayerId);
    if (index === -1) return;

    const kickedPlayer = room.players[index];
    room.players.splice(index, 1);
    db.saveRoom(room).catch(e => console.error(e));

    io.to(room.roomId).emit('room_updated', room);
    io.to(kickedPlayer.socketId).emit('kicked');
  });

  // 7. Host Toggle / Configure Punishment
  socket.on('configure_punishment', ({ enabled, name }) => {
    const room = rooms[socket.roomId];
    if (!room || room.status !== 'lobby') return;

    const host = room.players.find(p => p.id === socket.playerId);
    if (!host || !host.isHost) return;

    room.settings.bathroomChallenge = {
      enabled,
      name: name || 'Bathroom Challenge'
    };

    db.saveRoom(room).catch(e => console.error(e));
    io.to(room.roomId).emit('room_updated', room);
  });

  // 8. Start Game (Host)
  socket.on('start_game', (data) => {
    const room = rooms[socket.roomId];
    if (!room || room.status !== 'lobby') return;

    const host = room.players.find(p => p.id === socket.playerId);
    if (!host || !host.isHost) return;

    const N = room.settings.playerCount;

    // Support local same-device players
    if (data && data.localPlayers) {
      // Retain only host, discard others to clean list
      room.players = [host];
      data.localPlayers.forEach((name, idx) => {
        const seatIndex = idx + 1; // Host is seat 0
        if (seatIndex < N) {
          room.players.push({
            id: `local_${seatIndex}`,
            name: name || `Player ${seatIndex + 1}`,
            avatar: Math.floor(Math.random() * 8),
            color: COLORS[seatIndex],
            seatIndex: seatIndex,
            isHost: false,
            isConnected: true,
            isBot: false,
            isSpectator: false,
            isReady: true,
            socketId: null
          });
        }
      });
    }

    // Fill remaining seats with bots if enabled
    const occupiedSeats = room.players.filter(p => !p.isSpectator).map(p => p.seatIndex);
    for (let i = 0; i < N; i++) {
      if (!occupiedSeats.includes(i)) {
        room.players.push({
          id: `bot_${i}`,
          name: `Bot ${i + 1}`,
          avatar: Math.floor(Math.random() * 8),
          color: COLORS[i],
          seatIndex: i,
          isHost: false,
          isConnected: true,
          isBot: true,
          isSpectator: false,
          isReady: true,
          socketId: null
        });
      }
    }

    // Initialize gameplay state
    room.gameState = initGame(room.players, room.settings);
    room.status = 'playing';
    db.saveRoom(room).catch(e => console.error(e));

    io.to(room.roomId).emit('game_started', room);

    // If first turn is a bot, trigger it
    triggerBotTurnIfNeeded(room);
  });

  // 9. Roll Dice
  socket.on('roll_dice', () => {
    const room = rooms[socket.roomId];
    if (!room || room.status !== 'playing') return;

    const player = room.players.find(p => p.id === socket.playerId);
    if (!player || player.isSpectator) return;

    try {
      const activeSeat = room.gameState.activeSeats[room.gameState.turnIndex];
      if (player.seatIndex !== activeSeat) return;

      // Perform roll
      room.gameState.diceState = 'rolling';
      io.to(room.roomId).emit('dice_rolling', room);

      setTimeout(() => {
        try {
          const { roll, movableTokens } = rollDiceState(room, player.seatIndex);
          db.saveRoom(room).catch(e => console.error(e));
          io.to(room.roomId).emit('dice_rolled', { room, roll, movableTokens });

          // If no movable tokens, server schedules automatic turn passing
          if (movableTokens.length === 0) {
            setTimeout(() => {
              if (room.status === 'playing') {
                db.saveRoom(room).catch(e => console.error(e));
                io.to(room.roomId).emit('room_updated', room);
                triggerBotTurnIfNeeded(room);
              }
            }, 1500);
          }
        } catch (rollErr) {
          console.error(rollErr);
        }
      }, 800); // 800ms rolling animation delay

    } catch (err) {
      console.error(err);
      socket.emit('error', err.message);
    }
  });

  // 10. Move Token
  socket.on('move_token', ({ tokenIndex }) => {
    const room = rooms[socket.roomId];
    if (!room || room.status !== 'playing') return;

    const player = room.players.find(p => p.id === socket.playerId);
    if (!player || player.isSpectator) return;

    try {
      const activeSeat = room.gameState.activeSeats[room.gameState.turnIndex];
      if (player.seatIndex !== activeSeat) return;

      moveTokenState(room, player.seatIndex, tokenIndex);
      db.saveRoom(room).catch(e => console.error(e));
      io.to(room.roomId).emit('room_updated', room);

      // Trigger bot turn recursively if next is bot
      triggerBotTurnIfNeeded(room);
    } catch (err) {
      console.error(err);
      socket.emit('error', err.message);
    }
  });

  // 11. Host Restart Match
  socket.on('restart_game', () => {
    const room = rooms[socket.roomId];
    if (!room) return;

    const host = room.players.find(p => p.id === socket.playerId);
    if (!host || !host.isHost) return;

    // Filter out bots to reset lobby
    room.players = room.players.filter(p => !p.isBot);
    room.status = 'lobby';
    room.gameState = null;
    db.saveRoom(room).catch(e => console.error(e));

    io.to(room.roomId).emit('game_restarted', room);
  });

  // 12. Chat message syncing
  socket.on('send_chat', ({ message }) => {
    const room = rooms[socket.roomId];
    if (!room) return;

    const player = room.players.find(p => p.id === socket.playerId);
    if (!player) return;

    const chatMsg = {
      sender: player.name,
      color: player.color,
      message,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    io.to(room.roomId).emit('chat_received', chatMsg);
  });

  // 13. Disconnect Handling
  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
    const code = socket.roomId;
    const room = rooms[code];
    if (!room) return;

    const player = room.players.find(p => p.id === socket.playerId);
    if (player) {
      player.isConnected = false;
      player.socketId = null;
      console.log(`Player disconnected from room ${code}: ${player.name}`);
      
      // If all human players are disconnected, clean up the room cache
      const activeHumans = room.players.filter(p => !p.isBot && p.isConnected);
      if (activeHumans.length === 0) {
        console.log(`No active human players in Room ${code}. Keeping in database cache.`);
        delete rooms[code];
      } else {
        // If the host disconnected, reassign host status to first connected human
        if (player.isHost) {
          player.isHost = false;
          const nextHost = room.players.find(p => !p.isBot && p.isConnected);
          if (nextHost) {
            nextHost.isHost = true;
            nextHost.isReady = true;
            console.log(`Reassigned host in Room ${code} to ${nextHost.name}`);
          }
        }
        io.to(code).emit('room_updated', room);
      }
    }
  });
});

// Triggers bot actions recursively if it's a bot's turn
function triggerBotTurnIfNeeded(room) {
  if (room.status !== 'playing') return;

  const state = room.gameState;
  const activeSeat = state.activeSeats[state.turnIndex];
  const botPlayer = room.players.find(p => p.seatIndex === activeSeat);

  if (botPlayer && botPlayer.isBot) {
    // Schedule bot roll after a small delay
    setTimeout(() => {
      if (room.status !== 'playing') return;

      try {
        state.diceState = 'rolling';
        io.to(room.roomId).emit('dice_rolling', room);

        setTimeout(() => {
          if (room.status !== 'playing') return;

          try {
            const decision = handleBotTurn(room);
            db.saveRoom(room).catch(e => console.error(e));
            io.to(room.roomId).emit('room_updated', room);

            // If bot got an extra turn or just moved, trigger next action recursively
            if (room.status === 'playing') {
              triggerBotTurnIfNeeded(room);
            }
          } catch (botMoveErr) {
            console.error('Error handling bot move:', botMoveErr);
            passTurn(room);
            db.saveRoom(room).catch(e => console.error(e));
            io.to(room.roomId).emit('room_updated', room);
            triggerBotTurnIfNeeded(room);
          }
        }, 800); // roll duration
      } catch (botRollErr) {
        console.error('Error handling bot roll:', botRollErr);
        passTurn(room);
        db.saveRoom(room).catch(e => console.error(e));
        io.to(room.roomId).emit('room_updated', room);
        triggerBotTurnIfNeeded(room);
      }
    }, 1500); // Delay before bot starts its turn
  }
}

// Start Server
const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Ludo WebSocket server running on http://localhost:${PORT}`);
  console.log(`LAN Access: http://${getLocalIpAddress()}:${PORT}`);
});
