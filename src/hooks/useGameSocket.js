// src/hooks/useGameSocket.js
import { useEffect, useState, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

export function useGameSocket() {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [room, setRoom] = useState(null);
  const [playerId, setPlayerId] = useState(localStorage.getItem('ludo_playerId') || null);
  const [currentRoomCode, setCurrentRoomCode] = useState(localStorage.getItem('ludo_roomId') || null);
  const [chatMessages, setChatMessages] = useState([]);
  const [diceMovableTokens, setDiceMovableTokens] = useState([]);
  const [isDiceRolling, setIsDiceRolling] = useState(false);

  const socketRef = useRef(null);

  // Helper to store session in localStorage
  const saveSession = (rId, pId) => {
    if (rId && pId) {
      localStorage.setItem('ludo_roomId', rId);
      localStorage.setItem('ludo_playerId', pId);
      setCurrentRoomCode(rId);
      setPlayerId(pId);
    } else {
      localStorage.removeItem('ludo_roomId');
      localStorage.removeItem('ludo_playerId');
      setCurrentRoomCode(null);
      setPlayerId(null);
      setRoom(null);
    }
  };

  useEffect(() => {
    // In dev: connect directly to Express server on port 3001 to bypass proxy issues
    // In prod: use backend URL or host origin
    const socketUrl = import.meta.env.DEV
      ? 'http://localhost:3001'
      : (import.meta.env.VITE_BACKEND_URL || window.location.origin);
    
    console.log('Connecting to WebSocket server at:', socketUrl);
    const s = io(socketUrl, {
      reconnectionAttempts: 10,
      reconnectionDelay: 2000
    });

    socketRef.current = s;
    setSocket(s);

    s.on('connect', () => {
      console.log('Connected to server!');
      setIsConnected(true);

      // Auto-reconnect if we have local session
      const storedRoomId = localStorage.getItem('ludo_roomId');
      const storedPlayerId = localStorage.getItem('ludo_playerId');
      
      if (storedRoomId && storedPlayerId) {
        console.log('Attempting automatic reconnection...');
        s.emit('join_room', { roomId: storedRoomId, playerId: storedPlayerId }, (response) => {
          if (response.success) {
            console.log('Auto-reconnect successful!');
            setRoom(response.room);
          } else {
            console.warn('Auto-reconnect failed:', response.error);
            saveSession(null, null);
          }
        });
      }
    });

    s.on('disconnect', () => {
      console.log('Disconnected from server!');
      setIsConnected(false);
    });

    s.on('room_updated', (updatedRoom) => {
      setRoom(updatedRoom);
      setIsDiceRolling(false);
    });

    s.on('game_started', (updatedRoom) => {
      setRoom(updatedRoom);
      setIsDiceRolling(false);
      setChatMessages(prev => [...prev, {
        sender: 'System',
        color: 'grey',
        message: 'The match has begun! Let the games begin!',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);
    });

    s.on('dice_rolling', (updatedRoom) => {
      setRoom(updatedRoom);
      setIsDiceRolling(true);
      setDiceMovableTokens([]);
    });

    s.on('dice_rolled', ({ room: updatedRoom, roll, movableTokens }) => {
      setRoom(updatedRoom);
      setIsDiceRolling(false);
      
      // If it is our turn, capture the movable tokens list
      const activeSeat = updatedRoom.gameState?.activeSeats[updatedRoom.gameState.turnIndex];
      const me = updatedRoom.players.find(p => p.id === localStorage.getItem('ludo_playerId'));
      
      if (me && me.seatIndex === activeSeat) {
        setDiceMovableTokens(movableTokens);
      } else {
        setDiceMovableTokens([]);
      }
    });

    s.on('chat_received', (msg) => {
      setChatMessages(prev => [...prev, msg]);
    });

    s.on('kicked', () => {
      alert('You have been removed from the room by the host.');
      saveSession(null, null);
      window.location.reload();
    });

    s.on('game_restarted', (updatedRoom) => {
      setRoom(updatedRoom);
      setDiceMovableTokens([]);
      setIsDiceRolling(false);
      setChatMessages(prev => [...prev, {
        sender: 'System',
        color: 'grey',
        message: 'The match was reset. Welcome back to the lobby.',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);
    });

    return () => {
      s.disconnect();
    };
  }, []);

  // Room Actions
  const createRoom = useCallback((playerName, settings, mode, callback) => {
    if (!socketRef.current) return;
    socketRef.current.emit('create_room', { playerName, settings, mode }, (res) => {
      if (res.success) {
        saveSession(res.room.roomId, res.playerId);
      }
      if (callback) callback(res);
    });
  }, []);

  const joinRoom = useCallback((roomId, playerName, callback) => {
    if (!socketRef.current) return;
    socketRef.current.emit('join_room', { roomId, playerName }, (res) => {
      if (res.success) {
        saveSession(res.room.roomId, res.playerId);
      }
      if (callback) callback(res);
    });
  }, []);

  const toggleReady = useCallback(() => {
    if (!socketRef.current) return;
    socketRef.current.emit('toggle_ready');
  }, []);

  const selectSeat = useCallback((seatIndex) => {
    if (!socketRef.current) return;
    socketRef.current.emit('select_seat', { seatIndex });
  }, []);

  const changePlayerCount = useCallback((count) => {
    if (!socketRef.current) return;
    socketRef.current.emit('change_player_count', { count });
  }, []);

  const kickPlayer = useCallback((targetPlayerId) => {
    if (!socketRef.current) return;
    socketRef.current.emit('kick_player', { targetPlayerId });
  }, []);

  const configurePunishment = useCallback((enabled, name) => {
    if (!socketRef.current) return;
    socketRef.current.emit('configure_punishment', { enabled, name });
  }, []);

  const startGame = useCallback((data) => {
    if (!socketRef.current) return;
    socketRef.current.emit('start_game', data);
  }, []);

  const rollDice = useCallback(() => {
    if (!socketRef.current) return;
    socketRef.current.emit('roll_dice');
  }, []);

  const moveToken = useCallback((tokenIndex) => {
    if (!socketRef.current) return;
    socketRef.current.emit('move_token', { tokenIndex });
    setDiceMovableTokens([]); // Clear active highlights after making a move
  }, []);

  const restartGame = useCallback(() => {
    if (!socketRef.current) return;
    socketRef.current.emit('restart_game');
  }, []);

  const sendChat = useCallback((message) => {
    if (!socketRef.current || !message.trim()) return;
    socketRef.current.emit('send_chat', { message });
  }, []);

  const leaveRoom = useCallback(() => {
    saveSession(null, null);
  }, []);

  return {
    isConnected,
    room,
    playerId,
    currentRoomCode,
    chatMessages,
    diceMovableTokens,
    isDiceRolling,
    createRoom,
    joinRoom,
    toggleReady,
    selectSeat,
    changePlayerCount,
    kickPlayer,
    configurePunishment,
    startGame,
    rollDice,
    moveToken,
    restartGame,
    sendChat,
    leaveRoom
  };
}
