import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import cookieParser from "cookie-parser"; // 🔒 Required for the bouncer cookie check

// ✅ Import separate rugby question banks for default fallbacks
import { RugbyBlitzQuestions } from "./RugbyQuestions-blitz.js";
import { RugbyTacticalQuestions } from "./RugbyQuestions-tactical.js";

const app = express();
app.use(cors());
app.use(express.json());
app.use(cookieParser()); // 🔒 Enable cookie parsing on incoming requests

const httpServer = createServer(app);

// 🔑 BULLETPROOF MOBILE FIX: Increase pingTimeout so quick text messages don't drop players instantly
const io = new Server(httpServer, { 
  cors: { origin: "*" },
  pingTimeout: 30000, 
  pingInterval: 10000 
});

// ✅ ES modules __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==========================================
// 🛡️ WIX BOUNCER & HANDSHAKE ROUTES
// ==========================================

// 1. Handshake route: When players click the button on your Wix site, 
// this sets a secure session cookie and safely redirects them to the menu.
app.get("/enter-app", (req, res) => {
  res.cookie('wix_authorized', 'true', { 
    maxAge: 5 * 60 * 1000, // Valid for 5 minutes during hand-off
    httpOnly: true, 
    secure: true, 
    sameSite: 'lax' 
  });
  
  res.redirect('/MainMenu.html');
});

// 2. Server-side Bouncer Middleware: Blocks direct URL typing or bookmarking
function serverBouncer(req, res, next) {
  const isAuthorized = req.cookies.wix_authorized === 'true';

  if (!isAuthorized) {
    // If they typed the URL directly without going through Wix, bounce them straight back!
    return res.redirect('https://thesportvolt.wixsite.com/sport-volt');
  }

  next();
}

// 3. Protected route: MainMenu.html cannot be accessed directly by typing the URL
app.get("/MainMenu.html", serverBouncer, (req, res) => {
  res.sendFile(path.join(__dirname, "MainMenu.html"));
});

// ✅ Serve other core pages (Public static files folder + direct files)
app.use(express.static(__dirname));

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "MainMenu.html")));
app.get("/gamesetup.html", (req, res) => res.sendFile(path.join(__dirname, "gamesetup.html")));
app.get("/host", (req, res) => res.sendFile(path.join(__dirname, "host.html")));
app.get("/player", (req, res) => res.sendFile(path.join(__dirname, "player.html")));

// --- Game state ---
const games = {};

// 🔑 Helper to pick a random question, supporting custom question decks or default modes
function getRandomQuestionForMode(game, lastId) {
  let deck = [];

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

// ✅ Endpoint to create game
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
    customQuestions: customQuestions || [],
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

  socket.on("pot_reveal", ({ gameId }) => {
    if (!games[gameId]) return;
    const potAmount = getGamePot(gameId);
    io.to(gameId).emit("pot_reveal", { amount: potAmount });
  });

  socket.on("join_game", ({ gameId, playerName, isHost }) => {
    if (!games[gameId]) return;

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

  socket.on("player_reconnect", ({ roomCode, playerName }) => {
    const code = roomCode ? roomCode.toUpperCase() : "";
    if (!games[code] || !playerName) return;

    socket.join(code);
    const game = games[code];

    let matchedPlayer = null;
    for (const [sId, pData] of Object.entries(game.players)) {
      if (pData.name.trim().toLowerCase() === playerName.trim().toLowerCase()) {
        matchedPlayer = pData;
        delete game.players[sId];
      }
    }

    if (matchedPlayer) {
      game.players[socket.id] = matchedPlayer;
    } else {
      game.players[socket.id] = {
        name: playerName,
        balance: game.startingBalance || 100,
        wins: 0,
        cashouts: 0,
        stake: 0,
        choice: null
      };
    }

    socket.emit("balance_update", { balance: game.players[socket.id].balance });
    broadcastLeaderboard(code);
  });

  socket.on("prediction", ({ gameId, playerName, choice }) => {
    if (!games[gameId]) return;
    const player = Object.values(games[gameId].players).find(p => p.name === playerName);
    if (player) {
      player.choice = choice; 
    }
    io.to(gameId).emit("prediction_made", { player: playerName, choice });
  });

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
    }
  });

  socket.on("start_game", ({ gameId, host }) => {
    io.to(gameId).emit("game_starting", { host });

    setTimeout(() => {
      const game = games[gameId];
      if (!game) return;
      game.started = true;
      io.to(gameId).emit("game_started", { host });

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

  socket.on("round_outcome", ({ gameId, outcome }) => {
    if (!games[gameId]) return;
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
    }

    io.to(gameId).emit("round_outcome", { outcome, winners });
    broadcastLeaderboard(gameId);
  });

  socket.on("next_round", ({ gameId }) => {
    const game = games[gameId];
    if (!game) return;

    Object.values(game.players).forEach(p => {
      p.stake = 0;
      p.choice = null;
    });

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

  socket.on("game_over", ({ gameId, leaderboard }) => {
    if (!games[gameId]) return;
    io.to(gameId).emit("game_over", { leaderboard });
  });

  socket.on("disconnect", () => {
    console.log("❌ Client disconnected:", socket.id);
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));
