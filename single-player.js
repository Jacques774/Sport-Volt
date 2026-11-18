  // ============================
  // SOLO ENGINE CORE (CORRECTED TIMER SEPARATION)
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

      const finalTimer = q.timer || 15;

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

      // 🔑 1. CARD QUESTION TIMER (Updates #q-info only)
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

      // Start 5-second stake window, then kick off the cashout button timer
      startStakeWindow(5, () => {
        if (btnYes) btnYes.disabled = true;
        if (btnNo) btnNo.disabled = true;

        const activeQ = SoloEngine.currentQuestion;
        if (activeQ && activeQ.stake > 0 && !activeQ.cashedOut) {
          // 🔑 2. CASHOUT BUTTON TIMER (Updates #timer element by the cashout button)
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
  // CASHOUT BUTTON TIMER HELPER
  // ============================
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

  function updateActiveCard(q) {
    const safeStake = (typeof q.stake === "number" && !isNaN(q.stake)) ? q.stake : 0;
    const remainingTime = q.endTime ? Math.max(0, Math.floor((q.endTime - Date.now()) / 1000)) : (q.timer || 15);

    if (qText) qText.textContent = q.text;
    if (qInfo) {
      qInfo.innerHTML = `
        You chose: ${q.userChoice || "--"}<br>
        Stake: ${safeStake.toFixed(2)}⚡<br>
        Timer: ${formatTime(remainingTime)}
      `;
    }
  }
