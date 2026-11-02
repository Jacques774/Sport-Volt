import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";

// ✅ Import separate rugby question banks for default fallbacks
import { RugbyBlitzQuestions } from "./RugbyQuestions-blitz.js";
import { RugbyTacticalQuestions } from "./RugbyQuestions-tactical.js";

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

// ✅ ES modules __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve static files from project directory
app.use(express.static(__dirname));

// ✅ Serve pages
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "MainMenu.html")));
app.get("/gamesetup.html", (req, res) => res.sendFile(path.join(__dirname, "gamesetup.html")));
app.get("/host", (req, res) => res.sendFile(path.join(__dirname, "host.html")));
app.get("/player", (req, res) => res.sendFile(path.join(__dirname, "player.html")));

// --- Game state ---
const games = {};

// 🔑 Helper to pick a random question, supporting custom question decks or default modes
function getRandomQuestionForMode(game, lastId) {
  let deck = [];

  // 📁 If custom mode is active and custom questions are stored on the server, use them!
  if (game.mode === "custom" && game.customQuestions && game.customQuestions.length > 0) {
    deck = game.customQuestions;
  } else if (game.mode === "tactical") {
    deck = RugbyTacticalQuestions;
  } else if (game.mode === "mix") {
    deck = [...RugbyBlitzQuestions, ...RugbyTacticalQuestions];
  } else {
    deck = RugbyBlitzQuestions;
  }

  if (!deck || deck.length === 0) {
    return { id: "fallback", text: "Will a custom event occur in the next 3 minutes?", timer: 180 };
  }

  let available = deck;
  if (lastId && deck.length > 1) {
    available = deck.filter(q => q.id !== lastId);
  }

  const randomIndex = Math.floor(Math.random() * available.length);
  return available[randomIndex];
}

// ✅ Updated to receive host settings, including custom deck payload
app.post("/api/create-game", (req, res) => {
  const code = Math.random().toString(36).substring(2, 8).toUpperCase();
  const { startingBalance, questionCount, mode, customDeckName, customQuestions } = req.body;

  const gameMode = mode || "blitz";

  games[code] = {
    players: {},
    hostId: null,
    potBalance: 0, 
    started: false,
    mode: gameMode,
    customDeckName: customDeckName || null,
    customQuestions: customQuestions || [], // 🔑 Save custom question list in server memory!
    currentQuestionId: null,
    currentQuestionIndex: 0,
    lastOutcome: null,
    startingBalance: Number(startingBalance) >= 20 ? Number(startingBalance) : 100,
    questionCount: Number(questionCount) || 20
  };

  console.log(`🎮 Game created [${code}] with mode: ${gameMode} (${customDeckName || 'Default'})`);

  res.json({ 
    code, 
    startingBalance: games[code].startingBalance,
    questionCount: games[code].questionCount,
    mode: games[code].mode
  });
});

// ✅ Endpoint for clients to fetch configuration by room code
app.get("/api/game/:code", (req, res) => {
  const code = req.params.code.toUpperCase();
  const game = games[code];
  if (!game) {
    return res.status(404).json({ error: "Game not found" });
  }
  res.json({
    startingBalance: game.startingBalance,
    questionCount: game.questionCount,
    mode: game.mode,
    customDeckName: game.customDeckName
  });
});

app.get("/api/healthz", (req, res) => res.json({ status: "ok" }));

function getGamePot(gameId) {
  if (!games[gameId]) return 0;
  return games[gameId].potBalance || 0;
}

// ✅ Broadcast leaderboard (Called on join and round resolution)
function broadcastLeaderboard(gameId) {
  const game = games[gameId];
  if (!game) return;

  const players = Object.values(game.players).map(p => ({
    name: p.name,
    balance: p.balance,
    wins: p.wins,
    cashouts: p.cashouts
  }));

  io.to(gameId).emit("leaderboard_update", players);
}

// ✅ Socket.IO handlers
io.on("connection", (socket) => {
  console.log("🔌 Client connected:", socket.id);

  // --- Pot reveal ---
  socket.on("pot_reveal", ({ gameId }) => {
    if (!games[gameId]) return;
    const potAmount = getGamePot(gameId);
    io.to(gameId).emit("pot_reveal", { amount: potAmount });
    console.log(`💰 Pot revealed for ${gameId}: £${potAmount}`);
  });

  // Handle join_game
  socket.on("join_game", ({ gameId, playerName, isHost }) => {
    if (!games[gameId]) {
      console.warn(`Game ${gameId} not found`);
      return;
    }

    socket.join(gameId);

    const game = games[gameId];
    const initialBalance = game.startingBalance || 100;

    game.players[socket.id] = {
      name: playerName,
      balance: initialBalance,
      wins: 0,
      cashouts: 0,
      stake: 0,
      choice: null
    };

    if (isHost) {
      game.hostId = socket.id;
      io.to(gameId).emit("host_joined", { playerName });
    } else {
      io.to(gameId).emit("player_joined", { playerName, balance: initialBalance });
      broadcastLeaderboard(gameId);
    }
  });

  // Handle prediction (save choice on server state)
  socket.on("prediction", ({ gameId, playerName, choice }) => {
    if (!games[gameId]) return;
    const player = Object.values(games[gameId].players).find(p => p.name === playerName);
    if (player) {
      player.choice = choice; 
      console.log(`📡 Prediction recorded for ${playerName}: ${choice}`);
    }
    io.to(gameId).emit("prediction_made", { player: playerName, choice });
  });

  // Handle stake_placed
  socket.on("stake_placed", ({ gameId, playerName, amount, choice }) => {
    if (!games[gameId]) return;
    const player = Object.values(games[gameId].players).find(p => p.name === playerName);
    if (player) {
      player.stake = amount;
      player.balance -= amount;
      if (choice) player.choice = choice;

      games[gameId].potBalance = (games[gameId].potBalance || 0) + amount;
      const newPot = games[gameId].potBalance;

      io.to(gameId).emit("remote_stake_placed", { playerName, amount, choice: player.choice });
      io.to(gameId).emit("pot_update", { amount: newPot });
    }
  });

  // Handle cashout
  socket.on("cashout", ({ gameId, playerName, amount }) => {
    if (!games[gameId]) return;

    const player = Object.values(games[gameId].players).find(p => p.name === playerName);
    if (player) {
      const refund = amount * 0.5;

      player.balance += refund;
      player.cashouts += 1;
      player.stake = 0; 
      player.choice = null;

      games[gameId].potBalance = Math.max(0, (games[gameId].potBalance || 0) - refund);
      const newPot = games[gameId].potBalance;

      io.to(gameId).emit("remote_cashout", { playerName, amount });
      io.to(gameId).emit("pot_update", { amount: newPot });
      io.to(gameId).emit("cashout_update", { playerName, balance: player.balance });

      broadcastLeaderboard(gameId);
      console.log(`💸 ${playerName} cashed out. Refund: £${refund}. Remaining Pot: £${newPot}`);
    }
  });

  // Handle start_game
  socket.on("start_game", ({ gameId, host }) => {
    console.log(`🎮 Game ${gameId} started by host ${host}`);
    io.to(gameId).emit("game_starting", { host });

    setTimeout(() => {
      const game = games[gameId];
      if (!game) return;
      game.started = true;
      io.to(gameId).emit("game_started", { host });

      // 🔑 Pull question based on custom deck or game mode
      const selectedQ = getRandomQuestionForMode(game, game.currentQuestionId);
      game.currentQuestionId = selectedQ.id;
      game.currentQuestionIndex = 1;

      io.to(gameId).emit("new_question", { 
        id: selectedQ.id, 
        timer: selectedQ.timer,
        current: game.currentQuestionIndex,
        total: game.questionCount,
        question: selectedQ
      });
    }, 4000);
  });

  // ✅ Handle round outcome & determine winners for proportional parimutuel payout
  socket.on("round_outcome", ({ gameId, outcome }) => {
    if (!games[gameId]) return;
    console.log(`✅ Outcome for ${gameId}: ${outcome}`);
    games[gameId].lastOutcome = outcome;

    const game = games[gameId];
    const playersList = Object.values(game.players);
    const normalizedOutcome = outcome ? outcome.trim().toUpperCase() : "";

    const winners = [];
    playersList.forEach(p => {
      const playerChoice = p.choice ? p.choice.trim().toUpperCase() : "";
      if (playerChoice === normalizedOutcome && p.stake > 0) {
        winners.push(p.name);
      }
    });

    let totalWinningStakes = 0;
    winners.forEach(wName => {
      const p = playersList.find(x => x.name.trim().toLowerCase() === wName.trim().toLowerCase());
      if (p) totalWinningStakes += p.stake;
    });

    if (winners.length > 0 && totalWinningStakes > 0) {
      const currentPot = game.potBalance || 0;
      winners.forEach(wName => {
        const p = playersList.find(x => x.name.trim().toLowerCase() === wName.trim().toLowerCase());
        if (p && p.stake > 0) {
          let shareRatio = p.stake / totalWinningStakes;
          let payout = currentPot * shareRatio; 
          p.balance += payout;
          p.wins += 1;

          const socketEntry = Object.entries(game.players).find(([sId, playerData]) => 
            playerData.name.trim().toLowerCase() === wName.trim().toLowerCase()
          );
          if (socketEntry) {
            io.to(socketEntry[0]).emit("balance_update", { balance: p.balance });
          }
        }
      });
      game.potBalance = 0;
      io.to(gameId).emit("pot_update", { amount: 0 });
    } else {
      console.log("❌ No winners or 0 winning stakes, pot rolls over.");
    }

    io.to(gameId).emit("round_outcome", { outcome, winners });
    broadcastLeaderboard(gameId);
  });

  // ✅ Handle next round
  socket.on("next_round", ({ gameId }) => {
    const game = games[gameId];
    if (!game) return;

    Object.values(game.players).forEach(p => {
      p.stake = 0;
      p.choice = null;
    });

    // 🔑 Pull next question from custom deck or game mode
    const selectedQ = getRandomQuestionForMode(game, game.currentQuestionId);
    game.currentQuestionId = selectedQ.id;
    game.currentQuestionIndex = (game.currentQuestionIndex || 0) + 1;
    
    io.to(gameId).emit("new_question", { 
      id: selectedQ.id, 
      timer: selectedQ.timer,
      current: game.currentQuestionIndex,
      total: game.questionCount,
      question: selectedQ
    });
  });

  // Handle Game Over event
  socket.on("game_over", ({ gameId, leaderboard }) => {
    if (!games[gameId]) return;
    console.log(`🏁 Game over triggered for room [${gameId}]`);
    io.to(gameId).emit("game_over", { leaderboard });
  });

  // Handle disconnect
  socket.on("disconnect", () => {
    console.log("❌ Client disconnected:", socket.id);
    for (const [gameId, game] of Object.entries(games)) {
      if (game.players[socket.id]) {
        const playerName = game.players[socket.id].name;
        delete game.players[socket.id];
        io.to(gameId).emit("player_left", { playerName });
        broadcastLeaderboard(gameId);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));
