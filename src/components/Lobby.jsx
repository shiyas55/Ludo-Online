// src/components/Lobby.jsx
import React, { useEffect, useState, useMemo } from 'react';
import QRCode from 'qrcode';
import { Copy, UserMinus, Plus, Shield, Settings, Play } from 'lucide-react';
import { COLORS } from '../utils/geometry';

export default function Lobby({ 
  room, 
  playerId, 
  onToggleReady, 
  onSelectSeat, 
  onChangePlayerCount, 
  onKickPlayer, 
  onConfigurePunishment, 
  onStartGame 
}) {
  const [qrUrl, setQrUrl] = useState('');
  const [copyStatus, setCopyStatus] = useState('Copy Link');
  const [punishmentName, setPunishmentName] = useState(room?.settings?.bathroomChallenge?.name || 'Bathroom Challenge');

  const me = useMemo(() => room?.players?.find(p => p.id === playerId), [room, playerId]);
  const isHost = me?.isHost;
  const N = room?.settings?.playerCount || 4;

  // Generate local join link QR code
  useEffect(() => {
    if (room?.roomId) {
      // Create join link pointing back to current client page
      const joinLink = `${window.location.origin}/?join=${room.roomId}`;
      QRCode.toDataURL(joinLink, { width: 180, margin: 1, color: { dark: '#0b0f19', light: '#ffffff' } })
        .then(url => setQrUrl(url))
        .catch(err => console.error('Error creating QR code:', err));
    }
  }, [room?.roomId]);

  // Copy share link
  const handleCopyLink = () => {
    const joinLink = `${window.location.origin}/?join=${room?.roomId}`;
    navigator.clipboard.writeText(joinLink).then(() => {
      setCopyStatus('Copied!');
      setTimeout(() => setCopyStatus('Copy Link'), 2000);
    });
  };

  // Handle seat click
  const handleSeatClick = (seatIdx) => {
    if (me && !me.isSpectator && me.seatIndex !== seatIdx) {
      onSelectSeat(seatIdx);
    }
  };

  // Handle punishment name submission
  const handlePunishmentSubmit = (e) => {
    e.preventDefault();
    onConfigurePunishment(room?.settings?.bathroomChallenge?.enabled !== false, punishmentName);
  };

  // Check if starting conditions are met
  // We need at least 2 human players to start online games, or any count for local/bots
  const canStart = useMemo(() => {
    const readyPlayersCount = room?.players?.filter(p => p.isReady || p.isSpectator).length;
    const totalPlayers = room?.players?.length || 0;
    return readyPlayersCount === totalPlayers && totalPlayers >= 1;
  }, [room]);

  return (
    <div className="lobby-layout">
      {/* Main Lobby setup cards */}
      <div className="lobby-main glass-panel">
        <h2 className="setup-title">Ludo Lobby Room</h2>
        <p className="setting-desc" style={{ marginTop: '-0.5rem' }}>
          Select a seat, configure colors, and wait for players to join.
        </p>

        {/* Seat / Color Picker Grid */}
        <div className="settings-section">
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Choose Your Seat & Color</h3>
          <div className="color-picker-grid">
            {Array.from({ length: N }).map((_, seatIdx) => {
              const occupant = room?.players?.find(p => !p.isSpectator && p.seatIndex === seatIdx);
              const isOccupied = !!occupant;
              const isMe = occupant?.id === playerId;
              
              let label = occupant ? occupant.name : `Seat ${seatIdx + 1}`;
              if (isMe) label = 'You';

              return (
                <div
                  key={`seat_picker_${seatIdx}`}
                  className={`color-option ${isMe ? 'selected' : ''} ${isOccupied && !isMe ? 'occupied' : ''}`}
                  style={{ 
                    backgroundColor: occupant ? undefined : '#2d3748',
                    background: occupant ? `linear-gradient(135deg, ${COLORS[seatIdx]} 0%, #1a202c 100%)` : undefined,
                    border: isMe ? `3px solid white` : undefined
                  }}
                  onClick={() => !isOccupied && handleSeatClick(seatIdx)}
                >
                  <span style={{ fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80px', padding: '0 4px' }}>
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Players List in Lobby */}
        <div className="settings-section">
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Connected Players ({room?.players?.length})</h3>
          <div className="player-list">
            {room?.players?.map((player) => (
              <div key={player.id} className="player-item">
                <div className="player-info">
                  <div 
                    className="player-avatar" 
                    style={{ 
                      borderColor: player.isSpectator ? '#cbd5e1' : COLORS[player.seatIndex],
                      boxShadow: player.isSpectator ? undefined : `0 0 8px ${COLORS[player.seatIndex]}`
                    }}
                  >
                    {player.isSpectator ? '👁' : player.avatar}
                  </div>
                  <div className="player-name-text">
                    {player.name}
                    {player.isHost && <span className="host-badge"><Shield size={12} style={{ display: 'inline', marginRight: '2px' }} /> Host</span>}
                    {player.isSpectator && <span className="host-badge" style={{ background: 'rgba(203, 213, 225, 0.15)', color: '#cbd5e1' }}>Spectator</span>}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  {player.isReady ? (
                    <span className="ready-badge">Ready</span>
                  ) : (
                    <span className="not-ready-badge">Not Ready</span>
                  )}

                  {isHost && !player.isHost && (
                    <button 
                      onClick={() => onKickPlayer(player.id)}
                      className="btn btn-secondary btn-icon-only" 
                      title="Kick Player"
                      style={{ width: '32px', height: '32px', color: '#ef4444' }}
                    >
                      <UserMinus size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Host Game Settings */}
        {isHost && (
          <div className="settings-section" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}><Settings size={18} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'text-bottom' }} /> Game Settings</h3>
            
            {/* Player Count Picker */}
            <div className="setting-row">
              <div className="setting-info">
                <span className="setting-title">Total Seats</span>
                <span className="setting-desc">Set max players (empty seats backfilled with bots)</span>
              </div>
              <div className="player-count-picker">
                {[4, 6, 7, 8, 9].map((count) => (
                  <button
                    key={`count_btn_${count}`}
                    onClick={() => onChangePlayerCount(count)}
                    className={`count-btn ${N === count ? 'active' : ''}`}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </div>

            {/* Bathroom Challenge Config */}
            <div className="setting-row" style={{ alignItems: 'flex-start' }}>
              <div className="setting-info">
                <span className="setting-title">Bathroom Punishment Challenge</span>
                <span className="setting-desc">Last two players must clean the bathroom</span>
              </div>
              <label className="switch">
                <input 
                  type="checkbox" 
                  checked={room?.settings?.bathroomChallenge?.enabled !== false}
                  onChange={(e) => onConfigurePunishment(e.target.checked, punishmentName)}
                />
                <span className="slider"></span>
              </label>
            </div>

            {room?.settings?.bathroomChallenge?.enabled !== false && (
              <form onSubmit={handlePunishmentSubmit} style={{ display: 'flex', gap: '0.5rem', marginTop: '-0.5rem' }}>
                <input
                  type="text"
                  value={punishmentName}
                  onChange={(e) => setPunishmentName(e.target.value)}
                  placeholder="Rename Punishment..."
                  className="text-input"
                  style={{ flex: 1, padding: '0.5rem 0.75rem', fontSize: '0.9rem' }}
                />
                <button type="submit" className="btn btn-secondary" style={{ padding: '0 1rem', fontSize: '0.85rem' }}>
                  Rename
                </button>
              </form>
            )}
          </div>
        )}

        {/* Start / Ready Buttons */}
        <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem' }}>
          {!isHost && !me?.isSpectator && (
            <button 
              onClick={onToggleReady} 
              className={`btn ${me?.isReady ? 'btn-secondary' : 'btn-success'}`}
              style={{ flex: 1, padding: '1rem' }}
            >
              {me?.isReady ? 'Cancel Ready' : 'Ready to Play!'}
            </button>
          )}

          {isHost && (
            <button 
              onClick={onStartGame} 
              disabled={!canStart}
              className="btn btn-primary"
              style={{ flex: 1, padding: '1rem', opacity: canStart ? 1 : 0.6, cursor: canStart ? 'pointer' : 'not-allowed' }}
            >
              <Play size={18} /> Start Match
            </button>
          )}
        </div>
      </div>

      {/* Share room sidebar */}
      <div className="lobby-side glass-panel">
        <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Invite Friends</h3>
        <p className="setting-desc">Share room credentials or let friends scan this screen to join instantly.</p>
        
        <div className="share-section">
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)' }}>ROOM CODE</span>
          <div className="room-code-box">
            <span className="room-code-text">{room?.roomId}</span>
            <button 
              onClick={() => navigator.clipboard.writeText(room?.roomId)}
              className="btn btn-secondary btn-icon-only"
              style={{ width: '32px', height: '32px' }}
            >
              <Copy size={14} />
            </button>
          </div>

          <button onClick={handleCopyLink} className="btn btn-secondary" style={{ width: '100%' }}>
            <Copy size={16} /> {copyStatus}
          </button>
        </div>

        {qrUrl && (
          <div className="share-section" style={{ alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)' }}>QR JOIN CODE (LAN/WI-FI)</span>
            <div className="qr-code-wrapper">
              <img src={qrUrl} alt="Join QR Code" style={{ width: '100%', height: '100%' }} />
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>
              Ensure players are connected to the same local network when playing via Wi-Fi.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
