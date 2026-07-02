// src/components/Dice.jsx
import React, { useState, useEffect } from 'react';

// Web Audio API Synthesizer for retro dice rolling sounds
function synthesizeRollSound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    // 1. Rolling beeps (short rapid clicks/beeps)
    for (let i = 0; i < 6; i++) {
      const time = ctx.currentTime + i * 0.12;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(150 + i * 80, time);
      osc.frequency.exponentialRampToValueAtTime(80, time + 0.08);
      
      gain.gain.setValueAtTime(0.15, time);
      gain.gain.exponentialRampToValueAtTime(0.01, time + 0.08);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(time);
      osc.stop(time + 0.09);
    }

    // 2. Final landing ding
    setTimeout(() => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5 note
      osc.frequency.exponentialRampToValueAtTime(293.66, ctx.currentTime + 0.25); // D4 note
      
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.28);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    }, 650);

  } catch (err) {
    console.warn('Web Audio Context not allowed or initialized yet:', err);
  }
}

export default function Dice({ rollValue, isSpinning, isMyTurn, hasRolled, onRoll }) {
  const [internalSpin, setInternalSpin] = useState(false);

  useEffect(() => {
    if (isSpinning) {
      setInternalSpin(true);
      synthesizeRollSound();
    } else {
      setInternalSpin(false);
    }
  }, [isSpinning]);

  const handleDiceClick = () => {
    if (isMyTurn && !hasRolled && !isSpinning) {
      onRoll();
    }
  };

  const getDiceClass = () => {
    if (internalSpin) return 'spinning';
    if (rollValue) return `rolled-${rollValue}`;
    return 'rolled-1'; // default face
  };

  return (
    <div className="control-card glass-panel">
      <div className="turn-heading">
        {isMyTurn ? (
          <span style={{ color: '#10b981' }}>★ Your Turn ★</span>
        ) : (
          <span style={{ color: 'var(--text-secondary)' }}>Waiting for opponent...</span>
        )}
      </div>

      <div 
        className={`dice-container-3d ${isMyTurn && !hasRolled && !isSpinning ? 'pulse-hover' : ''}`}
        onClick={handleDiceClick}
        style={{ cursor: isMyTurn && !hasRolled && !isSpinning ? 'pointer' : 'default' }}
      >
        <div className={`dice-cube ${getDiceClass()}`}>
          {/* Face 1 */}
          <div className="dice-face face-1">
            <div className="pip"></div>
          </div>
          {/* Face 2 */}
          <div className="dice-face face-2">
            <div className="pip"></div>
            <div className="pip"></div>
          </div>
          {/* Face 3 */}
          <div className="dice-face face-3">
            <div className="pip"></div>
            <div className="pip"></div>
            <div className="pip"></div>
          </div>
          {/* Face 4 */}
          <div className="dice-face face-4">
            <div className="pip"></div>
            <div className="pip"></div>
            <div className="pip"></div>
            <div className="pip"></div>
          </div>
          {/* Face 5 */}
          <div className="dice-face face-5">
            <div className="pip"></div>
            <div className="pip"></div>
            <div className="pip"></div>
            <div className="pip"></div>
            <div className="pip"></div>
          </div>
          {/* Face 6 */}
          <div className="dice-face face-6">
            <div className="pip"></div>
            <div className="pip"></div>
            <div className="pip"></div>
            <div className="pip"></div>
            <div className="pip"></div>
            <div className="pip"></div>
          </div>
        </div>
      </div>

      <div className="dice-status-label" style={{ fontSize: '0.85rem', fontWeight: 600 }}>
        {isSpinning && 'Rolling...'}
        {!isSpinning && rollValue && `Rolled a ${rollValue}!`}
        {!isSpinning && !rollValue && isMyTurn && 'Click to Roll!'}
        {!isSpinning && !rollValue && !isMyTurn && 'Opponent is preparing...'}
      </div>
    </div>
  );
}
