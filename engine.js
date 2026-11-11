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

    // 📁 DIRECT STORAGE CHECK: Grab all saved custom lists
    const allLists = JSON.parse(localStorage.getItem("custom_question_lists") || "{}");
    const activeDeckName = localStorage.getItem("active_custom_deck");

    // 🔒 ABSOLUTE LOCK: If an active custom deck is set and exists, use it 100% of the time!
    if (activeDeckName && allLists[activeDeckName] && allLists[activeDeckName].length > 0) {
      deck = allLists[activeDeckName];
    } else {
      // Fallback: If no active deck is set, check if ANY custom list exists and use the first one
      const keys = Object.keys(allLists);
      if (keys.length > 0 && allLists[keys[0]].length > 0) {
        deck = allLists[keys[0]];
      }
    }

    // 🏈 ONLY use standard rugby files if your localStorage custom lists are completely empty
    if (!deck || deck.length === 0) {
      if (mode === "tactical") {
        deck = RugbyTacticalQuestions;
      } else if (mode === "mix") {
        deck = [...RugbyBlitzQuestions, ...RugbyTacticalQuestions];
      } else {
        deck = RugbyBlitzQuestions;
      }
    }

    if (!deck || deck.length === 0) {
      return { id: "fallback", text: "Will a custom event occur in the next 3 minutes?", timer: 180 };
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

// 🔑 TIMER FORMATTER: Converts total seconds into "Xm Ys" format (e.g. 90 -> "1m 30s")
function formatTime(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  
  if (mins > 0) {
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }
  return `${secs}s`;
}

// ✅ Dynamic Pot initializer supporting host buy-in amount & instant leaderboard sync
window.initGame = function (players, buyInAmount = 100) {
  window.pot = new Pot(players, buyInAmount);
  players.forEach(p => {
    const balance = window.pot.balances[p];
    const el = document.getElementById(`${p}-balance`);
    if (el) {
      el.innerText = "Balance: " + Number(balance).toFixed(2) + "⚡";
    }

    // 🔑 Instantly populate player on leaderboard upon joining/init
    if (typeof Leaderboard !== "undefined" && Leaderboard.update) {
      Leaderboard.update(p, balance);
    }
  });

  // 🔑 Render leaderboard immediately so everyone appears right away
  if (typeof Leaderboard !== "undefined" && Leaderboard.render) {
    Leaderboard.render();
  }
};

document.addEventListener("DOMContentLoaded", () => {
  // ============================
  // SAFE GLOBALS & ELEMENTS
  // ============================
  window.playerName = window.playerName || "";
  let totalCashouts = 0;

  let questionCountdown = null;
  let cashoutCountdown = null;

  const qText = document.getElementById("q-text");
  const qInfo = document.getElementById("q-info");

  const btnYes = document.getElementById("btn-yes");
  const btnNo = document.getElementById("btn-no");
  const cashoutBtn = document.getElementById("cashout-btn");
  const cashoutTimerEl = document.getElementById("timer");

  const stakePopup = document.getElementById("stakePopup");
  const stakeInput = document.getElementById("stakeInput");
  const stakeSaveBtn = document.getElementById("stake-save-btn");
  const stakeCancelBtn = document.getElementById("stake-cancel-btn");

  // ============================
  // PLAYER RESOLUTION HELPERS
  // ============================
  function getActivePlayerName() {
    return (window.currentPlayerName || window.playerName || "").trim();
  }

  function getCurrentPlayerBalance() {
    const p = getActivePlayerName().toLowerCase();
    
    // 1️⃣ Check local pot balances with case-insensitive key search
    if (window.pot && window.pot.balances) {
      for (const [key, val] of Object.entries(window.pot.balances)) {
        if (key.trim().toLowerCase() === p && val !== undefined && !isNaN(val)) {
          return Number(val);
        }
      }
    }
    
    // 2️⃣ Check Leaderboard scores with case-insensitive key search
    if (window.Leaderboard && window.Leaderboard.scores) {
      for (const [key, val] of Object.entries(window.Leaderboard.scores)) {
        if (key.trim().toLowerCase() === p && val !== undefined && !isNaN(val)) {
          return Number(val);
        }
      }
    }

    // 3️⃣ Fallback to DOM element text if present
    const balanceEl = document.getElementById("player-balance");
    if (balanceEl) {
      const match = balanceEl.textContent.match(/([\d.]+)⚡/);
      if (match && match[1]) {
        return Number(match[1]);
      }
    }

    return 0;
  }

  // ============================
  // RESILIENT ABSOLUTE TIMER
  // ============================
  const Timer = {
    start(question, onTick, onEnd) {
      const duration = question.timer || 60;
      const endTime = question.endTime || (Date.now() + duration * 1000);
      question.endTime = endTime;

      function calculateRemaining() {
        const now = Date.now();
        return Math.max(0, Math.floor((endTime - now) / 1000));
      }

      let timeLeft = calculateRemaining();
      onTick(timeLeft);

      const interval = setInterval(() => {
        timeLeft = calculateRemaining();
        onTick(timeLeft);
        if (timeLeft <= 0) {
          clearInterval(interval);
          onEnd();
        }
      }, 1000);

      return interval;
    }
  };

  const Utils = {
    formatMoney(amount) {
      return Number(amount || 0).toFixed(2);
    }
  };

  // 🔄 BULLETPROOF TAB VISIBILITY RE-SYNC & WAKE-UP HANDLER
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      console.log("Tab focused - checking connection and syncing state...");
      
      if (!window.socket || !window.socket.connected) {
        if (typeof window.socket?.connect === "function") {
          window.socket.connect();
        }
      } else if (window.gameId) {
        window.socket.emit("request_sync", { 
          gameId: window.gameId, 
          playerName: getActivePlayerName() 
        });
      }

      // 🔑 FORCE RE-KICK ACTIVE TIMER LOOP UPON WAKE-UP
      if (window.Engine && window.Engine.currentQuestion && window.Engine.currentQuestion.endTime) {
        clearInterval(window.questionCountdown);
        window.questionCountdown = Timer.start(window.Engine.currentQuestion,
          (timeLeft) => {
            if (qInfo) {
              qInfo.innerHTML = `You chose: ${window.Engine.currentQuestion.userChoice || "--"}<br>
                Stake: ${window.Engine.currentQuestion.stake ? window.Engine.currentQuestion.stake.toFixed(2) : 0}⚡<br>
                Timer: ${formatTime(timeLeft)}`;
            }
          },
          () => {
            if (window.isHost) {
              window.openHostOutcome(window.Engine.currentQuestion.text);
            }
          }
        );
      }
    }
  });

  // ============================
  // GAME OVER MODAL HELPER (SAFE NUMERIC PARSING & GUARD)
  // ============================
  function triggerGameOverModal(leaderboard) {
    if (window.hasProcessedGameOver) return;
    window.hasProcessedGameOver = true;

    window.isGameOver = true;

    const activeCard = document.getElementById("active-card");
    if (activeCard) activeCard.style.display = "none";

    if (typeof window.closeHostOutcome === "function") {
      window.closeHostOutcome();
    }

    const rawName = getActivePlayerName() || window.currentPlayerName || window.playerName || "Player";
    const playerName = rawName.trim().toLowerCase();
    
    let finalBalance = getCurrentPlayerBalance();

    if (leaderboard && Array.isArray(leaderboard) && leaderboard.length > 0) {
      const sorted = [...leaderboard].sort((a, b) => Number(b.balance || 0) - Number(a.balance || 0));
      const index = sorted.findIndex(p => p.name && p.name.trim().toLowerCase() === playerName);
      
      if (index !== -1) {
        const boardBal = Number(sorted[index].balance);
        if (!isNaN(boardBal) && boardBal >= 0) {
          finalBalance = boardBal;
        }
      }
    }

    const urlParams = new URLSearchParams(window.location.search);
    const startingBuyin = urlParams.get("buyin") !== null ? Number(urlParams.get("buyin")) : 20;

    let positionText = "";
    if (finalBalance > startingBuyin) {
      positionText = "Congratulations! You finished in profit! 🏆🎉";
    } else if (finalBalance === startingBuyin) {
      positionText = "Game Over! You broke even. ⚖️";
    } else {
      positionText = "Game Over. You finished in a loss. 📉";
    }

    const messageEl = document.getElementById("gameOverMessage");
    const balanceEl = document.getElementById("gameOverFinalBalance");

    if (messageEl) messageEl.textContent = positionText;
    if (balanceEl) balanceEl.textContent = `Final Balance: ${Number(finalBalance || 0).toFixed(2)}⚡`;

    const rawWallet = localStorage.getItem("user_credit");
    let currentWallet = (rawWallet !== null && !isNaN(parseFloat(rawWallet))) ? parseFloat(rawWallet) : 30.00;
    
    const gameEarnings = Number(finalBalance || 0);
    currentWallet += gameEarnings;

    localStorage.setItem("user_credit", currentWallet.toFixed(2));

    const gameOverModal = document.getElementById("gameOverModal");
    if (gameOverModal) {
      gameOverModal.classList.add("show");
      gameOverModal.style.display = "flex";
    }
  }
  window.triggerGameOverModal = triggerGameOverModal;

  // ============================
  // ENGINE OBJECT
  // ============================
  window.Engine = {
    currentQuestion: null,

    nextQuestion(q) {
      if (window.isGameOver) {
        const activeCard = document.getElementById("active-card");
        if (activeCard) activeCard.style.display = "none";
        return;
      }

      const popContainer = document.getElementById("popularityContainer");
      if (popContainer) popContainer.style.display = "none";

      if (!q || !q.text) {
        const urlParams = new URLSearchParams(window.location.search);
        const gameMode = urlParams.get("mode") || "blitz";
        q = RugbyQuestions.getRand(gameMode);
      }

      if (q && q.current !== undefined) window.currentQuestionNum = q.current;
      if (q && q.total !== undefined) window.totalQuestionsCount = q.total;

      if (cashoutBtn) cashoutBtn.disabled = true;
      if (btnYes) btnYes.disabled = false;
      if (btnNo) btnNo.disabled = false;

      clearInterval(window.questionCountdown);
      clearInterval(window.cashoutCountdown);

      let finalTimer = q && Number(q.timer) >= 60 ? Number(q.timer) : NaN;

      if (isNaN(finalTimer)) {
        const urlParams = new URLSearchParams(window.location.search);
        let parsedTime = Number(urlParams.get("qtime"));
        if (isNaN(parsedTime) || parsedTime < 60) {
          parsedTime = Number(localStorage.getItem("game_qtime"));
        }
        finalTimer = (!isNaN(parsedTime) && parsedTime >= 60) ? parsedTime : 60;
      }

      const startingBalance = getCurrentPlayerBalance();

      this.currentQuestion = { 
        ...q, 
        timer: finalTimer, 
        endTime: q.endTime || (Date.now() + finalTimer * 1000),
        stake: 0, 
        userChoice: null, 
        outcome: null, 
        cashedOut: false,
        hasBeenResolved: false,
        oldBalance: startingBalance
      };

      updateActiveCard(this.currentQuestion);

      window.questionCountdown = Timer.start(this.currentQuestion,
        (timeLeft) => {
          if (qInfo) {
            qInfo.innerHTML = `You chose: ${this.currentQuestion.userChoice || "--"}<br>
              Stake: ${this.currentQuestion.stake ? this.currentQuestion.stake.toFixed(2) : 0}⚡<br>
              Timer: ${formatTime(timeLeft)}`;
          }
        },
        () => {
          if (window.isHost) {
            window.openHostOutcome(this.currentQuestion.text);
          }
        }
      );

      if (window.stakeInterval) {
        clearInterval(window.stakeInterval);
        window.stakeInterval = null;
      }

      if (window.pot && typeof window.pot.startStakeTimer === "function") {
        window.pot.startStakeTimer(
          10000,
          (timeLeft) => window.showCountdown(timeLeft),
          (amount) => {
            window.revealPot(amount);
            if (btnYes) btnYes.disabled = true;
            if (btnNo) btnNo.disabled = true;

            const activeQ = Engine.currentQuestion;
            if (activeQ && activeQ.stake > 0 && !activeQ.cashedOut) {
              if (typeof startCashoutTimer === "function") {
                const dynamicCashoutTime = Math.floor((activeQ.timer || 60) / 2);
                startCashoutTimer(dynamicCashoutTime);
              }
            }
          }
        );
      }
    },

    choose(choice) {
      const q = this.currentQuestion;
      if (!q) return;
      q.userChoice = choice;

      updateActiveCard(q);
      if (btnYes) btnYes.disabled = true;
      if (btnNo) btnNo.disabled = true;
      window.openStakePopup();
      if (cashoutBtn) cashoutBtn.disabled = true;
    },

    cashout() {
      const q = this.currentQuestion;
      if (!q || q.stake <= 0) return;

      clearInterval(window.cashoutCountdown);
      q.cashedOut = true;

      const player = getActivePlayerName();

      if (window.pot && player) {
        window.pot.cashout(player, 0.5, (newPotBalance) => {
          if (typeof window.updatePot === "function") {
            window.updatePot(newPotBalance);
          }
        });
      }

      if (window.socket && window.gameId && player) {
        window.socket.emit("cashout", {
          gameId: window.gameId,
          playerName: player,
          amount: q.stake
        });
      }

      window.totalCashouts++;
      const cashoutEl = document.getElementById("player-cashouts");
      if (cashoutEl) cashoutEl.textContent = `Cash-outs: ${window.totalCashouts}`;

      const finalBalance = getCurrentPlayerBalance();
      q.newBalance = finalBalance;

      const balanceEl = document.getElementById("player-balance");
      if (balanceEl) {
        balanceEl.textContent = `Balance: ${Utils.formatMoney(finalBalance)}⚡`;
      }

      if (typeof Leaderboard !== "undefined" && Leaderboard.update && player) {
        Leaderboard.update(player, finalBalance);
        if (Leaderboard.render) Leaderboard.render();
      }

      if (btnYes) btnYes.disabled = true;
      if (btnNo) btnNo.disabled = true;
      if (cashoutBtn) cashoutBtn.disabled = true;

      if (qInfo) {
        qInfo.innerHTML = `You chose: ${q.userChoice || "--"}<br>
          Stake: ${q.stake.toFixed(2)}⚡ (CASHED OUT)<br>
          <small>Waiting for host outcome...</small>`;
      }
    },

    handleOutcome(outcome, serverWinners = null) {
      if (typeof window.closeHostOutcome === "function") {
        window.closeHostOutcome();
      }

      const q = this.currentQuestion;
      if (!q || q.hasBeenResolved) return;
      q.hasBeenResolved = true;
      q.outcome = outcome;

      const player = getActivePlayerName();

      try {
        if (q.cashedOut) {
          if (qInfo) {
            qInfo.innerHTML += `<br><small>Round Outcome: ${outcome} (You cashed out)</small>`;
          }
        } else {
          let winningPlayers = [];
          if (Array.isArray(serverWinners)) {
            winningPlayers = serverWinners;
          } else if (q.userChoice === outcome && q.stake > 0 && player) {
            winningPlayers.push(player);
          }

          if (window.pot && typeof window.pot.resolveOutcome === "function") {
            window.pot.resolveOutcome(winningPlayers);
          }

          const finalBalance = getCurrentPlayerBalance();
          q.newBalance = finalBalance;

          const balanceEl = document.getElementById("player-balance");
          if (balanceEl) {
            balanceEl.textContent = `Balance: ${Utils.formatMoney(finalBalance)}⚡`;
          }

          if (typeof Leaderboard !== "undefined" && Leaderboard.update && player) {
            Leaderboard.update(player, finalBalance);
            if (Leaderboard.render) Leaderboard.render();
          }

          const didWin = winningPlayers.map(w => w.trim().toLowerCase()).includes(player.trim().toLowerCase());
          if (didWin) {
            window.totalWins = (window.totalWins || 0) + 1;
            const winsEl = document.getElementById("player-wins");
            if (winsEl) winsEl.textContent = `Wins: ${window.totalWins}`;
          }

          if (qInfo) qInfo.innerHTML += `<br><small>Outcome: ${outcome} (${didWin ? "WIN" : "LOST"})</small>`;
        }

        if (typeof History !== "undefined" && typeof History.push === "function") {
          History.push(q);
          if (typeof History.render === "function") History.render();
        }

        if (window.pot && typeof window.pot.resetRound === "function") {
          window.pot.resetRound();
        }
      } catch (err) {
        console.error("Error during round outcome processing:", err);
      }

      const currentQNum = window.currentQuestionNum || (q.current || 0);
      const totalQCount = window.totalQuestionsCount || (q.total || 0);

      if ((currentQNum > 0 && totalQCount > 0 && currentQNum >= totalQCount) || q.isFinalQuestion) {
        window.isGameOver = true;

        const finalLeaderboard = window.pot ? Object.keys(window.pot.balances).map(name => ({
          name,
          balance: window.pot.balances[name]
        })) : [];

        if (window.socket && window.gameId) {
          window.socket.emit("game_over", { gameId: window.gameId, leaderboard: finalLeaderboard });
        }

        triggerGameOverModal(finalLeaderboard);
        return;
      }

      this.startNextCountdown();
    },

    startNextCountdown() {
      if (window.isGameOver) return;

      window.startPostQuestionCountdown(() => {
        if (window.pot) {
          window.pot.startStakeTimer(
            10000,
            (timeLeft) => window.showCountdown(timeLeft),
            (amount) => {
              window.revealPot(amount);
              if (btnYes) btnYes.disabled = true;
              if (btnNo) btnNo.disabled = true;

              const activeQ = Engine.currentQuestion;
              if (activeQ && activeQ.stake > 0 && !activeQ.cashedOut) {
                if (typeof startCashoutTimer === "function") {
                  const dynamicCashoutTime = Math.floor((activeQ.timer || 60) / 2);
                  startCashoutTimer(dynamicCashoutTime);
                }
              }
            }
          );
        }

        if (window.isHost && window.socket) {
          window.socket.emit("next_round", { gameId: window.gameId });
        }
      });
    }
  };

  if (window.socket) {
    window.socket.on("remote_stake_placed", ({ playerName, amount, choice }) => {
      const activePlayer = getActivePlayerName();
      if (window.pot && playerName !== activePlayer) {
        window.pot.stakes[playerName] = (window.pot.stakes[playerName] || 0) + amount;
        window.pot.potBalance += amount;
        if (choice) {
          if (!window.pot.playerChoices) window.pot.playerChoices = {};
          window.pot.playerChoices[playerName] = choice;
        }
      }
    });

    window.socket.on("prediction_made", ({ player, choice }) => {
      if (window.pot) {
        if (!window.pot.playerChoices) window.pot.playerChoices = {};
        window.pot.playerChoices[player] = choice;
      }
    });

    window.socket.on("remote_cashout", ({ playerName, amount }) => {
      const activePlayer = getActivePlayerName();
      if (window.pot && playerName !== activePlayer) {
        const refund = amount * 0.5;
        window.pot.potBalance -= refund;
        window.pot.stakes[playerName] = 0;
        if (window.pot.playerChoices) delete window.pot.playerChoices[playerName];
      }
    });

    window.socket.on("round_outcome", ({ outcome, winners }) => {
      Engine.handleOutcome(outcome, winners);
    });

    window.socket.on("player_joined", ({ playerName, balance }) => {
      if (window.pot && window.pot.balances) {
        window.pot.balances[playerName] = balance !== undefined ? balance : 0;
      }
      if (typeof Leaderboard !== "undefined" && Leaderboard.update) {
        Leaderboard.update(playerName, balance !== undefined ? balance : 0);
        if (Leaderboard.render) Leaderboard.render();
      }
    });

    window.socket.on("game_over", ({ leaderboard }) => {
      triggerGameOverModal(leaderboard);
    });

    // Handle incoming server sync state response
    window.socket.on("sync_state", (serverState) => {
      if (!serverState) return;
      if (Engine.currentQuestion && serverState.endTime) {
        Engine.currentQuestion.endTime = serverState.endTime;
      }
      // 🔑 Sync pot balance and force display visible if stake window is closed
      if (serverState.potBalance !== undefined && window.pot) {
        window.pot.potBalance = serverState.potBalance;
        
        const potEl = document.getElementById("potAmount");
        if (potEl) {
          if (!window.isStakeWindowActive) {
            potEl.style.removeProperty("display");
            potEl.style.display = "inline";
          }
          potEl.textContent = `Pot: £${Number(serverState.potBalance).toFixed(2)}`;
        }
      }
    });
  }

  if (btnYes) {
    btnYes.onclick = () => {
      Engine.choose("YES");
      if (typeof sendPrediction === "function") sendPrediction("YES");
    };
  }

  if (btnNo) {
    btnNo.onclick = () => {
      Engine.choose("NO");
      if (typeof sendPrediction === "function") sendPrediction("NO");
    };
  }

  if (cashoutBtn) {
    cashoutBtn.onclick = () => Engine.cashout();
  }

  window.openStakePopup = function () {
    if (!stakePopup) return;
    stakePopup.style.display = "flex";
    if (stakeInput) stakeInput.value = "";
  };

  if (stakeSaveBtn) {
    stakeSaveBtn.onclick = () => {
      const amount = Number(stakeInput?.value);

      if (isNaN(amount) || amount <= 0) {
        alert("Enter a valid stake amount.");
        return;
      }

      const player = getActivePlayerName();

      if (window.pot && window.pot.balances[player] !== undefined && amount > window.pot.balances[player]) {
        alert("Not enough balance for this stake.");
        return;
      }

      const q = Engine.currentQuestion;
      if (!q) {
        alert("No active question found.");
        return;
      }

      q.stake = amount;

      if (window.pot && player) {
        window.pot.stake(player, amount, (newPotBalance) => {
          if (typeof window.updatePot === "function") {
            window.updatePot(newPotBalance);
          }
        });
        if (!window.pot.playerChoices) window.pot.playerChoices = {};
        window.pot.playerChoices[player] = q.userChoice;
      }

      if (window.socket && player) {
        window.socket.emit("stake_placed", {
          gameId: window.gameId,
          playerName: player,
          amount,
          choice: q.userChoice
        });
      }

      const balanceEl = document.getElementById("player-balance");
      if (balanceEl) {
        balanceEl.textContent = `Balance: ${Utils.formatMoney(getCurrentPlayerBalance())}⚡`;
      }

      if (qInfo) {
        qInfo.innerHTML = `
          You chose: ${q.userChoice}<br>
          Stake: ${amount.toFixed(2)}⚡
        `;
      }

      if (cashoutBtn) {
        cashoutBtn.disabled = false;
        cashoutBtn.style.opacity = "1";
        cashoutBtn.textContent = `Cash Out: ${(amount * 0.5).toFixed(2)}⚡`;
      }

      if (stakePopup) stakePopup.style.display = "none";
    };
  }

  if (stakeCancelBtn) {
    stakeCancelBtn.onclick = () => {
      const q = Engine.currentQuestion;
      if (q) {
        q.userChoice = null;
        q.stake = 0;
      }

      const remainingTime = q && q.endTime ? Math.max(0, Math.floor((q.endTime - Date.now()) / 1000)) : 60;
      if (qInfo) {
        qInfo.innerHTML = `
          You chose: --<br>
          Stake: --<br>
          Timer: ${formatTime(remainingTime)}
        `;
      }

      if (stakePopup) stakePopup.style.display = "none";

      if (btnYes) btnYes.disabled = false;
      if (btnNo) btnNo.disabled = false;
      if (cashoutBtn) cashoutBtn.disabled = true;
    };
  }

  window.showCountdown = function (timeLeft) {
    window.isStakeWindowActive = true;
    document.body.classList.add("stake-active");

    const stakeEl = document.getElementById("stakeCountdown");
    const postEl = document.getElementById("postQuestionCountdown");
    const potEl = document.getElementById("potAmount");

    if (postEl) postEl.style.display = "none";

    if (potEl) {
      potEl.style.display = "none";
    }

    if (stakeEl) {
      stakeEl.style.display = "inline";
      stakeEl.textContent = `Stake window: ${timeLeft}s`;
    }
  };

  window.revealPot = function (amount) {
    window.isStakeWindowActive = false;
    document.body.classList.remove("stake-active");

    const countdownEl = document.getElementById("stakeCountdown");
    const potEl = document.getElementById("potAmount");

    if (countdownEl) countdownEl.style.display = "none";
    if (potEl) {
      potEl.style.display = "inline";
      potEl.textContent = "Pot: " + Number(amount || 0).toFixed(2) + "⚡";
    }

    const popContainer = document.getElementById("popularityContainer");
    if (popContainer) {
      popContainer.style.display = "block";

      let totalYes = 0;
      let totalNo = 0;

      const stakes = window.pot?.stakes || {};
      const choices = window.pot?.playerChoices || window.pot?.choices || {};

      const activeQ = Engine.currentQuestion;
      const myName = getActivePlayerName();

      if (activeQ && activeQ.userChoice && activeQ.stake > 0 && myName) {
        if (!choices[myName]) choices[myName] = activeQ.userChoice;
        if (!stakes[myName]) stakes[myName] = activeQ.stake;
      }

      for (const [player, choice] of Object.entries(choices)) {
        const stakeAmt = Number(stakes[player]) || 0;
        const normalizedChoice = String(choice).trim().toUpperCase();

        if (normalizedChoice === "YES") {
          totalYes += stakeAmt;
        } else if (normalizedChoice === "NO") {
          totalNo += stakeAmt;
        }
      }

      const totalStaked = totalYes + totalNo;
      let yesPct = 50;
      let noPct = 50;

      if (totalStaked > 0) {
        yesPct = Math.round((totalYes / totalStaked) * 100);
        noPct = 100 - yesPct;
      } else {
        yesPct = 50;
        noPct = 50;
      }

      const labelYes = document.getElementById("labelYesPct");
      const labelNo = document.getElementById("labelNoPct");
      if (labelYes) labelYes.textContent = `YES: ${yesPct}%`;
      if (labelNo) labelNo.textContent = `NO: ${noPct}%`;

      const barYes = document.getElementById("barYes");
      const barNo = document.getElementById("barNo");
      if (barYes) barYes.style.width = `${yesPct}%`;
      if (barNo) barNo.style.width = `${noPct}%`;
    }
  };

  function updateActiveCard(q) {
    const safeStake = (typeof q.stake === "number" && !isNaN(q.stake)) ? q.stake : 0;
    const qText = document.getElementById("q-text");
    const qInfo = document.getElementById("q-info");

    const remainingTime = q.endTime ? Math.max(0, Math.floor((q.endTime - Date.now()) / 1000)) : (q.timer || 60);

    if (qText) qText.textContent = q.text;
    if (qInfo) {
      qInfo.innerHTML = `
        You chose: ${q.userChoice || "--"}<br>
        Stake: ${safeScale(safeStake)}⚡<br>
        Timer: ${formatTime(remainingTime)}
      `;
    }
  }

  function safeScale(val) {
    return Number(val || 0).toFixed(2);
  }

  window.updateActiveCard = updateActiveCard;

  window.startPostQuestionCountdown = function (onDone, duration = 3) {
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
      if (count > 0) {
        el.textContent = count;
      } else if (count === 0) {
        el.textContent = "GO!";
        clearInterval(interval);
        setTimeout(() => {
          el.style.display = "none";
          if (typeof onDone === "function") onDone();
        }, 500);
      }
    }, 1000);
  };

  window.openHostOutcome = function (questionText) {
    const panel = document.querySelector(".host-outcome-panel");
    const text = document.getElementById("host-outcome-question");
    if (!panel || !text) return;
    text.textContent = questionText;
    panel.classList.add("active");
  };

  window.closeHostOutcome = function () {
    const panel = document.querySelector(".host-outcome-panel");
    if (panel) panel.classList.remove("active");
  };

  window.startCashoutTimer = function (duration) {
    let timeLeft = duration || Math.floor((Engine.currentQuestion?.timer || 60) / 2);

    if (cashoutTimerEl) cashoutTimerEl.textContent = formatTime(timeLeft);

    if (window.cashoutCountdown) {
      clearInterval(window.cashoutCountdown);
    }

    window.cashoutCountdown = setInterval(() => {
      timeLeft--;
      if (cashoutTimerEl) cashoutTimerEl.textContent = formatTime(timeLeft);
      if (timeLeft <= 0) {
        clearInterval(window.cashoutCountdown);
        if (cashoutBtn) cashoutBtn.disabled = true;
      }
    }, 1000);
  };
});
