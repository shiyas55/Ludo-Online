// src/utils/geometry.js

// Board geometry constants
export const BOARD_SIZE = 1000;
export const CENTER_X = BOARD_SIZE / 2;
export const CENTER_Y = BOARD_SIZE / 2;
export const R_CENTER = 95;
export const R_INNER = 160;
export const R_OUTER = 370;
export const R_YARD = 440;
export const R_INNER_TRANSITION = 135;

export const COLORS = [
  'red',    // Player 0
  'green',  // Player 1
  'yellow', // Player 2
  'blue',   // Player 3
  'purple', // Player 4
  'orange', // Player 5
  'pink',   // Player 6
  'cyan',   // Player 7
  'indigo'  // Player 8
];

/**
 * Calculates (x, y) coordinates for a given radius and angle
 */
export function polarToCartesian(r, angleRad) {
  return {
    x: CENTER_X + r * Math.cos(angleRad),
    y: CENTER_Y + r * Math.sin(angleRad)
  };
}

/**
 * Computes base angle for a player seat index
 */
export function getBaseAngle(playerSeatIndex, N) {
  // Subtract PI/2 to align player 0 at the top vertical
  return (playerSeatIndex * 2 * Math.PI) / N - Math.PI / 2;
}

/**
 * Generates all track cells coordinates for N players
 */
export function generateTrackCells(N) {
  const cells = [];
  const deltaR = (R_OUTER - R_INNER) / 5;
  const beta = (0.42 * Math.PI) / N; // Width of the arm sector

  for (let i = 0; i < N; i++) {
    const Ai = getBaseAngle(i, N);

    for (let c = 0; c < 14; c++) {
      let r, angle;
      
      if (c <= 4) {
        // Right column (going outwards)
        r = R_INNER + c * deltaR;
        angle = Ai + beta;
      } else if (c === 5) {
        // Outer right
        r = R_OUTER;
        angle = Ai + beta;
      } else if (c === 6) {
        // Outer middle
        r = R_OUTER;
        angle = Ai;
      } else if (c === 7) {
        // Outer left
        r = R_OUTER;
        angle = Ai - beta;
      } else if (c >= 8 && c <= 12) {
        // Left column (going inwards)
        r = R_INNER + (12 - c) * deltaR;
        angle = Ai - beta;
      } else if (c === 13) {
        // Inner transition (valley curve)
        r = R_INNER_TRANSITION;
        angle = Ai + Math.PI / N;
      }

      const { x, y } = polarToCartesian(r, angle);
      cells.push({
        id: `track_${i * 14 + c}`,
        globalIndex: i * 14 + c,
        armIndex: i,
        localIndex: c,
        x,
        y,
        isSafe: c === 3 || c === 8,
        isStart: c === 8,
        color: c === 8 ? i : null // start cell matches player color
      });
    }
  }
  return cells;
}

/**
 * Generates home path cells for player seat index i
 */
export function generateHomePathCells(playerSeatIndex, N) {
  const cells = [];
  const deltaR = (R_OUTER - R_INNER) / 5;
  const Ai = getBaseAngle(playerSeatIndex, N);

  // Home path has 5 cells going inwards
  for (let h = 0; h < 5; h++) {
    const r = R_OUTER - (h + 1) * deltaR;
    const { x, y } = polarToCartesian(r, Ai);
    cells.push({
      id: `home_${playerSeatIndex}_${h}`,
      playerSeatIndex,
      cellIndex: h,
      x,
      y
    });
  }
  return cells;
}

/**
 * Generates yard slots coordinates for player i
 */
export function generateYardSlots(playerSeatIndex, N) {
  const Ai = getBaseAngle(playerSeatIndex, N);
  const yardCenter = polarToCartesian(R_YARD, Ai);
  
  // Arrange 4 tokens inside the yard in a 2x2 grid
  const offset = 18;
  return [
    { x: yardCenter.x - offset, y: yardCenter.y - offset },
    { x: yardCenter.x + offset, y: yardCenter.y - offset },
    { x: yardCenter.x - offset, y: yardCenter.y + offset },
    { x: yardCenter.x + offset, y: yardCenter.y + offset }
  ];
}

/**
 * Calculates coordinates for the center wedges (Home triangles)
 */
export function getWedgePath(playerSeatIndex, N) {
  const Ai = getBaseAngle(playerSeatIndex, N);
  const startAngle = Ai - Math.PI / N;
  const endAngle = Ai + Math.PI / N;

  const start = polarToCartesian(R_CENTER, startAngle);
  const end = polarToCartesian(R_CENTER, endAngle);

  // SVG arc path back to center
  return `M ${CENTER_X} ${CENTER_Y} L ${start.x} ${start.y} A ${R_CENTER} ${R_CENTER} 0 0 1 ${end.x} ${end.y} Z`;
}

/**
 * Calculates the exact token coordinates, including stacking offsets
 * if multiple tokens occupy the same cell.
 */
export function getTokenCoordinates(cellType, seatIndex, tokenIndex, step, gameState, N) {
  const maxSteps = 14 * N + 5;
  
  // 1. Token in Yard
  if (step === 0) {
    const slots = generateYardSlots(seatIndex, N);
    return slots[tokenIndex];
  }

  // 2. Token in Home Center (Finished)
  if (step === maxSteps) {
    const Ai = getBaseAngle(seatIndex, N);
    // Arrange finished tokens in a neat ring inside the center area
    const offsetRadius = 35 + (tokenIndex * 8);
    const offsetAngle = Ai + (tokenIndex - 1.5) * 0.25;
    return polarToCartesian(offsetRadius, offsetAngle);
  }

  // 3. Find other tokens occupying the same space to apply stacking offsets
  let cellId = '';
  let baseCoords = { x: CENTER_X, y: CENTER_Y };

  if (step >= 1 && step <= 14 * N - 1) {
    // On track
    const startCell = seatIndex * 14 + 8;
    const globalIdx = (startCell + step - 1) % (14 * N);
    cellId = `track_${globalIdx}`;
    
    // Find the base track cell coordinate
    const trackCells = generateTrackCells(N);
    const cellObj = trackCells.find(c => c.globalIndex === globalIdx);
    if (cellObj) {
      baseCoords = { x: cellObj.x, y: cellObj.y };
    }
  } else {
    // In Home path
    const homeIdx = step - (14 * N); // 0 to 4
    cellId = `home_${seatIndex}_${homeIdx}`;
    const homeCells = generateHomePathCells(seatIndex, N);
    const cellObj = homeCells[homeIdx];
    if (cellObj) {
      baseCoords = { x: cellObj.x, y: cellObj.y };
    }
  }

  // Find all tokens in the game that are on this exact cell
  const tokensOnSameCell = [];
  
  if (gameState && gameState.tokens) {
    Object.keys(gameState.tokens).forEach(sIdxStr => {
      const sIdx = parseInt(sIdxStr, 10);
      const tokenSteps = gameState.tokens[sIdx];
      if (tokenSteps) {
        tokenSteps.forEach((tStep, tIdx) => {
          let tCellId = '';
          if (tStep >= 1 && tStep <= 14 * N - 1) {
            const startCell = sIdx * 14 + 8;
            tCellId = `track_${(startCell + tStep - 1) % (14 * N)}`;
          } else if (tStep > 0 && tStep < maxSteps) {
            tCellId = `home_${sIdx}_${tStep - (14 * N)}`;
          }

          if (tCellId === cellId) {
            tokensOnSameCell.push({ seatIndex: sIdx, tokenIndex: tIdx });
          }
        });
      }
    });
  }

  // If there's only one token on the cell, return base coordinates
  if (tokensOnSameCell.length <= 1) {
    return baseCoords;
  }

  // Sort them to have deterministic arrangement
  tokensOnSameCell.sort((a, b) => {
    if (a.seatIndex !== b.seatIndex) return a.seatIndex - b.seatIndex;
    return a.tokenIndex - b.tokenIndex;
  });

  // Find our position index in the stack
  const myIdx = tokensOnSameCell.findIndex(
    t => t.seatIndex === seatIndex && t.tokenIndex === tokenIndex
  );

  // Apply a flower-like offset based on the number of stacked tokens
  const count = tokensOnSameCell.length;
  const radius = count > 3 ? 12 : 8;
  const angleOffset = (2 * Math.PI) / count;
  const myAngle = myIdx * angleOffset - Math.PI / 2;

  return {
    x: baseCoords.x + radius * Math.cos(myAngle),
    y: baseCoords.y + radius * Math.sin(myAngle)
  };
}
