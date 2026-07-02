// server/game.js
import { db } from './db.js';

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

// Helper to check if a track cell is a safe cell
export function isSafeCell(globalCellIndex, N) {
  const localCell = globalCellIndex % 14;
  return localCell === 3 || localCell === 8;
}

// Maps a relative token step to the global track cell index
export function stepToGlobalCell(playerSeatIndex, step, N) {
  if (step <= 0 || step > 14 * N - 1) {
    return null; // Yard, Home path, or Finished
  }
  const startingCell = playerSeatIndex * 14 + 8;
  return (startingCell + step - 1) % (14 * N);
}

// Initialize a new game state
export function initGame(players, settings) {
  const N = settings.playerCount || 4;
  
  // Arrange active players by seat index
  const activePlayers = players
    .filter(p => !p.isSpectator)
    .sort((a, b) => a.seatIndex - b.seatIndex);
  
  // Prepare token positions: seatIndex -> array of 4 steps (all 0 initially)
  const tokens = {};
  players.forEach(p => {
    if (!p.isSpectator) {
      tokens[p.seatIndex] = [0, 0, 0, 0];
    }
  });

  const gameState = {
    turnIndex: 0, // Points to index in activeSeats list
    activeSeats: activePlayers.map(p => p.seatIndex),
    diceRoll: null,
    diceState: 'idle', // 'idle', 'rolling', 'rolled'
    hasRolled: false,
    extraTurnCount: 0,
    tokens: tokens,
    rankings: [], // array of objects: { seatIndex, name, color, finishTime }
    logs: ['Game started! Click roll to begin.']
  };

  return gameState;
}

// Roll dice for active player
export function rollDiceState(room, seatIndex) {
  const state = room.gameState;
  const N = room.settings.playerCount;

  if (state.activeSeats[state.turnIndex] !== seatIndex) {
    throw new Error('Not your turn');
  }
  if (state.hasRolled) {
    throw new Error('Already rolled');
  }

  // Roll standard 1-6
  const roll = Math.floor(Math.random() * 6) + 1;
  state.diceRoll = roll;
  state.diceState = 'rolled';
  state.hasRolled = true;

  state.logs.push(`Seat ${seatIndex} rolled a ${roll}!`);

  // 3-sixes check
  if (roll === 6) {
    state.extraTurnCount += 1;
    if (state.extraTurnCount === 3) {
      state.logs.push(`Seat ${seatIndex} rolled three 6s in a row! Turn forfeited.`);
      state.extraTurnCount = 0;
      state.hasRolled = false;
      passTurn(room);
      return { roll, movableTokens: [] };
    }
  } else {
    state.extraTurnCount = 0;
  }

  // Check movable tokens
  const movableTokens = getMovableTokens(state.tokens[seatIndex], roll, N);

  // If no moves are possible, turn passes
  if (movableTokens.length === 0) {
    state.logs.push(`No moves possible for Seat ${seatIndex}.`);
  }

  return { roll, movableTokens };
}

// Check which tokens are movable for a player
export function getMovableTokens(playerTokens, roll, N) {
  const maxSteps = 14 * N + 5;
  const movable = [];
  playerTokens.forEach((step, index) => {
    if (step === 0) {
      if (roll === 6) {
        movable.push(index);
      }
    } else if (step + roll <= maxSteps) {
      movable.push(index);
    }
  });
  return movable;
}

// Pass turn to the next player
export function passTurn(room) {
  const state = room.gameState;
  state.hasRolled = false;
  state.diceRoll = null;
  state.diceState = 'idle';
  state.extraTurnCount = 0;

  // Filter out seats that have finished
  const remainingSeats = state.activeSeats.filter(
    seat => !state.rankings.some(r => r.seatIndex === seat)
  );

  if (remainingSeats.length <= 1) {
    // Game over!
    // Remaining player finishes last
    if (remainingSeats.length === 1) {
      const lastSeat = remainingSeats[0];
      const lastPlayer = room.players.find(p => p.seatIndex === lastSeat);
      state.rankings.push({
        seatIndex: lastSeat,
        name: lastPlayer ? lastPlayer.name : `Bot ${lastSeat}`,
        color: COLORS[lastSeat],
        finishTime: new Date().toISOString()
      });
    }
    room.status = 'finished';
    state.logs.push('Game finished! All active players completed the board.');
    
    // Save match to database
    saveCompletedMatch(room);
    return;
  }

  // Find next player in activeSeats
  let nextIndex = (state.turnIndex + 1) % state.activeSeats.length;
  while (state.rankings.some(r => r.seatIndex === state.activeSeats[nextIndex])) {
    nextIndex = (nextIndex + 1) % state.activeSeats.length;
  }
  state.turnIndex = nextIndex;
  
  const currentSeat = state.activeSeats[state.turnIndex];
  state.logs.push(`It is now Seat ${currentSeat}'s turn.`);
}

// Move selected token
export function moveTokenState(room, seatIndex, tokenIndex) {
  const state = room.gameState;
  const N = room.settings.playerCount;
  const roll = state.diceRoll;

  if (state.activeSeats[state.turnIndex] !== seatIndex) {
    throw new Error('Not your turn');
  }
  if (!state.hasRolled) {
    throw new Error('Must roll first');
  }

  const playerTokens = state.tokens[seatIndex];
  const currentStep = playerTokens[tokenIndex];
  const maxSteps = 14 * N + 5;

  if (currentStep === 0 && roll !== 6) {
    throw new Error('Cannot unlock token without rolling a 6');
  }
  if (currentStep + roll > maxSteps) {
    throw new Error('Movement overshoots finish');
  }

  // Perform movement
  let newStep;
  if (currentStep === 0 && roll === 6) {
    newStep = 1; // Unlock to starting cell
    state.logs.push(`Seat ${seatIndex} unlocked Token ${tokenIndex + 1}!`);
  } else {
    newStep = currentStep + roll;
    state.logs.push(`Seat ${seatIndex} moved Token ${tokenIndex + 1} by ${roll} cells.`);
  }
  playerTokens[tokenIndex] = newStep;

  let extraTurn = false;

  // Handle capture logic
  if (newStep > 0 && newStep <= 14 * N - 1) {
    const globalCell = stepToGlobalCell(seatIndex, newStep, N);
    if (globalCell !== null && !isSafeCell(globalCell, N)) {
      // Find opponent tokens on the same cell
      room.players.forEach(p => {
        if (!p.isSpectator && p.seatIndex !== seatIndex) {
          const oppTokens = state.tokens[p.seatIndex];
          if (oppTokens) {
            oppTokens.forEach((oppStep, oppIdx) => {
              const oppGlobalCell = stepToGlobalCell(p.seatIndex, oppStep, N);
              if (oppGlobalCell === globalCell) {
                // Capture!
                oppTokens[oppIdx] = 0; // Send back to yard
                extraTurn = true;
                state.logs.push(`Seat ${seatIndex} captured Seat ${p.seatIndex}'s Token ${oppIdx + 1}!`);
              }
            });
          }
        }
      });
    }
  }

  // Handle finish logic
  if (newStep === maxSteps) {
    state.logs.push(`Seat ${seatIndex}'s Token ${tokenIndex + 1} finished! 🎉`);
    
    // Check if player has finished all tokens
    const allFinished = playerTokens.every(step => step === maxSteps);
    if (allFinished) {
      const player = room.players.find(p => p.seatIndex === seatIndex);
      state.rankings.push({
        seatIndex: seatIndex,
        name: player ? player.name : `Bot ${seatIndex}`,
        color: COLORS[seatIndex],
        finishTime: new Date().toISOString()
      });
      state.logs.push(`Seat ${seatIndex} has completed the match! 🏆`);
    } else {
      extraTurn = true; // Extra turn for landing a token in home
    }
  }

  // Decide turn transition
  // Rolling a 6 or capturing or finishing a token grants an extra turn
  if (extraTurn || (roll === 6 && state.extraTurnCount > 0)) {
    state.logs.push(`Seat ${seatIndex} gets an extra turn!`);
    state.hasRolled = false;
    state.diceRoll = null;
    state.diceState = 'idle';
  } else {
    passTurn(room);
  }
}

// Bot AI Decision Making
export function handleBotTurn(room) {
  const state = room.gameState;
  const N = room.settings.playerCount;
  const activeSeat = state.activeSeats[state.turnIndex];
  
  // Find current player profile
  const player = room.players.find(p => p.seatIndex === activeSeat);
  if (!player || !player.isBot) return false;

  // Bot Turn Sequence:
  // 1. Roll if not rolled yet
  if (!state.hasRolled) {
    const { roll, movableTokens } = rollDiceState(room, activeSeat);
    return { type: 'roll', roll, movableTokens };
  }

  // 2. Select token to move
  const roll = state.diceRoll;
  const botTokens = state.tokens[activeSeat];
  const movable = getMovableTokens(botTokens, roll, N);

  if (movable.length === 0) {
    // No moves possible, turn was already passed or passes now
    passTurn(room);
    return { type: 'pass' };
  }

  // Heuristic token selection:
  let selectedTokenIdx = movable[0];
  let maxScore = -1000;

  for (const idx of movable) {
    const step = botTokens[idx];
    let score = 0;

    // A: Capturing opponent is highest priority
    const nextStep = step === 0 ? 1 : step + roll;
    const globalCell = stepToGlobalCell(activeSeat, nextStep, N);
    
    if (globalCell !== null && !isSafeCell(globalCell, N)) {
      let capturesOpponent = false;
      room.players.forEach(p => {
        if (!p.isSpectator && p.seatIndex !== activeSeat) {
          const oppTokens = state.tokens[p.seatIndex];
          if (oppTokens) {
            oppTokens.forEach((oppStep) => {
              const oppGlobal = stepToGlobalCell(p.seatIndex, oppStep, N);
              if (oppGlobal === globalCell) capturesOpponent = true;
            });
          }
        }
      });
      if (capturesOpponent) score += 500;
    }

    // B: Reaching Home Center is high priority
    if (nextStep === 14 * N + 5) {
      score += 400;
    }

    // C: Unlocking a token from Yard is high priority
    if (step === 0 && roll === 6) {
      score += 300;
    }

    // D: Escaping danger (opponent is behind us on track and we can land on a safe cell or move away)
    // E: Prefer moving tokens closer to home (higher step counts)
    score += step * 2;

    // F: Avoid leaving safe cell if opponent is nearby (within 6 cells behind)
    const currentGlobalCell = stepToGlobalCell(activeSeat, step, N);
    if (currentGlobalCell !== null && isSafeCell(currentGlobalCell, N)) {
      score -= 50; // penalty for leaving safe zone
    }

    if (score > maxScore) {
      maxScore = score;
      selectedTokenIdx = idx;
    }
  }

  // Execute move
  moveTokenState(room, activeSeat, selectedTokenIdx);
  return { type: 'move', tokenIndex: selectedTokenIdx };
}

// Saves match to local database history and processes Bathroom Punishment
function saveCompletedMatch(room) {
  const state = room.gameState;
  if (!state || state.rankings.length === 0) return;

  const rankingsList = state.rankings.map(r => r.name);
  let bathroomDuty = [];

  if (room.settings.bathroomChallenge && room.settings.bathroomChallenge.enabled) {
    const punishmentName = room.settings.bathroomChallenge.name || 'Bathroom Duty';
    
    // The final two players who finish last (or are last in rankings) are assigned.
    // In our state rankings, we push players as they finish.
    // If the game ends, rankings should have all active players.
    // The last player in rankings finished last, and the second-to-last finished second-to-last.
    if (state.rankings.length >= 2) {
      const last = state.rankings[state.rankings.length - 1].name;
      const secondLast = state.rankings[state.rankings.length - 2].name;
      bathroomDuty = [last, secondLast];
    } else if (state.rankings.length === 1) {
      // Just in case there was only 1 player
      bathroomDuty = [state.rankings[0].name];
    }
  }

  // Map room players list to clean DB representation
  const dbPlayers = room.players.map(p => ({
    name: p.name,
    color: COLORS[p.seatIndex] || 'grey',
    isBot: p.isBot
  }));

  db.saveMatch({
    roomId: room.roomId,
    playerCount: room.settings.playerCount,
    players: dbPlayers,
    rankings: rankingsList,
    bathroomDuty: bathroomDuty,
    punishmentEnabled: room.settings.bathroomChallenge?.enabled !== false,
    punishmentName: room.settings.bathroomChallenge?.name || 'Bathroom Duty'
  });
}
