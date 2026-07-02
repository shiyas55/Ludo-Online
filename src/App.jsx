// src/App.jsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import confetti from 'canvas-confetti';
import { 
  Trophy, 
  Users, 
  Wifi, 
  Play, 
  Plus, 
  LogIn, 
  History, 
  BookOpen, 
  Moon, 
  Sun, 
  Send, 
  LogOut,
  ArrowLeft,
  Crown,
  Bot
} from 'lucide-react';
import { useGameSocket } from './hooks/useGameSocket';
import RadialBoard from './components/RadialBoard';
import Dice from './components/Dice';
import Lobby from './components/Lobby';
import PunishmentCard from './components/PunishmentCard';
import { COLORS } from './utils/geometry';

export default function App() {
  const {
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
  } = useGameSocket();

  // Navigation states
  const [view, setView] = useState('landing'); // 'landing', 'create', 'join', 'local_setup', 'history', 'rules'
  const [playerName, setPlayerName] = useState(localStorage.getItem('ludo_playerName') || '');
  const [joinCode, setJoinCode] = useState('');
  const [theme, setTheme] = useState(localStorage.getItem('ludo_theme') || 'dark');
  
  // Local same-device play configurations
  const [localPlayerCount, setLocalPlayerCount] = useState(4);
  const [localPlayerNames, setLocalPlayerNames] = useState(
    Array.from({ length: 9 }, (_, i) => i === 0 ? '' : `Player ${i + 1}`)
  );
  const [localPunishmentEnabled, setLocalPunishmentEnabled] = useState(true);
  const [localPunishmentName, setLocalPunishmentName] = useState('Bathroom Challenge');

  // App data history
  const [matchHistory, setMatchHistory] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef(null);

  // Initialize theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ludo_theme', theme);
  }, [theme]);

  // Read URL query parameter for auto-join
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('join');
    if (roomParam) {
      setJoinCode(roomParam.toUpperCase());
      setView('join');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Update room states to keep views aligned
  useEffect(() => {
    if (room) {
      if (room.status === 'lobby') {
        setView('lobby');
      } else if (room.status === 'playing') {
        setView('game');
      } else if (room.status === 'finished') {
        setView('rankings');
      }
    } else {
      // If we got disconnected or left room
      if (view === 'lobby' || view === 'game' || view === 'rankings') {
        setView('landing');
      }
    }
  }, [room?.status, room?.roomId]);

  // Synchronize chat scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, room?.gameState?.logs]);

  // Save guest player name
  const handleNameChange = (name) => {
    setPlayerName(name);
    localStorage.setItem('ludo_playerName', name);
    // Sync own name in local names list
    setLocalPlayerNames(prev => {
      const next = [...prev];
      next[0] = name;
      return next;
    });
  };

  // Helper: toggle dark/light mode
  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  // Create room multiplayer
  const handleCreateRoom = (mode) => {
    if (!playerName.trim()) return alert('Please enter your name first!');
    createRoom(
      playerName,
      { playerCount: 4, botsEnabled: true },
      mode,
      (res) => {
        if (res.success) {
          setView('lobby');
        } else {
          alert(`Error creating room: ${res.error}`);
        }
      }
    );
  };

  // Create same-device local room
  const handleStartLocalGame = () => {
    if (!playerName.trim()) return alert('Please enter your name first!');
    
    // Create local room
    createRoom(
      playerName,
      {
        playerCount: localPlayerCount,
        botsEnabled: false,
        bathroomChallenge: {
          enabled: localPunishmentEnabled,
          name: localPunishmentName
        }
      },
      'local',
      (res) => {
        if (res.success) {
          // Join the rest of the names
          const names = localPlayerNames.slice(1, localPlayerCount).map((name, i) => name || `Player ${i + 2}`);
          startGame({ localPlayers: names });
        } else {
          alert(`Error starting local game: ${res.error}`);
        }
      }
    );
  };

  // Join multiplayer room
  const handleJoinRoom = () => {
    if (!playerName.trim()) return alert('Please enter your name first!');
    if (!joinCode.trim()) return alert('Please enter a valid room code!');
    
    joinRoom(joinCode, playerName, (res) => {
      if (res.success) {
        setView('lobby');
      } else {
        alert(`Error joining room: ${res.error}`);
      }
    });
  };

  // Send message chat
  const handleSendChat = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    sendChat(chatInput);
    setChatInput('');
  };

  // Load Match History from database
  const loadHistory = () => {
    fetch('/api/history')
      .then(res => res.json())
      .then(data => {
        setMatchHistory(data);
        setView('history');
      })
      .catch(err => {
        console.error('Error fetching history:', err);
        alert('Could not fetch match history. Ensure backend server is running.');
      });
  };

  // Identify players and active positions
  const activeSeat = room?.gameState?.activeSeats?.[room?.gameState?.turnIndex];
  const activePlayer = room?.players?.find(p => p.seatIndex === activeSeat);
  const me = useMemo(() => room?.players?.find(p => p.id === playerId), [room, playerId]);
  
  // Local device allows host to click all buttons
  const isSameDevice = room?.mode === 'local';
  const isMyTurn = useMemo(() => {
    if (!room || room.status !== 'playing') return false;
    const activePl = room.players.find(p => p.seatIndex === activeSeat);
    if (activePl?.isBot) return false;

    if (isSameDevice) {
      return me?.isHost;
    }
    return me && me.seatIndex === activeSeat;
  }, [room, activeSeat, me, isSameDevice]);

  // List of game logs and chats merged together
  const mergedChatLogs = useMemo(() => {
    const list = [];
    
    // Add game actions logs
    if (room?.gameState?.logs) {
      room.gameState.logs.forEach((log) => {
        list.push({
          type: 'system',
          sender: 'System',
          color: 'grey',
          message: log,
          timestamp: new Date()
        });
      });
    }

    // Add player chat messages
    chatMessages.forEach((chat) => {
      list.push({
        type: 'user',
        sender: chat.sender,
        color: chat.color,
        message: chat.message,
        time: chat.time
      });
    });

    return list;
  }, [room?.gameState?.logs, chatMessages]);

  return (
    <div className="app-container">
      {/* Header Panel */}
      <header className="app-header">
        <div className="logo-section" onClick={() => room ? null : setView('landing')} style={{ cursor: room ? 'default' : 'pointer' }}>
          <span>🎡 LUDO ROYAL</span>
        </div>

        <div className="header-controls">
          {/* Connection Status Badge */}
          {room && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', fontWeight: 700 }}>
              <span className={`status-indicator ${isConnected ? 'status-online' : 'status-offline'}`} />
              {isConnected ? 'Sync Connected' : 'Reconnecting...'}
            </div>
          )}

          {/* Theme Toggle Button */}
          <button onClick={toggleTheme} className="btn btn-secondary btn-icon-only">
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          {/* Leave/Exit buttons inside rooms */}
          {room && (
            <button 
              onClick={() => {
                if (window.confirm('Are you sure you want to leave the match?')) {
                  leaveRoom();
                  setView('landing');
                }
              }} 
              className="btn btn-danger btn-icon-only"
              title="Leave Room"
            >
              <LogOut size={18} />
            </button>
          )}
        </div>
      </header>

      {/* Main Pages Router */}

      {/* PAGE 1: Landing Page */}
      {view === 'landing' && (
        <main className="page-landing">
          <div className="landing-left">
            <h1 className="landing-title">
              Dynamic Radial <br />
              <span>Multiplayer Ludo</span>
            </h1>
            <p className="landing-desc">
              Experience the world's first adaptive radial Ludo board! Supporting 4 to 9 players, 
              complete with same-device play, local network (Wi-Fi) hosting, online rooms, and the 
              humorous Bathroom Punishment challenge.
            </p>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
              <button onClick={loadHistory} className="btn btn-secondary">
                <History size={16} /> History
              </button>
              <button onClick={() => setView('rules')} className="btn btn-secondary">
                <BookOpen size={16} /> Rules & Settings
              </button>
            </div>
          </div>

          <div className="landing-right glass-panel">
            <span className="mode-selector-title">Join the Battle</span>
            
            {/* Player Name Entry */}
            <div className="input-group">
              <label htmlFor="name-input">GUEST PLAYER NAME</label>
              <input
                id="name-input"
                type="text"
                value={playerName}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Enter nickname..."
                className="text-input"
              />
            </div>

            <div className="modes-grid">
              {/* Local Same-device play option */}
              <div onClick={() => setView('local_setup')} className="mode-card">
                <div className="mode-card-icon"><Users size={20} /></div>
                <div>
                  <h4 className="mode-card-title">Local Same-Device</h4>
                  <p className="mode-card-desc">Pass and play with 4-9 friends on a single screen.</p>
                </div>
              </div>

              {/* Local Wi-Fi option */}
              <div onClick={() => handleCreateRoom('wifi')} className="mode-card">
                <div className="mode-card-icon"><Wifi size={20} /></div>
                <div>
                  <h4 className="mode-card-title">Local Wi-Fi Room</h4>
                  <p className="mode-card-desc">Host locally. Friends join by IP or scanning QR code.</p>
                </div>
              </div>

              {/* Online multiplayer option */}
              <div onClick={() => handleCreateRoom('online')} className="mode-card">
                <div className="mode-card-icon"><Play size={20} /></div>
                <div>
                  <h4 className="mode-card-title">Online Room</h4>
                  <p className="mode-card-desc">Create a private online match and invite remote players.</p>
                </div>
              </div>

              {/* Spectator or direct join */}
              <div onClick={() => setView('join')} className="mode-card">
                <div className="mode-card-icon"><LogIn size={20} /></div>
                <div>
                  <h4 className="mode-card-title">Join via Room Code</h4>
                  <p className="mode-card-desc">Input a private 6-digit room code to join or spectate.</p>
                </div>
              </div>
            </div>
          </div>
        </main>
      )}

      {/* PAGE 2: Join Room screen */}
      {view === 'join' && (
        <div className="page-setup glass-panel">
          <div className="setup-header">
            <button onClick={() => setView('landing')} className="btn btn-secondary btn-icon-only">
              <ArrowLeft size={16} />
            </button>
            <h2 className="setup-title">Join Room</h2>
          </div>

          <div className="input-group">
            <label htmlFor="join-code">6-DIGIT ROOM CODE</label>
            <input
              id="join-code"
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="e.g. AB12CD"
              className="text-input"
              maxLength={6}
            />
          </div>

          <div className="input-group">
            <label htmlFor="join-name">YOUR NICKNAME</label>
            <input
              id="join-name"
              type="text"
              value={playerName}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Enter name..."
              className="text-input"
            />
          </div>

          <button onClick={handleJoinRoom} className="btn btn-primary" style={{ padding: '1rem' }}>
            Enter Room
          </button>
        </div>
      )}

      {/* PAGE 3: Local Setup screen */}
      {view === 'local_setup' && (
        <div className="page-setup glass-panel">
          <div className="setup-header">
            <button onClick={() => setView('landing')} className="btn btn-secondary btn-icon-only">
              <ArrowLeft size={16} />
            </button>
            <h2 className="setup-title">Local Game Setup</h2>
          </div>

          {/* Seat choice count */}
          <div className="setting-row">
            <div className="setting-info">
              <span className="setting-title">Number of Players</span>
              <span className="setting-desc">Choose layout sizes: 4, 6, 7, 8, or 9 players</span>
            </div>
            <div className="player-count-picker">
              {[4, 6, 7, 8, 9].map((cnt) => (
                <button
                  key={`local_cnt_${cnt}`}
                  onClick={() => setLocalPlayerCount(cnt)}
                  className={`count-btn ${localPlayerCount === cnt ? 'active' : ''}`}
                >
                  {cnt}
                </button>
              ))}
            </div>
          </div>

          {/* Custom names list */}
          <div className="settings-section">
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>Configure Player Names</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              {Array.from({ length: localPlayerCount }).map((_, idx) => (
                <div key={`local_name_group_${idx}`} className="input-group" style={{ marginBottom: 0 }}>
                  <label>Player {idx + 1} Name</label>
                  <input
                    type="text"
                    value={idx === 0 && playerName ? playerName : localPlayerNames[idx] || ''}
                    onChange={(e) => {
                      const next = [...localPlayerNames];
                      next[idx] = e.target.value;
                      if (idx === 0) setPlayerName(e.target.value);
                      setLocalPlayerNames(next);
                    }}
                    placeholder={`Name ${idx + 1}`}
                    className="text-input"
                    style={{ padding: '0.65rem 0.85rem', fontSize: '0.95rem' }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Bathroom Punishment Toggle */}
          <div className="setting-row" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem', alignItems: 'flex-start' }}>
            <div className="setting-info">
              <span className="setting-title">Bathroom Punishment Challenge</span>
              <span className="setting-desc">Last two players are assigned to clean the toilet</span>
            </div>
            <label className="switch">
              <input 
                type="checkbox" 
                checked={localPunishmentEnabled}
                onChange={(e) => setLocalPunishmentEnabled(e.target.checked)}
              />
              <span className="slider"></span>
            </label>
          </div>

          {localPunishmentEnabled && (
            <div className="input-group" style={{ marginTop: '-0.75rem' }}>
              <label>PUNISHMENT DESCRIPTION</label>
              <input
                type="text"
                value={localPunishmentName}
                onChange={(e) => setLocalPunishmentName(e.target.value)}
                placeholder="e.g. Bathroom Duty"
                className="text-input"
              />
            </div>
          )}

          <button onClick={handleStartLocalGame} className="btn btn-primary" style={{ padding: '1rem', marginTop: '0.5rem' }}>
            Launch Game Board
          </button>
        </div>
      )}

      {/* PAGE 4: Lobby Screen */}
      {view === 'lobby' && (
        <Lobby
          room={room}
          playerId={playerId}
          onToggleReady={toggleReady}
          onSelectSeat={selectSeat}
          onChangePlayerCount={changePlayerCount}
          onKickPlayer={kickPlayer}
          onConfigurePunishment={configurePunishment}
          onStartGame={() => startGame()}
        />
      )}

      {/* PAGE 5: Main Game Board Screen */}
      {view === 'game' && (
        <main className="game-viewport">
          {/* Radial Board SVG center column */}
          <RadialBoard
            room={room}
            playerId={playerId}
            diceMovableTokens={diceMovableTokens}
            onTokenClick={moveToken}
          />

          {/* Right sidebar panels */}
          <div className="side-panel">
            {/* Player status details row */}
            <div className="players-status-card glass-panel">
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '0.85rem' }}>Player Standings</h3>
              <div className="players-status-list">
                {room?.players?.filter(p => !p.isSpectator).sort((a,b) => a.seatIndex - b.seatIndex).map((p) => {
                  const isActive = activeSeat === p.seatIndex;
                  const tokenSteps = room.gameState?.tokens[p.seatIndex] || [0,0,0,0];
                  
                  // Count completed tokens
                  const maxSteps = 14 * (room.settings.playerCount) + 5;
                  const finishedCount = tokenSteps.filter(step => step === maxSteps).length;

                  return (
                    <div 
                      key={`status_row_${p.seatIndex}`}
                      className={`player-status-row ${isActive ? 'active' : ''} ${!p.isConnected ? 'disconnected' : ''}`}
                      style={{
                        '--player-color': COLORS[p.seatIndex],
                        '--player-color-glow': `${COLORS[p.seatIndex]}33`,
                        '--player-color-rgb': p.seatIndex === 0 ? '255, 77, 109' : undefined // approximate red glow fallback
                      }}
                    >
                      <div className="player-info-left">
                        <span className={`status-indicator ${p.isConnected ? 'status-online' : 'status-offline'}`} />
                        <span style={{ fontWeight: 800, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          {p.name}
                          {p.isHost && <Crown size={12} style={{ color: '#f1c40f' }} />}
                          {p.isBot && <Bot size={12} style={{ color: '#cbd5e1' }} />}
                        </span>
                      </div>

                      {/* Display token progress indicator dots */}
                      <div className="token-progress-dots">
                        {tokenSteps.map((step, idx) => {
                          const isFinished = step === maxSteps;
                          const inYard = step === 0;
                          let symbol = 'Y';
                          if (isFinished) symbol = '✓';
                          else if (!inYard) symbol = 'T';

                          return (
                            <span 
                              key={`t_prog_${idx}`} 
                              className={`progress-dot ${isFinished ? 'finished' : ''}`}
                              title={`Token ${idx+1}: Step ${step}`}
                            >
                              {symbol}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Desktop Dice controls */}
            <Dice
              rollValue={room?.gameState?.diceRoll}
              isSpinning={isDiceRolling}
              isMyTurn={isMyTurn}
              hasRolled={room?.gameState?.hasRolled}
              onRoll={rollDice}
            />

            {/* Chat and action logs feed panel */}
            <div className="chat-card glass-panel">
              <div className="chat-messages">
                {mergedChatLogs.map((log, idx) => (
                  <div key={`chat_${idx}`} className="chat-row">
                    <span 
                      className="chat-sender" 
                      style={{ color: log.type === 'system' ? 'var(--text-muted)' : log.color }}
                    >
                      {log.sender}:
                    </span>
                    <span style={{ color: log.type === 'system' ? 'var(--text-muted)' : 'var(--text-primary)', fontStyle: log.type === 'system' ? 'italic' : 'normal' }}>
                      {log.message}
                    </span>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>

              {!isSameDevice && !me?.isSpectator && (
                <form onSubmit={handleSendChat} className="chat-input-area">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Type message..."
                    className="chat-input"
                  />
                  <button type="submit" className="btn btn-secondary btn-icon-only" style={{ width: '32px', height: '32px' }}>
                    <Send size={12} />
                  </button>
                </form>
              )}
            </div>

            {/* Host gameplay controller overrides */}
            {me?.isHost && (
              <button 
                onClick={() => {
                  if (window.confirm('Abort game and return to lobby?')) {
                    restartGame();
                  }
                }}
                className="btn btn-secondary"
                style={{ width: '100%', padding: '0.85rem' }}
              >
                Reset Match
              </button>
            )}
          </div>

          {/* MOBILE ACTION DRAWER */}
          <div className="mobile-action-bar" style={{ display: window.innerWidth <= 640 ? 'flex' : 'none' }}>
            <div className="mobile-action-info">
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {isMyTurn ? 'Your Turn' : `${activePlayer ? activePlayer.name : 'Opponent'}'s Turn`}
              </span>
              <span style={{ fontWeight: 800, fontSize: '0.95rem' }}>
                {isDiceRolling ? 'Rolling...' : room?.gameState?.diceRoll ? `Rolled: ${room.gameState.diceRoll}` : 'Waiting for roll'}
              </span>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {isMyTurn && !room?.gameState?.hasRolled && (
                <button onClick={rollDice} className="btn btn-success" style={{ padding: '0.5rem 1rem' }}>
                  Roll Dice
                </button>
              )}

              {isMyTurn && room?.gameState?.hasRolled && diceMovableTokens.length > 0 && (
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                  {diceMovableTokens.map((tIdx) => (
                    <button
                      key={`mob_mv_${tIdx}`}
                      onClick={() => moveToken(tIdx)}
                      className="btn btn-primary"
                      style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem' }}
                    >
                      Mv {tIdx + 1}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </main>
      )}

      {/* PAGE 6: Rankings and punishment */}
      {view === 'rankings' && (
        <PunishmentCard
          room={room}
          playerId={playerId}
          onRestart={restartGame}
        />
      )}

      {/* PAGE 7: Match History Screen */}
      {view === 'history' && (
        <div className="page-history glass-panel">
          <div className="setup-header">
            <button onClick={() => setView('landing')} className="btn btn-secondary btn-icon-only">
              <ArrowLeft size={16} />
            </button>
            <h2 className="setup-title">Match History</h2>
          </div>

          <div className="match-history-list">
            {matchHistory.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem' }}>
                No completed matches found in database. Run a match to log results!
              </p>
            ) : (
              matchHistory.map((match, idx) => (
                <div key={`history_match_${idx}`} className="history-card glass-panel" style={{ background: 'var(--bg-secondary)' }}>
                  <div className="history-left">
                    <span className="history-winners">Winner: {match.rankings[0]}</span>
                    <span className="history-date">
                      Seats: {match.playerCount} • {new Date(match.date).toLocaleDateString()}
                    </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Players: {match.players.map(p => p.name).join(', ')}
                    </span>
                  </div>

                  {match.punishmentEnabled && match.bathroomDuty.length > 0 && (
                    <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <span className="history-punished">{match.punishmentName} Losers:</span>
                      <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>
                        {match.bathroomDuty.join(' & ')}
                      </span>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* PAGE 8: Rules Screen */}
      {view === 'rules' && (
        <div className="page-history glass-panel" style={{ maxWidth: '750px' }}>
          <div className="setup-header">
            <button onClick={() => setView('landing')} className="btn btn-secondary btn-icon-only">
              <ArrowLeft size={16} />
            </button>
            <h2 className="setup-title">Ludo Rules & Settings</h2>
          </div>

          <div className="rules-container">
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Standard Gameplay Rules</h3>
            <ul className="rules-list">
              <li><strong>Unlocking Tokens:</strong> A player must roll a 6 to release a token from their Home Yard to the Starting Cell.</li>
              <li><strong>Turns Cycler:</strong> Turns cycle clockwise around the radial arms. The active player is highlighted in a glowing colored border matching their sector.</li>
              <li><strong>Extra Turns:</strong> Rolling a 6, capturing an opponent, or landing a token in the Home Center grants the player an extra turn.</li>
              <li><strong>Three 6s Forfeit:</strong> If a player rolls a 6 three times consecutively, their third roll is discarded and their turn is forfeited immediately.</li>
              <li><strong>Capturing:</strong> Landing on a cell occupied by an opponent's token sends that opponent back to the Yard. Exception: Safe Cells.</li>
              <li><strong>Safe Cells:</strong> Marked with a yellow border and star ★. Multiple player tokens can occupy safe cells without capturing each other.</li>
              <li><strong>Finish Path:</strong> After a full lap around the radial board, tokens turn inwards along their middle Home Path. Landing in the center requires an exact roll count.</li>
            </ul>

            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginTop: '1rem' }}>Local Network (Wi-Fi) Instructions</h3>
            <p className="setting-desc">
              When launching a Local Network room, ensure all players are connected to the same Wi-Fi router. 
              The host will see a QR code which other players can scan with their phone cameras to join instantly. 
              Otherwise, players can manually type in the local IP link displayed by the host.
            </p>

            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginTop: '1rem' }}>Bathroom Duty Punishment</h3>
            <p className="setting-desc">
              The game runs until all active players have finished the board. At completion, the final two players who are in last and second-to-last places are selected to clean the bathroom. The results screen assigns the chore, requiring the losers to click "I Accept Bathroom Duty" before the room restarts.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
