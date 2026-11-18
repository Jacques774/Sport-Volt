import { SinglePlayerQuestions } from "./SinglePlayerQuestions.js";

// ============================
// SINGLE PLAYER QUESTION SYSTEM (NON-REPEATING RANDOM PICKER)
// ============================
let lastQuestionId = null;

const SoloQuestionPicker = {
  getRand() {
    let deck = SinglePlayerQuestions;

    if (!deck || deck.length === 0) {
      return { id: "fallback", text: "Will a try be scored in the next passage of play?", youtubeId: "389R5Kj-k98", timer: 15 };
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

// 🔑 TIMER FORMATTER: Converts total seconds into "Xm Ys" format
function formatTime(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  
  if (mins > 0) {
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }
  return `${secs}s`;
}

document.addEventListener("DOMContentLoaded", () => {
  // ============================
  // SOLO GAME STATE
  // ============================
  window.playerName = "Solo Player";
  let balance = 50.00;
  let currentQuestionIndex = 0;
  let totalQuestions = 20;
  let totalWins = 0;
  let totalCashouts = 0;

  let questionCountdown = null;
  let cashoutCountdown = null;
  let stakeTimerInterval = null;

  // DOM Elements
  const setupSlide = document.getElementById("playerSetupSlide");
  const dashboard = document.getElementById("dashboard");
  const playerNameInput = document.getElementById("player-name-input");
  const clipCodeInput = document.getElementById("clip-code-input");
  const startSoloBtn = document.getElementById("start-solo-btn");

  const playerNameEl = document.getElementById("player-name");
  const playerBalanceEl = document.getElementById("player-balance");
  const questionTallyEl = document.getElementById("player-question-tally");
  const playerWinsEl = document.getElementById("player-wins");
  const playerCashoutsEl = document.getElementById("player-cashouts");

  const qText = document.getElementById("q-text");
  const qInfo = document.getElementById("q-info");
  const timerEl = document.getElementById("timer");

  const btnYes = document.getElementById("btn-yes");
  const btnNo = document.getElementById("btn-no");
  const cashoutBtn = document.getElementById("cashout-btn");

  // YouTube Container
  const youtubeContainer = document.getElementById("youtubeContainer");
  const youtubePlayer = document.getElementById("youtubePlayer");

  // Keypad & Stake Popup
  const stakePopup = document.getElementById("stakePopup");
  const stakeInput = document.getElementById("stakeInput");
  const stakeSaveBtn = document.getElementById("stake-save-btn");
  const stakeCancelBtn = document.getElementById("stake-cancel-btn");

  // Game Over Modal
  const gameOverModal = document.getElementById("gameOverModal");
  const gameOverMessage = document.getElementById("gameOverMessage");
  const gameOverFinalBalance = document.getElementById("gameOverFinalBalance");
  const logoutBtn = document.getElementById("logout-btn");

  // Pull wallet credit from localStorage if available
  const rawInitCredit = localStorage.getItem("user_credit");
  if (rawInitCredit !== null && !isNaN(parseFloat(rawInitCredit))) {
    balance = parseFloat(rawInitCredit);
  }

  // ============================
  // CUSTOM STAKE KEYPAD BINDINGS
  // ============================
  let currentStakeValue = "";

  window.pressKey = function(char) {
    const display = document.getElementById("stakeDisplay");
    
    if (char === 'C') {
      currentStakeValue = "";
    } else if (char === 'ALL_IN') {
      currentStakeValue = Math.floor(balance).toString();
    } else {
      if (currentStakeValue.length < 6) {
        currentStakeValue += char;
      }
    }

    if (display) {
      display.textContent = currentStakeValue === "" ? "0" : currentStakeValue;
    }
    if (stakeInput) {
      stakeInput.value = currentStakeValue;
    }
  };

  // ============================
  // START SOLO GAME
  // ============================
  if (startSoloBtn) {
    startSoloBtn.addEventListener("click", () => {
      const nameVal = playerNameInput ? playerNameInput.value.trim() : "";
      if (nameVal) window.playerName = nameVal;

      console.log(`🚀 Starting Solo Game Session for ${window.playerName}`);

      if (setupSlide) {
        setupSlide.style.display = "none";
        setupSlide.classList.add("hidden");
      }
      if (dashboard) {
        dashboard.classList.remove("hidden");
        dashboard.style.opacity = "1";
      }

      if (playerNameEl) playerNameEl.textContent = `Player: ${window.playerName}`;
      updateBalanceDisplay();

      startPreCountdown(() => {
        SoloEngine.nextQuestion();
      });
    });
  }

  function updateBalanceDisplay() {
    if (playerBalanceEl) {
      playerBalanceEl.textContent = `Balance: ${Number(balance).toFixed(2)}⚡`;
    }
  }

  // ============================
  // 3-2-1 GO PRE-COUNTDOWN
  // ============================
  function startPreCountdown(onDone) {
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
  }

  // ============================
  // SOLO ENGINE CORE
  // ============================
  const SoloEngine = {
    currentQuestion: null,

    nextQuestion() {
      if (window.isGameOver) return;

      const q = SoloQuestionPicker.getRand();

      if (cashoutBtn) {
        cashoutBtn.disabled = true;
        cashoutBtn.textContent = "Cash Out: --";
      }
      if (btnYes) btnYes.disabled = false;
      if (btnNo) btnNo.disabled = false;

      clearInterval(questionCountdown);
      clearInterval(cashoutCountdown);
      clearInterval(stakeTimerInterval);

      const finalTimer = q.timer || 60;

      this.currentQuestion = { 
        ...q, 
        timer: finalTimer, 
        endTime: Date.now() + finalTimer * 1000,
        stake: 0, 
        userChoice: null, 
        cashedOut: false 
      };

      currentQuestionIndex++;
      if (questionTallyEl) {
        questionTallyEl.textContent = `Question ${currentQuestionIndex} of ${totalQuestions}`;
      }

      updateActiveCard(this.currentQuestion);

      // 📺 Embed & Play YouTube Clip
      if (youtubeContainer && youtubePlayer) {
        const videoId = this.currentQuestion.youtubeId || "389R5Kj-k98";
        youtubeContainer.style.display = "block";
        youtubePlayer.innerHTML = `<iframe src="https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&enablejsapi=1" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
      }

      // 1. Overall Question Timer (Updates card info #q-info)
      questionCountdown = setInterval(() => {
        const remaining = Math.max(0, Math.floor((this.currentQuestion.endTime - Date.now()) / 1000));
        if (qInfo) {
          qInfo.innerHTML = `You chose: ${this.currentQuestion.userChoice || "--"}<br>
            Stake: ${this.currentQuestion.stake ? this.currentQuestion.stake.toFixed(2) : 0}⚡<br>
            Timer: ${formatTime(remaining)}`;
        }
        if (remaining <= 0) {
          clearInterval(questionCountdown);
          clearInterval(cashoutCountdown);
          resolveSoloOutcome();
        }
      }, 1000);

      // 2. Stake Window Countdown (20 seconds)
      startStakeWindow(20, () => {
        if (btnYes) btnYes.disabled = true;
        if (btnNo) btnNo.disabled = true;

        const activeQ = SoloEngine.currentQuestion;
        if (activeQ && activeQ.stake > 0 && !activeQ.cashedOut) {
          // Kick off Cashout Button Timer once stake window closes
          startCashoutTimer(Math.floor(activeQ.timer / 2));
        } else if (timerEl) {
          timerEl.textContent = "Cash out: --s";
        }
      });
    },

    choose(choice) {
      const q = this.currentQuestion;
      if (!q) return;
      q.userChoice = choice;

      updateActiveCard(q);
      if (btnYes) btnYes.disabled = true;
      if (btnNo) btnNo.disabled = true;
      openStakePopup();
      if (cashoutBtn) cashoutBtn.disabled = true;
    },

    cashout() {
      const q = this.currentQuestion;
      if (!q || q.stake <= 0 || q.cashedOut) return;

      clearInterval(cashoutCountdown);
      q.cashedOut = true;

      const refund = q.stake * 0.5;
      balance += refund;
      updateBalanceDisplay();

      totalCashouts++;
      if (playerCashoutsEl) playerCashoutsEl.textContent = `Cash-outs: ${totalCashouts}`;

      if (btnYes) btnYes.disabled = true;
      if (btnNo) btnNo.disabled = true;
      if (cashoutBtn) cashoutBtn.disabled = true;
      if (timerEl) timerEl.textContent = "Cashed Out";

      if (qInfo) {
        qInfo.innerHTML = `You chose: ${q.userChoice || "--"}<br>
          Stake: ${q.stake.toFixed(2)}⚡ (CASHED OUT +${refund.toFixed(2)}⚡)<br>
          <small>Next round starting...</small>`;
      }

      setTimeout(() => {
        proceedToNextRound();
      }, 1200);
    }
  };

  // ============================
  // STAKE WINDOW & CASHOUT TIMERS
  // ============================
  function startStakeWindow(duration, onComplete) {
    window.isStakeWindowActive = true;
    document.body.classList.add("stake-active");

    const stakeEl = document.getElementById("stakeCountdown");
    const potEl = document.getElementById("potAmount");

    if (potEl) potEl.style.display = "none";
    if (stakeEl) {
      stakeEl.style.display = "inline";
      stakeEl.textContent = `Stake window: ${duration}s`;
    }

    let timeLeft = duration;
    clearInterval(stakeTimerInterval);
    stakeTimerInterval = setInterval(() => {
      timeLeft--;
      if (stakeEl) stakeEl.textContent = `Stake window: ${timeLeft}s`;

      if (timeLeft <= 0) {
        clearInterval(stakeTimerInterval);
        window.isStakeWindowActive = false;
        document.body.classList.remove("stake-active");
        if (stakeEl) stakeEl.style.display = "none";
        if (potEl) {
          potEl.style.display = "inline";
          potEl.textContent = `Pot: ${(SoloEngine.currentQuestion?.stake * 2 || 0).toFixed(2)}⚡`;
        }
        if (typeof onComplete === "function") onComplete();
      }
    }, 1000);
  }

  function startCashoutTimer(duration) {
    let timeLeft = duration;
    if (timerEl) timerEl.textContent = `Cash out: ${formatTime(timeLeft)}`;

    clearInterval(cashoutCountdown);
    cashoutCountdown = setInterval(() => {
      timeLeft--;
      if (timerEl) timerEl.textContent = `Cash out: ${formatTime(timeLeft)}`;
      
      if (timeLeft <= 0) {
        clearInterval(cashoutCountdown);
        if (cashoutBtn) cashoutBtn.disabled = true;
        if (timerEl) timerEl.textContent = "Cash out: Expired";
      }
    }, 1000);
  }

  // ============================
  // RESOLVE SOLO QUESTION OUTCOME
  // ============================
  function resolveSoloOutcome() {
    clearInterval(questionCountdown);
    clearInterval(cashoutCountdown);

    const q = SoloEngine.currentQuestion;
    if (!q || q.cashedOut) {
      proceedToNextRound();
      return;
    }

    // Solo Outcome Simulator (50/50 win/loss)
    const outcome = Math.random() > 0.5 ? q.userChoice : (q.userChoice === "YES" ? "NO" : "YES");
    const isWin = (q.userChoice === outcome && q.stake > 0);

    if (isWin) {
      const payout = q.stake * 2;
      balance += payout;
      updateBalanceDisplay();

      totalWins++;
      if (playerWinsEl) playerWinsEl.textContent = `Wins: ${totalWins}`;

      if (qInfo) qInfo.innerHTML += `<br><small style="color:var(--yes-green);">Outcome: ${outcome} (WIN! +${payout.toFixed(2)}⚡)</small>`;
    } else {
      if (qInfo) qInfo.innerHTML += `<br><small style="color:var(--no-red);">Outcome: ${outcome} (LOST ${q.stake.toFixed(2)}⚡)</small>`;
    }

    setTimeout(() => {
      proceedToNextRound();
    }, 1500);
  }

  function proceedToNextRound() {
    if (currentQuestionIndex >= totalQuestions) {
      triggerGameOver();
      return;
    }

    startPostQuestionCountdown(() => {
      SoloEngine.nextQuestion();
    });
  }

  function startPostQuestionCountdown(onDone, duration = 3) {
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
      } else {
        el.textContent = "GO!";
        clearInterval(interval);
        setTimeout(() => {
          el.style.display = "none";
          if (typeof onDone === "function") onDone();
        }, 500);
      }
    }, 1000);
  }

  // ============================
  // STAKE POPUP BINDINGS
  // ============================
  function openStakePopup() {
    if (!stakePopup) return;
    currentStakeValue = "";
    const display = document.getElementById("stakeDisplay");
    if (display) display.textContent = "0";
    if (stakeInput) stakeInput.value = "";
    stakePopup.style.display = "flex";
  }

  if (stakeSaveBtn) {
    stakeSaveBtn.onclick = () => {
      const amount = Number(currentStakeValue || stakeInput?.value);

      if (isNaN(amount) || amount <= 0) {
        alert("Enter a valid stake amount.");
        return;
      }

      if (amount > balance) {
        alert("Not enough balance for this stake.");
        return;
      }

      const q = SoloEngine.currentQuestion;
      if (!q) return;

      balance -= amount;
      q.stake = amount;
      updateBalanceDisplay();

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
      const q = SoloEngine.currentQuestion;
      if (q) {
        q.userChoice = null;
        q.stake = 0;
      }

      if (stakePopup) stakePopup.style.display = "none";
      if (btnYes) btnYes.disabled = false;
      if (btnNo) btnNo.disabled = false;
      if (cashoutBtn) cashoutBtn.disabled = true;
    };
  }

  // ============================
  // GAME OVER & WALLET SYNC
  // ============================
  function triggerGameOver() {
    window.isGameOver = true;
    if (youtubeContainer) youtubeContainer.style.display = "none";
    if (youtubePlayer) youtubePlayer.innerHTML = "";

    const activeCard = document.getElementById("active-card");
    if (activeCard) activeCard.style.display = "none";

    localStorage.setItem("user_credit", balance.toFixed(2));
    console.log(`⚡ Solo game over. Final balance saved to wallet: ${balance.toFixed(2)}⚡`);

    if (gameOverMessage) {
      gameOverMessage.innerHTML = balance >= 50 ? "Fantastic run! You finished in profit! 🎉" : "Game complete! Great effort on the blitz. 🏉";
    }
    if (gameOverFinalBalance) {
      gameOverFinalBalance.textContent = `Final Balance: ${balance.toFixed(2)}⚡`;
    }
    if (gameOverModal) {
      gameOverModal.style.display = "flex";
    }
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      localStorage.setItem("user_credit", balance.toFixed(2));
      window.location.href = "MainMenu.html";
    });
  }

  // Button Listeners
  if (btnYes) btnYes.onclick = () => SoloEngine.choose("YES");
  if (btnNo) btnNo.onclick = () => SoloEngine.choose("NO");
  if (cashoutBtn) cashoutBtn.onclick = () => SoloEngine.cashout();

  function updateActiveCard(q) {
    const safeStake = (typeof q.stake === "number" && !isNaN(q.stake)) ? q.stake : 0;
    const remainingTime = q.endTime ? Math.max(0, Math.floor((q.endTime - Date.now()) / 1000)) : (q.timer || 60);

    if (qText) qText.textContent = q.text;
    if (qInfo) {
      qInfo.innerHTML = `
        You chose: ${q.userChoice || "--"}<br>
        Stake: ${safeStake.toFixed(2)}⚡<br>
        Timer: ${formatTime(remainingTime)}
      `;
    }
  }
});

console.log("✅ independent single-player.js engine loaded successfully");
