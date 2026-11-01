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
window.currentQuestionNum = 0;
window.totalQuestionsCount = 0;

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

console.log("✅ host-ui.js loaded");

// Connect to Render backend
const socket = io("https://prediction-backend-2e20.onrender.com");
window.socket = socket;

// Read ?code=, ?buyin=, and ?mode= from URL
const urlParams = new URLSearchParams(window.location.search);
const gameId = urlParams.get("code");
let buyInAmount = urlParams.get("buyin") !== null ? Number(urlParams.get("buyin")) : 20;

if (!gameId) {
  console.error("❌ No game code found in URL. Did you come from setup.html?");
}
window.gameId = gameId;

document.addEventListener("DOMContentLoaded", async () => {
  window.totalWins = 0;
  window.totalCashouts = 0;

  // 🔑 FETCH LIVE GAME ROOM DETAILS FROM BACKEND API
  if (gameId) {
    try {
      const res = await fetch(`https://prediction-backend-2e20.onrender.com/api/game/${gameId}`);
      if (res.ok) {
        const gameData = await res.json();
        if (gameData && gameData.startingBalance !== undefined) {
          buyInAmount = Number(gameData.startingBalance);
          console.log(`✅ Host fetched live buy-in from server: ${buyInAmount}⚡`);
        }
      }
    } catch (err) {
      console.warn("Could not fetch live room details, falling back to URL parameter:", err);
    }
  }

  // Pre-update balance DOM if present
  const initialBalanceEl = document.getElementById("player-balance");
  if (initialBalanceEl) {
    initialBalanceEl.textContent = `Balance: ${Number(buyInAmount).toFixed(2)}⚡`;
  }

  const startBtn = document.getElementById("host-start-btn");
  if (!startBtn) {
    console.error("Start button not found — check ID or script placement.");
    return;
  }

  // Listen for server broadcast
  socket.on("game_starting", ({ host }) => {
    console.log(`Game starting by host: ${host}`);

    startPreCountdown(() => {
      const activeCard = document.getElementById("active-card");
      if (activeCard && !window.isGameOver) activeCard.style.display = "block";
    });
  });

  // Listen for joined players and add them to local pot balance tracker
  socket.on("player_joined", ({ playerName }) => {
    console.log(`🎮 Player joined host session: ${playerName}`);
    if (window.pot && window.pot.balances) {
      if (window.pot.balances[playerName] === undefined) {
        window.pot.balances[playerName] = buyInAmount;
        window.pot.stakes[playerName] = 0;
      }
    }
  });

  let lastSeenHostIndex = 0;

  // Listen for server broadcast of new question
  socket.on("new_question", ({ id, current, total, question: serverQuestion }) => {
    // 🔑 Stop loading questions if game is over
    if (window.isGameOver) {
      console.log("🛑 Game is complete. Ignoring new question emission.");
      return;
    }

    if (current !== undefined) window.currentQuestionNum = current;
    if (total !== undefined) window.totalQuestionsCount = total;

    if (current !== undefined && current === lastSeenHostIndex) return;
    if (current !== undefined) lastSeenHostIndex = current;

    // 🔑 Dynamically fetch question using mode from URL if server didn't pass full question object
    let question = serverQuestion;
    if (!question || !question.text) {
      const gameMode = urlParams.get("mode") || "blitz";
      question = RugbyQuestions.getRand(gameMode);
    }

    console.log(`📡 Host received new question: ${question.text}`);
    if (typeof Engine !== "undefined" && typeof Engine.nextQuestion === "function") {
      Engine.nextQuestion(question);
    }

    const tallyEl = document.getElementById("host-question-tally");
    if (tallyEl && current !== undefined && total !== undefined) {
      tallyEl.textContent = `Question ${current} of ${total}`;
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

    // Close host outcome panel if open
    const outcomePanel = document.querySelector(".host-outcome-panel");
    if (outcomePanel) outcomePanel.classList.remove("active");

    const playerName = window.currentPlayerName || "Host";
    let finalBalance = window.pot && window.pot.balances ? window.pot.balances[playerName] || buyInAmount : buyInAmount;

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

    // Evaluate Win / Loss / Break-Even against buyInAmount
    let positionText = "";
    if (finalBalance > buyInAmount) {
      positionText = "Congratulations! You finished in profit! 🏆🎉";
    } else if (finalBalance === buyInAmount) {
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

  // Logout Button Listener -> Safely adds balance back to wallet & Redirects to Main Menu
  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      if (!window.hasProcessedGameOver) {
        window.hasProcessedGameOver = true;
        const finalBal = window.pot && window.currentPlayerName && window.pot.balances[window.currentPlayerName] !== undefined
          ? window.pot.balances[window.currentPlayerName]
          : 0;

        const rawWallet = localStorage.getItem("user_credit");
        let currentWallet = (rawWallet !== null && !isNaN(parseFloat(rawWallet))) ? parseFloat(rawWallet) : 0.00;
        
        const gameEarnings = Number(finalBal || 0);
        currentWallet += gameEarnings;

        localStorage.setItem("user_credit", currentWallet.toFixed(2));
        console.log(`⚡ Saving host wallet credit on exit: New total ${currentWallet.toFixed(2)}⚡`);
      }

      if (socket) socket.disconnect();
      window.location.href = "MainMenu.html";
    });
  }

  // Real-time Pot Update Listener for Host Screen
  socket.on("pot_update", ({ amount }) => {
    console.log("💰 Pot updated on Host screen:", amount);
    if (window.pot) {
      window.pot.potBalance = amount;
    }
    updatePot(amount);
  });

  // Round Outcome socket handler
  socket.on("round_outcome", ({ outcome, winners }) => {
    if (typeof Engine !== "undefined" && typeof Engine.handleOutcome === "function") {
      Engine.handleOutcome(outcome, winners);
    }

    const player = window.currentPlayerName;
    const balanceEl = document.getElementById("player-balance");
    if (balanceEl && window.pot && window.pot.balances[player] !== undefined) {
      const bal = window.pot.balances[player];
      balanceEl.textContent = `Balance: ${Number(bal).toFixed(2)}⚡`;
    }

    const outcomePanel = document.getElementById("outcome-panel");
    if (outcomePanel) outcomePanel.textContent = `Outcome: ${outcome}`;
  });

  // 🔑 Outcome buttons with End-of-Game Trigger
  function handleOutcomeClick(outcome) {
    console.log(`✅ Host chose outcome ${outcome}`);
    socket.emit("round_outcome", { gameId: window.gameId, outcome });

    // Check if current question reaches or exceeds the total question count
    if (window.currentQuestionNum > 0 && window.totalQuestionsCount > 0 && window.currentQuestionNum >= window.totalQuestionsCount) {
      console.log("🏁 Final question outcome confirmed. Emitting game_over...");
      
      const finalLeaderboard = window.pot ? Object.keys(window.pot.balances).map(name => ({
        name,
        balance: window.pot.balances[name]
      })) : [];

      socket.emit("game_over", { gameId: window.gameId, leaderboard: finalLeaderboard });
    }
  }

  const yesBtn = document.getElementById("host-yes-btn");
  const noBtn = document.getElementById("host-no-btn");

  if (yesBtn) {
    yesBtn.addEventListener("click", () => handleOutcomeClick("YES"));
  }

  if (noBtn) {
    noBtn.addEventListener("click", () => handleOutcomeClick("NO"));
  }

  // START BUTTON CLICK (DEDUCTS BUY-IN WITH AUTO-REFILL SAFETY)
  startBtn.addEventListener("click", () => {
    console.log("🎯 Host Start button clicked!");

    const hostNameInput = document.getElementById("host-name-input");
    const hostNameError = document.getElementById("hostNameError");
    const hostName =
      hostNameInput && hostNameInput.value.trim()
        ? hostNameInput.value.trim()
        : "Host";

    if (!hostNameInput || !hostNameInput.value.trim()) {
      if (hostNameError) {
        hostNameError.textContent = "Please enter your name";
        hostNameError.style.display = "block";
      }
      return;
    }

    // 🔑 Safely parse wallet credit and auto-refill if lower than required buy-in for testing
    const rawCredit = localStorage.getItem("user_credit");
    let currentCredit = (rawCredit !== null && !isNaN(parseFloat(rawCredit))) ? parseFloat(rawCredit) : 1000.00;

    if (currentCredit < buyInAmount) {
      console.warn(`⚠️ Wallet credit (${currentCredit}⚡) was lower than buy-in (${buyInAmount}⚡). Auto-refilling host wallet.`);
      currentCredit = buyInAmount + 500.00;
    }

    currentCredit -= buyInAmount;
    localStorage.setItem("user_credit", currentCredit.toFixed(2));
    console.log(`⚡ Host buy-in deducted (${buyInAmount.toFixed(2)}⚡). Remaining wallet: ${currentCredit.toFixed(2)}⚡`);

    window.currentPlayerName = hostName;
    window.isHost = true;

    // Initialize pot with host name & fetched buy-in amount
    window.pot = new Pot([window.currentPlayerName], buyInAmount);

    socket.emit("join_game", { gameId, playerName: hostName, isHost: true });
    socket.emit("start_game", { gameId, host: hostName });

    const hostSlide = document.getElementById("hostSetupSlide");
    if (hostSlide) {
      hostSlide.classList.add("slide-away");
      setTimeout(() => {
        hostSlide.style.display = "none";
      }, 700);
    }

    const dashboard = document.getElementById("dashboard");
    if (dashboard) {
      dashboard.classList.remove("hidden");
      dashboard.style.opacity = "1";
    }

    const nameEl = document.getElementById("player-name");
    const balanceEl = document.getElementById("player-balance");

    if (nameEl) nameEl.textContent = `Host: ${hostName}`;
    if (balanceEl && window.pot) {
      const startingBal = window.pot.balances[window.currentPlayerName] || buyInAmount;
      balanceEl.textContent = `Balance: ${Number(startingBal).toFixed(2)}⚡`;
    }
  });
});

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

socket.on("balance_update", ({ balance }) => {
  console.log("💰 Host received direct balance update:", balance);
  
  if (window.pot && window.currentPlayerName) {
    window.pot.balances[window.currentPlayerName] = balance;
  }

  const balanceEl = document.getElementById("player-balance");
  if (balanceEl) {
    balanceEl.textContent = `Balance: ${Number(balance).toFixed(2)}⚡`;
  }
});

socket.on("leaderboard_update", (players) => {
  console.log("📊 Leaderboard update received from server:", players);

  if (typeof Leaderboard !== "undefined") {
    players.forEach(p => {
      Leaderboard.update(p.name, p.balance);
    });
    Leaderboard.render();
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
