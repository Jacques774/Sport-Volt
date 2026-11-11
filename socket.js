const socket = io("https://prediction-backend-2e20.onrender.com", {
  reconnection: true,
  reconnectionAttempts: Infinity, // Never give up trying to reconnect
  reconnectionDelay: 500,          // Try reconnecting after 0.5 seconds
  reconnectionDelayMax: 2000,       // Max delay between retries
  timeout: 10000
});
window.socket = socket;

// 🔑 BULLETPROOF MOBILE FIX: Auto-rejoin room when connection recovers from a notification drop
socket.on("connect", () => {
  console.log("🔌 Connected to socket server. Socket ID:", socket.id);

  // Grab gameId and playerName from window scope or storage
  const gameId = window.gameId || sessionStorage.getItem("current_room_code");
  const playerName = window.currentPlayerName || localStorage.getItem("player_name");

  if (gameId && playerName) {
    console.log(`🔄 Reconnecting player [${playerName}] to room [${gameId}]...`);
    socket.emit("player_reconnect", { roomCode: gameId, playerName: playerName });
  }
});

socket.on("disconnect", (reason) => {
  console.warn("⚠️ Disconnected from socket server:", reason);
});

// ============================
// LOBBY & PLAYER JOINS
// ============================
socket.on("host_joined", ({ playerName }) => {
  const list = document.getElementById("host-player-list");
  if (list) {
    const item = document.createElement("li");
    item.textContent = `👑 Host: ${playerName}`;
    list.appendChild(item);
  }
});

socket.on("player_joined", ({ playerName }) => {
  const list = document.getElementById("host-player-list");
  if (list) {
    const item = document.createElement("li");
    item.textContent = `🎮 Player: ${playerName}`;
    list.appendChild(item);
  }
});

// ============================
// PREDICTIONS & STAKES
// ============================
function sendPrediction(choice) {
  const gameId = window.gameId;
  const playerName = window.currentPlayerName || "Player";

  if (window.socket) {
    window.socket.emit("prediction", {
      gameId,
      playerName,
      choice
    });
  }

  console.log(`📡 Prediction sent: ${choice}`);
}
window.sendPrediction = sendPrediction;

// ✅ Listen for other players placing stakes in real time
socket.on("remote_stake_placed", ({ playerName, amount }) => {
  if (window.pot && playerName !== window.currentPlayerName) {
    window.pot.stakes[playerName] = (window.pot.stakes[playerName] || 0) + amount;
    window.pot.potBalance += amount;
  }
});

// ✅ Listen for other players cashing out in real time
socket.on("remote_cashout", ({ playerName, amount }) => {
  if (window.pot && playerName !== window.currentPlayerName) {
    const refund = amount * 0.5;
    window.pot.potBalance -= refund;
    window.pot.stakes[playerName] = 0;

    const potEl = document.getElementById("potAmount");
    if (potEl) {
      potEl.textContent = `Pot: £${Number(window.pot.potBalance).toFixed(2)}`;
    }
  }
});

// ============================
// POT & REVEAL LISTENERS
// ============================
socket.on("pot_update", ({ amount }) => {
  console.log("💰 Pot updated from server:", amount);

  if (window.pot) {
    window.pot.potBalance = amount;
  }

  const potEl = document.getElementById("potAmount");
  if (potEl) {
    potEl.textContent = `Pot: £${Number(amount || 0).toFixed(2)}`;
    if (amount > 0) {
      potEl.style.display = "inline";
    }
  }
});

socket.on("pot_reveal", ({ amount }) => {
  console.log("🔓 Pot revealed:", amount);
  if (window.pot) {
    window.pot.revealPot(amount);
  }
});

// ============================
// HOST RESOLUTION & ROUND END
// ============================
socket.on("host_resolve", ({ outcome }) => {
  if (typeof Engine !== "undefined" && typeof Engine.handleOutcome === "function") {
    Engine.handleOutcome(outcome);
  }
});

socket.on("round_outcome", ({ outcome, winners }) => {
  console.log(`🏁 Round outcome resolved: ${outcome}`, winners);
  if (typeof Engine !== "undefined" && typeof Engine.handleOutcome === "function") {
    Engine.handleOutcome(outcome, winners);
  }
});

// ============================
// LEADERBOARD & BALANCE SYNC
// ============================
if (!window.Leaderboard) {
  window.Leaderboard = {
    scores: {},
    lastScores: {},

    update(name, balance) {
      if (this.scores[name] !== undefined) {
        this.lastScores[name] = this.scores[name];
      } else {
        this.lastScores[name] = balance;
      }
      this.scores[name] = balance;
    },

    movement(name) {
      const old = this.lastScores[name] || 0;
      const current = this.scores[name] || 0;
      if (current > old) return "up";
      if (current < old) return "down";
      return "same";
    },

    render() {}
  };
}

socket.on("leaderboard_update", (players) => {
  console.log("Leaderboard payload:", JSON.stringify(players, null, 2));

  players.forEach(p => {
    const playerName = p.name;   
    const balance = p.balance;
    const wins = p.wins;
    const cashouts = p.cashouts;

    if (window.pot && window.pot.balances) {
      window.pot.balances[playerName] = balance;
    }

    if (window.Leaderboard && typeof window.Leaderboard.update === "function") {
      window.Leaderboard.update(playerName, balance);
    }

    if (window.currentPlayerName && playerName.trim().toLowerCase() === window.currentPlayerName.trim().toLowerCase()) {
      const nameEl = document.getElementById("player-name");
      const balanceEl = document.getElementById("player-balance");
      const winsEl = document.getElementById("player-wins");
      const cashoutsEl = document.getElementById("player-cashouts");

      if (nameEl) nameEl.textContent = `Player: ${playerName}`;
      if (balanceEl) balanceEl.textContent = `Balance: £${typeof balance === 'number' ? balance.toFixed(2) : balance}`;
      if (winsEl) winsEl.textContent = `Wins: ${wins}`;
      if (cashoutsEl) cashoutsEl.textContent = `Cash-outs: ${cashouts}`;
    }
  });

  if (window.Leaderboard && typeof window.Leaderboard.render === "function") {
    window.Leaderboard.render();
  }
});

socket.on("balance_update", ({ balance }) => {
  console.log("💰 Server sent balance update:", balance);
  if (window.currentPlayerName && window.Leaderboard) {
    window.Leaderboard.update(window.currentPlayerName, balance);
  }
  const balanceEl = document.getElementById("player-balance");
  if (balanceEl) {
    balanceEl.textContent = `Balance: £${typeof balance === 'number' ? balance.toFixed(2) : balance}`;
  }
});

socket.on("cashout_update", ({ playerName, balance }) => {
  console.log(`💸 ${playerName} cashed out. New balance: £${balance}`);
  
  if (window.pot && window.pot.balances) {
    window.pot.balances[playerName] = balance;
  }
});

// ============================
// QUESTION FLOW, SYNC & GAME OVER
// ============================
socket.on("new_question", ({ id, current, total, timer, question: serverQuestion, endTime }) => {
  console.log("📡 New question received:", id, current, total);

  if (window.isGameOver) return;

  let question = serverQuestion;
  if (!question && typeof RugbyQuestions !== "undefined") {
    question = RugbyQuestions[id];
  }

  if (!question) {
    console.error("❌ Question not found for ID:", id);
    return;
  }

  const duration = timer || question.timer || 90;

  const questionData = {
    ...question,
    id,
    current,
    total,
    timer: duration,
    endTime: endTime || (Date.now() + duration * 1000)
  };

  if (typeof Engine !== "undefined" && typeof Engine.nextQuestion === "function") {
    Engine.nextQuestion(questionData);
  }
});

// 🔑 Handle server sync response when returning from background / phone call
socket.on("sync_state", (serverState) => {
  if (!serverState) return;
  if (serverState.endTime && typeof Engine !== "undefined" && Engine.currentQuestion) {
    Engine.currentQuestion.endTime = serverState.endTime;
    console.log("🔄 Synced absolute question endTime from server.");
  }
});

socket.on("game_over", ({ leaderboard }) => {
  if (typeof window.triggerGameOverModal === "function") {
    window.triggerGameOverModal(leaderboard);
  } else {
    window.isGameOver = true;
    const activeCard = document.getElementById("active-card");
    if (activeCard) activeCard.style.display = "none";

    const gameOverModal = document.getElementById("gameOverModal");
    if (gameOverModal) {
      gameOverModal.classList.add("show");
      gameOverModal.style.display = "flex";
    }
  }
});
