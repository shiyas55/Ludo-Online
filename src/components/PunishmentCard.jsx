// src/components/PunishmentCard.jsx
import React, { useState } from 'react';
import { Trophy, RefreshCw, AlertTriangle } from 'lucide-react';

export default function PunishmentCard({ room, playerId, onRestart }) {
  const [accepted, setAccepted] = useState(false);
  const gameState = room?.gameState;
  const rankings = gameState?.rankings || [];
  
  // Find player seat info
  const me = room?.players?.find(p => p.id === playerId);
  const isHost = me?.isHost;

  // Determine losers for Bathroom Duty
  // The final two players who finish last (i.e. at the bottom of the rankings list)
  const isPunishmentEnabled = room?.settings?.bathroomChallenge?.enabled !== false;
  const punishmentName = room?.settings?.bathroomChallenge?.name || 'Bathroom Duty';

  const losers = [];
  if (isPunishmentEnabled && rankings.length >= 2) {
    const last = rankings[rankings.length - 1];
    const secondLast = rankings[rankings.length - 2];
    losers.push(secondLast, last);
  } else if (isPunishmentEnabled && rankings.length === 1) {
    losers.push(rankings[0]);
  }

  const isMeLoser = me && losers.some(loser => loser.seatIndex === me.seatIndex);

  return (
    <div className="page-punishment glass-panel">
      {/* Trophy Winner Header */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
        <Trophy size={48} style={{ color: '#f1c40f', filter: 'drop-shadow(0 0 12px rgba(241,196,15,0.4))' }} />
        <h2 style={{ fontSize: '2rem', fontWeight: 800 }}>Match Rankings</h2>
        <p className="setting-desc" style={{ marginTop: '-0.3rem' }}>Here are the final standings of the game</p>
      </div>

      {/* Complete Rankings List */}
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', margin: '1rem 0' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontWeight: 700 }}>
            <th style={{ padding: '0.75rem' }}>Rank</th>
            <th style={{ padding: '0.75rem' }}>Player</th>
            <th style={{ padding: '0.75rem' }}>Color</th>
            <th style={{ padding: '0.75rem', textAlign: 'right' }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {rankings.map((rank, idx) => {
            const isWinner = idx === 0;
            const isSecond = idx === 1;
            const isThird = idx === 2;

            let rankLabel = `${idx + 1}`;
            if (isWinner) rankLabel = '🏆 1st';
            else if (isSecond) rankLabel = '🥈 2nd';
            else if (isThird) rankLabel = '🥉 3rd';

            return (
              <tr key={`rank_${idx}`} style={{ borderBottom: '1.5px solid var(--border-color)' }}>
                <td style={{ padding: '0.75rem', fontWeight: isWinner ? 800 : 500, color: isWinner ? '#f1c40f' : undefined }}>
                  {rankLabel}
                </td>
                <td style={{ padding: '0.75rem', fontWeight: 700 }}>
                  {rank.name} {rank.seatIndex === me?.seatIndex && '(You)'}
                </td>
                <td style={{ padding: '0.75rem' }}>
                  <span 
                    style={{ 
                      display: 'inline-block', 
                      width: '12px', 
                      height: '12px', 
                      borderRadius: '50%', 
                      backgroundColor: rank.color,
                      marginRight: '0.5rem',
                      verticalAlign: 'middle',
                      boxShadow: `0 0 6px ${rank.color}`
                    }}
                  />
                  {rank.color}
                </td>
                <td style={{ padding: '0.75rem', textAlign: 'right', color: isWinner ? '#10b981' : 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  {isWinner ? 'Winner!' : 'Completed'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Humorous Bathroom Punishment Board */}
      {isPunishmentEnabled && losers.length > 0 && (
        <div 
          className="settings-section" 
          style={{ 
            width: '100%', 
            border: '2px dashed var(--color-red)', 
            borderRadius: '20px', 
            padding: '1.5rem', 
            background: 'rgba(255, 77, 109, 0.04)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1rem'
          }}
        >
          <div className="bathroom-icon-anim">
            <span style={{ fontSize: '3rem' }}>🚽</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span className="punishment-title">{punishmentName} Assigned!</span>
            <span className="setting-desc">The final two players must wash the bathroom.</span>
          </div>

          <div className="punished-list">
            {losers.map((loser, idx) => (
              <div key={`loser_${idx}`} className="punished-card" style={{ borderColor: 'var(--color-red)' }}>
                <span className="punished-role" style={{ color: 'var(--color-red)' }}>
                  {idx === 0 ? 'Second Last Place' : 'Absolute Last Place'}
                </span>
                <span className="punished-name" style={{ color: 'var(--text-primary)' }}>
                  {loser.name} {loser.seatIndex === me?.seatIndex && '(You)'}
                </span>
              </div>
            ))}
          </div>

          {/* Accept Punishment button */}
          {isMeLoser && !accepted ? (
            <button 
              onClick={() => {
                setAccepted(true);
                // Trigger Web Audio ding or flush if clicked!
                try {
                  const ctx = new (window.AudioContext || window.webkitAudioContext)();
                  const osc = ctx.createOscillator();
                  const gain = ctx.createGain();
                  osc.type = 'sawtooth';
                  osc.frequency.setValueAtTime(100, ctx.currentTime);
                  osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.5);
                  gain.gain.setValueAtTime(0.15, ctx.currentTime);
                  gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.5);
                  osc.connect(gain);
                  gain.connect(ctx.destination);
                  osc.start();
                  osc.stop(ctx.currentTime + 0.6);
                } catch(e) {}
              }}
              className="btn btn-danger" 
              style={{ width: '100%', padding: '1rem', marginTop: '0.5rem' }}
            >
              I Accept {punishmentName}
            </button>
          ) : isMeLoser && accepted ? (
            <div style={{ color: '#10b981', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
              <span>✓ You accepted your fate! Get scrubbing! 🪠</span>
            </div>
          ) : (
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.5rem' }}>
              <AlertTriangle size={14} style={{ color: '#f1c40f' }} /> Waiting for losers to accept duty...
            </div>
          )}
        </div>
      )}

      {/* Restart options (Host only) */}
      {isHost && (
        <button 
          onClick={onRestart}
          className="btn btn-primary"
          style={{ width: '100%', padding: '1.1rem', marginTop: '1rem' }}
        >
          <RefreshCw size={18} /> Play Again (Return to Lobby)
        </button>
      )}
    </div>
  );
}
