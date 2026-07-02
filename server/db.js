// server/db.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_FILE = path.join(__dirname, '..', 'db_local.json');

// Initialize Supabase Client if credentials are provided
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

let supabase = null;
if (supabaseUrl && supabaseKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log('Supabase adapter successfully initialized.');
  } catch (err) {
    console.error('Failed to initialize Supabase client:', err);
  }
} else {
  console.log('No Supabase credentials found in environment. Running on local JSON file database.');
}

// Helper to read local database
function readLocalDB() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      const initialData = { rooms: {}, matches: [] };
      fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
      return initialData;
    }
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading local database file:', err);
    return { rooms: {}, matches: [] };
  }
}

// Helper to write local database
function writeLocalDB(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error writing local database file:', err);
  }
}

export const db = {
  // Rooms CRUD
  async getRoom(roomId) {
    // 1. Try Supabase
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('rooms')
          .select('*')
          .eq('room_id', roomId)
          .single();
        if (data && !error) {
          return {
            roomId: data.room_id,
            status: data.status,
            mode: data.mode,
            players: data.players,
            gameState: data.game_state,
            settings: data.settings
          };
        }
        if (error && error.code !== 'PGRST116') { // PGRST116 = Single query returned no rows
          console.error('Supabase getRoom error:', error.message);
        }
      } catch (err) {
        console.error('Supabase getRoom exception:', err);
      }
    }

    // 2. Local Fallback
    const local = readLocalDB();
    return local.rooms[roomId] || null;
  },

  async saveRoom(room) {
    // Save locally
    const local = readLocalDB();
    local.rooms[room.roomId] = room;
    writeLocalDB(local);

    // Save to Supabase
    if (supabase) {
      try {
        const { error } = await supabase
          .from('rooms')
          .upsert({
            room_id: room.roomId,
            status: room.status,
            mode: room.mode,
            players: room.players,
            game_state: room.gameState,
            settings: room.settings
          });
        if (error) {
          console.error('Supabase saveRoom error:', error.message);
        }
      } catch (err) {
        console.error('Supabase saveRoom exception:', err);
      }
    }
    return room;
  },

  async deleteRoom(roomId) {
    // Delete locally
    const local = readLocalDB();
    let deleted = false;
    if (local.rooms[roomId]) {
      delete local.rooms[roomId];
      writeLocalDB(local);
      deleted = true;
    }

    // Delete from Supabase
    if (supabase) {
      try {
        const { error } = await supabase
          .from('rooms')
          .delete()
          .eq('room_id', roomId);
        if (error) {
          console.error('Supabase deleteRoom error:', error.message);
        }
      } catch (err) {
        console.error('Supabase deleteRoom exception:', err);
      }
    }
    return deleted;
  },

  // Match History CRUD
  async saveMatch(match) {
    const matchId = match.id || Math.random().toString(36).substr(2, 9);
    
    // Save locally
    const local = readLocalDB();
    const newMatch = {
      id: matchId,
      roomId: match.roomId,
      playerCount: match.playerCount,
      players: match.players,
      rankings: match.rankings,
      bathroomDuty: match.bathroomDuty || [],
      punishmentEnabled: match.punishmentEnabled !== false,
      punishmentName: match.punishmentName || 'Bathroom Duty',
      date: new Date().toISOString()
    };
    local.matches.push(newMatch);
    if (local.matches.length > 100) {
      local.matches.shift();
    }
    writeLocalDB(local);

    // Save to Supabase
    if (supabase) {
      try {
        const { error } = await supabase
          .from('matches')
          .insert({
            id: matchId,
            room_id: match.roomId,
            player_count: match.playerCount,
            players: match.players,
            rankings: match.rankings,
            bathroom_duty: match.bathroomDuty || [],
            punishment_enabled: match.punishmentEnabled !== false,
            punishment_name: match.punishmentName || 'Bathroom Duty'
          });
        if (error) {
          console.error('Supabase saveMatch error:', error.message);
        }
      } catch (err) {
        console.error('Supabase saveMatch exception:', err);
      }
    }
    return newMatch;
  },

  async getMatchHistory() {
    // 1. Try Supabase
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('matches')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50);
        if (data && !error) {
          return data.map(m => ({
            id: m.id,
            roomId: m.room_id,
            playerCount: m.player_count,
            players: m.players,
            rankings: m.rankings,
            bathroomDuty: m.bathroom_duty,
            punishmentEnabled: m.punishment_enabled,
            punishmentName: m.punishment_name,
            date: m.created_at
          }));
        }
        console.error('Supabase getMatchHistory error:', error.message);
      } catch (err) {
        console.error('Supabase getMatchHistory exception:', err);
      }
    }

    // 2. Local fallback
    const local = readLocalDB();
    return [...local.matches].reverse();
  }
};
