// src/components/RadialBoard.jsx
import React, { useMemo } from 'react';
import { 
  generateTrackCells, 
  generateHomePathCells, 
  getWedgePath, 
  getTokenCoordinates,
  COLORS,
  BOARD_SIZE,
  CENTER_X,
  CENTER_Y,
  R_CENTER,
  R_YARD
} from '../utils/geometry';

export default function RadialBoard({ room, playerId, diceMovableTokens, onTokenClick }) {
  const N = useMemo(() => room?.settings?.playerCount || 4, [room]);
  const gameState = room?.gameState;

  // Generate cells based on N players
  const trackCells = useMemo(() => generateTrackCells(N), [N]);
  
  const homePathCellsBySeat = useMemo(() => {
    const paths = {};
    for (let i = 0; i < N; i++) {
      paths[i] = generateHomePathCells(i, N);
    }
    return paths;
  }, [N]);

  // Identify local player info
  const me = useMemo(() => {
    return room?.players?.find(p => p.id === playerId);
  }, [room, playerId]);

  const activeSeat = gameState?.activeSeats?.[gameState?.turnIndex];
  const isMyTurn = me && me.seatIndex === activeSeat && gameState?.hasRolled;

  // Render tokens
  const renderedTokens = useMemo(() => {
    if (!gameState || !gameState.tokens) return [];

    const tokensList = [];
    room.players.forEach(player => {
      if (player.isSpectator) return;
      const seat = player.seatIndex;
      const playerTokens = gameState.tokens[seat];

      if (playerTokens) {
        playerTokens.forEach((step, tokenIdx) => {
          const coords = getTokenCoordinates('track', seat, tokenIdx, step, gameState, N);
          
          // Check if this token is movable right now
          const isMovable = isMyTurn && diceMovableTokens.includes(tokenIdx);
          
          tokensList.push({
            seatIndex: seat,
            tokenIndex: tokenIdx,
            playerName: player.name,
            step,
            coords,
            isMovable,
            color: COLORS[seat]
          });
        });
      }
    });

    return tokensList;
  }, [gameState, room, isMyTurn, diceMovableTokens, N]);

  // Helper to translate color name to standard hex/hsl values for CSS
  const getHexColor = (colorName) => {
    switch (colorName) {
      case 'red': return '#ff4d6d';
      case 'green': return '#2ecc71';
      case 'yellow': return '#f1c40f';
      case 'blue': return '#3498db';
      case 'purple': return '#9b59b6';
      case 'orange': return '#e67e22';
      case 'pink': return '#e91e63';
      case 'cyan': return '#1abc9c';
      case 'indigo': return '#3f51b5';
      default: return '#7f8c8d';
    }
  };

  return (
    <div className="board-container">
      <svg viewBox={`0 0 ${BOARD_SIZE} ${BOARD_SIZE}`} className="board-svg">
        {/* Outer Circular Board Background */}
        <circle 
          cx={CENTER_X} 
          cy={CENTER_Y} 
          r={490} 
          className="board-background"
        />

        {/* Outer Border Decor Ring */}
        <circle 
          cx={CENTER_X} 
          cy={CENTER_Y} 
          r={480} 
          fill="none"
          stroke="#475569"
          strokeWidth="3.5"
          strokeDasharray="10 15"
          opacity="0.3"
        />

        {/* Center Wedge Areas (Finished Home Triangles) */}
        <g id="center-wedges">
          {Array.from({ length: N }).map((_, i) => (
            <path
              key={`wedge_${i}`}
              d={getWedgePath(i, N)}
              fill={getHexColor(COLORS[i])}
              opacity="0.25"
              stroke="#1e293b"
              strokeWidth="2"
            />
          ))}
          {/* Central Finished Ring Area */}
          <circle 
            cx={CENTER_X} 
            cy={CENTER_Y} 
            r={R_CENTER} 
            fill="none" 
            stroke="#1e293b" 
            strokeWidth="3.5"
          />
          <circle 
            cx={CENTER_X} 
            cy={CENTER_Y} 
            r={30} 
            fill="#1e293b" 
            opacity="0.6"
          />
        </g>

        {/* Track Cells */}
        <g id="track-cells">
          {trackCells.map((cell) => (
            <circle
              key={cell.id}
              cx={cell.x}
              cy={cell.y}
              r={16}
              className={`cell-track ${cell.isSafe ? 'safe-zone' : ''} ${cell.isStart ? 'start-cell' : ''}`}
              fill={cell.color !== null ? getHexColor(COLORS[cell.color]) : undefined}
              fillOpacity={cell.color !== null ? 0.35 : undefined}
              stroke={cell.color !== null ? getHexColor(COLORS[cell.color]) : undefined}
            />
          ))}
          {/* Safe Cell Star Overlay Decor */}
          {trackCells.filter(c => c.isSafe).map(cell => (
            <text
              key={`star_${cell.id}`}
              x={cell.x}
              y={cell.y + 4.5}
              textAnchor="middle"
              fontSize="13"
              fill="#f1c40f"
              fontWeight="900"
            >
              ★
            </text>
          ))}
        </g>

        {/* Home Path Cells */}
        <g id="home-paths">
          {Array.from({ length: N }).map((_, i) => (
            <g key={`home_path_group_${i}`}>
              {homePathCellsBySeat[i].map((cell) => (
                <circle
                  key={cell.id}
                  cx={cell.x}
                  cy={cell.y}
                  r={15}
                  fill={getHexColor(COLORS[i])}
                  fillOpacity="0.45"
                  stroke={getHexColor(COLORS[i])}
                  strokeWidth="1.5"
                />
              ))}
            </g>
          ))}
        </g>

        {/* Player Yards (Starting Circles) */}
        <g id="player-yards">
          {Array.from({ length: N }).map((_, i) => {
            const angle = (i * 2 * Math.PI) / N - Math.PI / 2;
            const yardCenter = {
              x: CENTER_X + R_YARD * Math.cos(angle),
              y: CENTER_Y + R_YARD * Math.sin(angle)
            };
            return (
              <g key={`yard_group_${i}`}>
                {/* Large outer yard ring */}
                <circle
                  cx={yardCenter.x}
                  cy={yardCenter.y}
                  r={48}
                  fill="#0b0f19"
                  stroke={getHexColor(COLORS[i])}
                  strokeWidth="3.5"
                  filter="drop-shadow(0 4px 10px rgba(0, 0, 0, 0.45))"
                />
                <circle
                  cx={yardCenter.x}
                  cy={yardCenter.y}
                  r={42}
                  fill={getHexColor(COLORS[i])}
                  fillOpacity="0.15"
                />
                
                {/* 4 yard slot markers */}
                <circle cx={yardCenter.x - 18} cy={yardCenter.y - 18} r={8} fill={getHexColor(COLORS[i])} fillOpacity="0.4" />
                <circle cx={yardCenter.x + 18} cy={yardCenter.y - 18} r={8} fill={getHexColor(COLORS[i])} fillOpacity="0.4" />
                <circle cx={yardCenter.x - 18} cy={yardCenter.y + 18} r={8} fill={getHexColor(COLORS[i])} fillOpacity="0.4" />
                <circle cx={yardCenter.x + 18} cy={yardCenter.y + 18} r={8} fill={getHexColor(COLORS[i])} fillOpacity="0.4" />
                
                {/* Display player name below yard */}
                <text
                  x={yardCenter.x}
                  y={yardCenter.y + 64}
                  textAnchor="middle"
                  fill="#94a3b8"
                  fontSize="12"
                  fontWeight="600"
                >
                  {room?.players?.find(p => !p.isSpectator && p.seatIndex === i)?.name || `Bot ${i + 1}`}
                </text>
              </g>
            );
          })}
        </g>

        {/* Tokens Layer */}
        <g id="tokens">
          {renderedTokens.map((token, index) => (
            <g
              key={`token_render_${token.seatIndex}_${token.tokenIndex}`}
              className={`ludo-token ${token.isMovable ? 'movable' : ''}`}
              style={{ '--glow-color': getHexColor(token.color) }}
              onClick={() => {
                if (token.isMovable) {
                  onTokenClick(token.tokenIndex);
                }
              }}
            >
              {/* Outer pulsing ring for movable token */}
              {token.isMovable && (
                <circle
                  cx={token.coords.x}
                  cy={token.coords.y}
                  r={22}
                  fill="none"
                  stroke={getHexColor(token.color)}
                  strokeWidth="3.5"
                  strokeDasharray="4 4"
                  opacity="0.8"
                />
              )}
              {/* Token main body */}
              <circle
                cx={token.coords.x}
                cy={token.coords.y}
                r={12.5}
                fill={getHexColor(token.color)}
                stroke="#ffffff"
                strokeWidth="2.5"
                filter="drop-shadow(0 2px 4px rgba(0, 0, 0, 0.4))"
              />
              <circle
                cx={token.coords.x}
                cy={token.coords.y}
                r={6}
                fill="#ffffff"
                opacity="0.4"
              />
              {/* Small Token Identifier Number */}
              <text
                x={token.coords.x}
                y={token.coords.y + 3}
                textAnchor="middle"
                fontSize="9"
                fontWeight="800"
                fill="#1e293b"
              >
                {token.tokenIndex + 1}
              </text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}
