import { RugbyBlitzQuestions } from "./RugbyQuestions-blitz.js";
import { RugbyTacticalQuestions } from "./RugbyQuestions-tactical.js";
import Pot from "./pot.js";

// ============================
// NEW QUESTION SYSTEM (NON-REPEATING RANDOM PICKER)
// ============================
let lastQuestionId = null;

const RugbyQuestions = {
  getRand(mode = "blitz") {
    let deck = [];

    if (mode === "blitz") {
      deck = RugbyBlitzQuestions;
    } else if (mode === "tactical") {
      deck = RugbyTacticalQuestions;
    } else if (mode === "mix") {
      deck = [...RugbyBlitzQuestions, ...RugbyTacticalQuestions];
    } else {
      deck = RugbyBlitzQuestions;
    }

    if (!deck || deck.length === 0) {
      return { id: "fallback", text: "Will a lineout be awarded in the next 3 minutes?", timer: 180 };
    }

    let available = deck;
    if (lastQuestionId && deck.length > 1) {
      available = deck.filter(q => q.id !== lastQuestionId);
    }

    const randomIndex = Math.floor(Math.random() * available.length);
    const selected = available[randomIndex];

    lastQuestionId = selected.id;
    return selected;
  }
};

// ============================
// DOM Helpers for Stake Timer & Delayed Pot Reveal
// ============================
window.isStakeWindowActive = false;
window.isGameOver = false; // 🔑 Freeze question flag

function showCountdown(timeLeft) {
  window.isStakeWindowActive = true;
  document.body.classList.add("stake-active");

  const countdownEl = document.getElementById("stakeCountdown");
  const potEl = document.getElementById("potAmount");

  if (potEl) potEl.style.setProperty("display", "none", "important");
  if (countdownEl) {
    countdownEl.style.display = "inline";
    countdownEl.textContent = "Stake window: " + timeLeft + "s";
  }
}

function revealPot(amount) {
  window.isStakeWindowActive = false;
  document.body.classList.remove("stake-active");

  const countdownEl = document.getElementById("stakeCountdown");
  const potEl = document.getElementById("potAmount");

  if (countdownEl) countdownEl.style.display = "none";
  if (potEl) {
    potEl.style.removeProperty("display");
    potEl.style.display = "inline";
    potEl.textContent = "Pot: " + Number(amount || 0).toFixed(2) + "⚡";
  }
}

function updatePot(amount) {
  const potEl = document.getElementById("potAmount");
  if (!potEl) return;

  potEl.textContent = "Pot: " + Number(amount || 0).toFixed(2) + "⚡";
  if (window.isStakeWindowActive) {
    potEl.style.setProperty("display", "none", "important");
  }
}

window.showCountdown = showCountdown;
window.revealPot = revealPot;
window.updatePot = updatePot;

console.log("✅ player-ui.js loaded");

// Connect to Render backend
const socket = io("https://prediction-backend-2e20.onrender.com");
window.socket = socket;

function initPlayerUI() {
  window.totalWins = 0;
  window.totalCashouts = 0;
  
  // 🔑 Safely read actual wallet credit from localStorage
  const rawInitCredit = localStorage.getItem("user_credit");
  const playerCredit = (rawInitCredit !== null && !isNaN(parseFloat(rawInitCredit))) ? parseFloat(rawInitCredit) : 30.00;

  // Auto-fill game code from URL parameter if present
  const urlParams = new URLSearchParams(window.location.search);
  const codeParam = urlParams.get("code");
  const codeInput = document.getElementById("game-code-input");
  if (codeParam && codeInput) {
    codeInput.value = codeParam.toUpperCase();
  }

  const joinBtn = document.getElementById("player-join-btn");
  const modal = document.getElementById("gamePreviewModal");
  const confirmJoinBtn = document.getElementById("confirm-join-btn");
  const cancelPreviewBtn = document.getElementById("cancel-preview-btn");
  const setupSlide = document.getElementById("playerSetupSlide");

  if (!joinBtn) {
    console.error("Join button not found.");
    return;
  }

  let pendingGameData = null;

  // 1️⃣ Initial Join Click -> Fetches live room details from backend & opens Preview Modal
  joinBtn.addEventListener("click", async () => {
    console.log("🎯 Player Join button clicked (Preview Gatekeeper)");

    const nameInput = document.getElementById("player-name-input");
    const nameError = document.getElementById("playerNameError");

    const playerName = nameInput ? nameInput.value.trim() : "";
    const gameId = codeInput ? codeInput.value.trim().toUpperCase() : "";

    if (!playerName || !gameId) {
      if (nameError) {
        nameError.textContent = "Name and code required";
        nameError.style.display = "block";
      }
      return;
    }
    if (nameError) nameError.style.display = "none";

    window.currentPlayerName = playerName;
    window.gameId = gameId;

    // Default fallback values from URL query parameters
    let urlBuyin = urlParams.get("buyin") !== null ? Number(urlParams.get("buyin")) : 20;
    let gameMode = urlParams.get("mode") || "blitz";
    let sport = "Rugby";
    let questionCount = 40;

    // 🔑 STORE BUY-IN GLOBALLY FOR GAME OVER COMPARISON
    window.activeBuyInAmount = urlBuyin;

    // 🔑 FETCH LIVE GAME ROOM DETAILS FROM BACKEND API
    try {
      const res = await fetch(`https://prediction-backend-2e20.onrender.com/api/game/${gameId}`);
      if (res.ok) {
        const gameData = await res.json();
        if (gameData) {
          if (gameData.startingBalance !== undefined) {
            urlBuyin = Number(gameData.startingBalance);
            window.activeBuyInAmount = urlBuyin;
          }
          if (gameData.mode !== undefined) gameMode = gameData.mode;
          if (gameData.questionCount !== undefined) questionCount = Number(gameData.questionCount);
          if (gameData.sport) sport = gameData.sport.charAt(0).toUpperCase() + gameData.sport.slice(1);
        }
      }
    } catch (err) {
      console.warn("Could not fetch live room details, falling back to URL parameters:", err);
    }

    const formattedMode = gameMode.charAt(0).toUpperCase() + gameMode.slice(1) + " Mode";

    pendingGameData = {
      sport: sport,
      questionCount: questionCount,
      gameModeDisplay: formattedMode,
      startingBalance: urlBuyin
    };

    // Populate Modal Elements
    document.getElementById("preview-sport").textContent = pendingGameData.sport;
    document.getElementById("preview-questions").textContent = pendingGameData.questionCount;
    
    // 🔑 Display Game Mode instead of card timer on preview modal
    const previewTimerEl = document.getElementById("preview-timer");
    if (previewTimerEl) {
      previewTimerEl.textContent = pendingGameData.gameModeDisplay;
    }

    document.getElementById("preview-balance").textContent = `${pendingGameData.startingBalance.toFixed(2)}⚡`;

    // Re-read latest wallet credit safely
    const rawWalletCheck = localStorage.getItem("user_credit");
    const currentWalletCheck = (rawWalletCheck !== null && !isNaN(parseFloat(rawWalletCheck))) ? parseFloat(rawWalletCheck) : 30.00;

    // Gatekeeper Credit Check against localStorage wallet
    const creditErrorEl = document.getElementById("previewCreditError");
    if (currentWalletCheck < pendingGameData.startingBalance) {
      if (creditErrorEl) {
        creditErrorEl.textContent = `Insufficient credit! Required: ${pendingGameData.startingBalance.toFixed(2)}⚡, Available: ${currentWalletCheck.toFixed(2)}⚡`;
        creditErrorEl.style.display = "block";
      }
      if (confirmJoinBtn) {
        confirmJoinBtn.disabled = true;
        confirmJoinBtn.style.opacity = "0.5";
        confirmJoinBtn.style.cursor = "not-allowed";
      }
    } else {
      if (creditErrorEl) creditErrorEl.style.display = "none";
      if (confirmJoinBtn) {
        confirmJoinBtn.disabled = false;
        confirmJoinBtn.style.opacity = "1";
        confirmJoinBtn.style.cursor = "pointer";
      }
    }

    // Hide setup slide and display Preview Modal cleanly on top
    if (setupSlide) setupSlide.style.display = "none";
    if (modal) {
      modal.style.display = "flex";
      modal.style.zIndex = "1100";
    }
  });

  // 2️⃣ Cancel Modal -> Restores the setup slide
  if (cancelPreviewBtn) {
    cancelPreviewBtn.addEventListener("click", () => {
      if (modal) modal.style.display = "none";
      if (setupSlide) setupSlide.style.display = "flex";
    });
  }

  // 3️⃣ Confirm Join Inside Modal -> Safely Deducts Buy-in, Connects to Room & Opens Dashboard
  if (confirmJoinBtn) {
    confirmJoinBtn.addEventListener("click", () => {
      if (!pendingGameData) return;

      // 🔑 Safely parse and deduct buy-in from wallet credit
      const rawCredit = localStorage.getItem("user_credit");
      let currentCredit = (rawCredit !== null && !isNaN(parseFloat(rawCredit))) ? parseFloat(rawCredit) : 30.00;
      const buyin = pendingGameData.startingBalance;
      window.activeBuyInAmount = buyin;

      if (currentCredit < buyin) {
        alert(`Insufficient credit! Required: ${buyin.toFixed(2)}⚡, Available: ${currentCredit.toFixed(2)}⚡`);
        return;
      }
      currentCredit -= buyin;
      localStorage.setItem("user_credit", currentCredit.toFixed(2));
      console.log(`💳 Player buy-in deducted (${buyin.toFixed(2)}⚡). Remaining wallet: ${currentCredit.toFixed(2)}⚡`);

      window.isHost = false;

      // Initialize pot with confirmed buy-in amount
      window.pot = new Pot([window.currentPlayerName], buyin);

      // Emit join event to socket
      socket.emit("join_game", { 
        gameId: window.gameId, 
        playerName: window.currentPlayerName, 
        isHost: false 
      });

      // Hide modal completely, show dashboard
      if (modal) modal.style.display = "none";

      const dashboard = document.getElementById("dashboard");
      if (dashboard) {
        dashboard.classList.remove("hidden");
        dashboard.style.opacity = "1";
      }

      const nameEl = document.getElementById("player-name");
      const balanceEl = document.getElementById("player-balance");

      const startingBal = window.pot.balances[window.currentPlayerName] || buyin;

      if (nameEl) nameEl.textContent = `Player: ${window.currentPlayerName}`;
      if (balanceEl) {
        balanceEl.textContent = `Balance: ${Number(startingBal).toFixed(2)}⚡`;
      }
    });
  }

  // 4️⃣ Logout Button Listener -> Safely adds balance back to wallet & redirects to Main Menu
  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      if (!window.hasProcessedGameOver) {
        window.hasProcessedGameOver = true;
        const activeBal = window.pot && window.currentPlayerName && window.pot.balances[window.currentPlayerName] !== undefined
          ? window.pot.balances[window.currentPlayerName]
          : 0;
        
        // 🔑 Safely add final game balance to existing wallet credit using numeric parsing
        const rawWallet = localStorage.getItem("user_credit");
        let currentWallet = (rawWallet !== null && !isNaN(parseFloat(rawWallet))) ? parseFloat(rawWallet) : 0.00;
        
        const gameEarnings = Number(activeBal || 0);
        currentWallet += gameEarnings;

        localStorage.setItem("user_credit", currentWallet.toFixed(2));
        console.log(`⚡ Added player final balance (${gameEarnings.toFixed(2)}⚡) to wallet on exit. New total: ${currentWallet.toFixed(2)}⚡`);
      }

      if (socket) socket.disconnect();
      window.location.href = "MainMenu.html";
    });
  }
}

// Safely initialize whether DOM is loading or already parsed
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initPlayerUI);
} else {
  initPlayerUI();
}

// ============================
// Helpers & Socket Listeners
// ============================
window.sendPrediction = function (choice) {
  if (!socket || !window.gameId || !window.currentPlayerName) return;
  socket.emit("prediction", {
    gameId: window.gameId,
    playerName: window.currentPlayerName,
    choice
  });
};

window.cashout = function () {
  if (typeof Engine !== "undefined" && typeof Engine.cashout === "function") {
    Engine.cashout();
  }
};

window.startPreCountdown = function (onDone) {
  const el = document.getElementById("preCountdown");
  if (!el) {
    if (typeof onDone === "function") onDone();
    return;
  }
  el.style.display = "block";
  let count = 3;
  el.textContent = count;
  const interval = setInterval(() => {
    count--;
    el.textContent = count > 0 ? count : "GO!";
    if (count < 0) {
      clearInterval(interval);
      el.style.display = "none";
      if (typeof onDone === "function") onDone();
    }
  }, 1000);
};

// 🔄 TAB VISIBILITY RE-SYNC HANDLER FOR PLAYERS
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    console.log("Player tab focused - syncing state with server...");
    if (!socket || !socket.connected) {
      socket.connect();
    } else if (window.gameId) {
      socket.emit("request_sync", { 
        gameId: window.gameId, 
        playerName: window.currentPlayerName 
      });
    }
  }
});

const statusDot = document.createElement("div");
statusDot.id = "socket-status";
statusDot.style.width = "10px";
statusDot.style.height = "10px";
statusDot.style.borderRadius = "50%";
statusDot.style.marginLeft = "8px";
statusDot.style.backgroundColor = socket.connected ? "limegreen" : "red";

const topHeader = document.querySelector(".top-header");
if (topHeader) topHeader.appendChild(statusDot);

socket.on("connect", () => (statusDot.style.backgroundColor = "limegreen"));
socket.on("disconnect", () => (statusDot.style.backgroundColor = "red"));

socket.on("game_starting", ({ host }) => {
  console.log(`Game starting by host: ${host}`);

  // 🔑 Hide the waiting-for-host lobby card when game starts
  const waitingCard = document.getElementById("waitingForHostCard");
  if (waitingCard) waitingCard.style.display = "none";

  window.startPreCountdown(() => {
    const activeCard = document.getElementById("active-card");
    if (activeCard && !window.isGameOver) activeCard.style.display = "block";
  });
});

let lastSeenPlayerIndex = 0;

socket.on("new_question", ({ id, timer, current, total, question: serverQuestion, endTime }) => {
  if (window.isGameOver) return;

  if (current !== undefined) {
    window.currentQuestionNum = current;
    if (current === lastSeenPlayerIndex) return;
    lastSeenPlayerIndex = current;
  }
  if (total !== undefined) window.totalQuestionsCount = total;

  // 🔑 Dynamically fetch question using mode from URL if server didn't pass full question object
  let question = serverQuestion;
  if (!question || !question.text) {
    const urlParams = new URLSearchParams(window.location.search);
    const gameMode = urlParams.get("mode") || "blitz";
    question = RugbyQuestions.getRand(gameMode);
  }

  const duration = timer || question.timer || 90;

  const questionData = {
    ...question,
    timer: duration,
    endTime: endTime || (Date.now() + duration * 1000),
    current,
    total
  };

  if (typeof Engine !== "undefined" && typeof Engine.nextQuestion === "function") {
    Engine.nextQuestion(questionData);
  }

  const tallyEl = document.getElementById("player-question-tally");
  if (tallyEl && current !== undefined && total !== undefined) {
    tallyEl.textContent = `Question ${current} of ${total}`;
  }

  const activeCard = document.getElementById("active-card");
  if (activeCard && !window.isGameOver) activeCard.style.display = "block";
});

// Handle server sync responses when reconnecting or refocusing tab
socket.on("sync_state", (serverState) => {
  if (!serverState) return;
  if (serverState.endTime && typeof Engine !== "undefined" && Engine.currentQuestion) {
    Engine.currentQuestion.endTime = serverState.endTime;
  }
});

// 🔑 GAME OVER LISTENER (SAFE NUMERIC PARSING & AUTO LEADERBOARD OPEN)
socket.on("game_over", ({ leaderboard }) => {
  if (window.hasProcessedGameOver) return;
  window.hasProcessedGameOver = true;

  window.isGameOver = true;

  // Hide active question card immediately
  const activeCard = document.getElementById("active-card");
  if (activeCard) activeCard.style.display = "none";

  const playerName = window.currentPlayerName || "Player";
  const refBuyin = window.activeBuyInAmount !== undefined ? window.activeBuyInAmount : 20;
  let finalBalance = window.pot && window.pot.balances ? window.pot.balances[playerName] || refBuyin : refBuyin;

  if (leaderboard && Array.isArray(leaderboard)) {
    const sorted = [...leaderboard].sort((a, b) => b.balance - a.balance);
    const index = sorted.findIndex(p => p.name.trim().toLowerCase() === playerName.trim().toLowerCase());
    
    if (index !== -1) {
      const boardBal = Number(sorted[index].balance);
      if (!isNaN(boardBal) && boardBal >= 0) {
        finalBalance = boardBal;
      }
    }

    // 🔑 POPULATE & UPDATE LEADERBOARD DATA
    if (typeof Leaderboard !== "undefined") {
      sorted.forEach(p => {
        Leaderboard.update(p.name, p.balance);
      });
      Leaderboard.render();
    }
  }

  // Evaluate Win / Loss / Break-Even against buy-in
  let positionText = "";
  if (finalBalance > refBuyin) {
    positionText = "Congratulations! You finished in profit! 🏆🎉";
  } else if (finalBalance === refBuyin) {
    positionText = "Game Over! You broke even. ⚖️";
  } else {
    positionText = "Game Over. You finished in a loss. 📉";
  }

  // 🔑 Safely parse wallet and earnings as numbers before adding
  const rawWallet = localStorage.getItem("user_credit");
  let currentWallet = (rawWallet !== null && !isNaN(parseFloat(rawWallet))) ? parseFloat(rawWallet) : 30.00;
  
  const gameEarnings = Number(finalBalance || 0);
  currentWallet += gameEarnings;

  localStorage.setItem("user_credit", currentWallet.toFixed(2));
  console.log(`⚡ Added final balance (${gameEarnings.toFixed(2)}⚡) to wallet. New total: ${currentWallet.toFixed(2)}⚡`);

  // Populate Modal Elements
  const messageEl = document.getElementById("gameOverMessage");
  const balanceEl = document.getElementById("gameOverFinalBalance");

  if (messageEl) messageEl.textContent = positionText;
  if (balanceEl) balanceEl.textContent = `Final Balance: ${gameEarnings.toFixed(2)}⚡`;

  // Show Modal via class toggle and inline fallback
  const gameOverModal = document.getElementById("gameOverModal");
  if (gameOverModal) {
    gameOverModal.classList.add("show");
    gameOverModal.style.display = "flex";
  }

  // 🔑 Automatically open leaderboard panel after short delay
  setTimeout(() => {
    if (typeof openLeaderboard === "function") {
      openLeaderboard();
    }
  }, 1500);
});

socket.on("pot_update", ({ amount }) => {
  if (window.pot) window.pot.potBalance = amount;
  updatePot(amount);
});

window.startPostQuestionCountdown = function (onDone, duration = 5) {
  const el = document.getElementById("postQuestionCountdown");
  if (!el) {
    if (typeof onDone === "function") onDone();
    return;
  }
  el.style.display = "block";
  let count = duration;
  el.textContent = count;
  const interval = setInterval(() => {
    count--;
    el.textContent = count > 0 ? count : "Next!";
    if (count < 0) {
      clearInterval(interval);
      el.style.display = "none";
      if (typeof onDone === "function") onDone();
    }
  }, 1000);
};

socket.on("pot_reveal", ({ amount }) => {
  window.revealPot(amount);
});

socket.on("balance_update", ({ balance }) => {
  if (window.pot && window.currentPlayerName) {
    window.pot.balances[window.currentPlayerName] = balance;
  }
  const balanceEl = document.getElementById("player-balance");
  if (balanceEl) {
    balanceEl.textContent = `Balance: ${Number(balance).toFixed(2)}⚡`;
  }
});

socket.on("leaderboard_update", (players) => {
  if (typeof Leaderboard !== "undefined") {
    players.forEach(p => Leaderboard.update(p.name, p.balance));
    Leaderboard.render();
  }
});
