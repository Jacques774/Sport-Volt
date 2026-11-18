import { RugbyBlitzQuestions } from './RugbyQuestions-blitz.js';

// Game State
let playerName = "Solo Player";
let balance = 50.00;
let currentQuestionIndex = 0;
let totalQuestions = 20;
let selectedChoice = null;
let currentStake = 0;
let timerInterval = null;

// DOM Elements
const setupSlide = document.getElementById("playerSetupSlide");
const dashboard = document.getElementById("dashboard");
const playerNameInput = document.getElementById("player-name-input");
const startSoloBtn = document.getElementById("start-solo-btn");

const playerNameEl = document.getElementById("player-name");
const playerBalanceEl = document.getElementById("player-balance");
const questionTallyEl = document.getElementById("player-question-tally");
const questionTextEl = document.getElementById("q-text");
const qInfoEl = document.getElementById("q-info");
const timerEl = document.getElementById("timer");

const btnYes = document.getElementById("btn-yes");
const btnNo = document.getElementById("btn-no");
const cashoutBtn = document.getElementById("cashout-btn");

// YouTube Container Elements
const youtubeContainer = document.getElementById("youtubeContainer");
const youtubePlayer = document.getElementById("youtubePlayer");

// Keypad & Stake Popup Elements
const stakePopup = document.getElementById("stakePopup");
const stakeDisplay = document.getElementById("stakeDisplay");
const stakeInput = document.getElementById("stakeInput");
const stakeSaveBtn = document.getElementById("stake-save-btn");
const stakeCancelBtn = document.getElementById("stake-cancel-btn");

// Game Over Modal Elements
const gameOverModal = document.getElementById("gameOverModal");
const gameOverMessage = document.getElementById("gameOverMessage");
const gameOverFinalBalance = document.getElementById("gameOverFinalBalance");
const logoutBtn = document.getElementById("logout-btn");

// Initialize Single Player Flow
startSoloBtn.addEventListener("click", () => {
  const nameVal = playerNameInput.value.trim();
  if (nameVal) playerName = nameVal;

  setupSlide.classList.add("hidden");
  dashboard.classList.remove("hidden");

  playerNameEl.textContent = `Player: ${playerName}`;
  updateBalanceDisplay();
  loadQuestion(0);
});

function updateBalanceDisplay() {
  playerBalanceEl.textContent = `Balance: ${balance.toFixed(2)}⚡`;
}

function loadQuestion(index) {
  if (index >= RugbyBlitzQuestions.length || index >= totalQuestions) {
    endGame();
    return;
  }

  currentQuestionIndex = index;
  const q = RugbyBlitzQuestions[index];

  questionTallyEl.textContent = `Question ${index + 1} of ${totalQuestions}`;
  questionTextEl.textContent = q.text;
  qInfoEl.innerHTML = `You chose: --<br>Stake: --<br>Timer: Active`;

  // Reset choices visual state
  btnYes.classList.remove("selected");
  btnNo.classList.remove("selected");
  selectedChoice = null;
  currentStake = 0;

  // Handle YouTube Video Clip Integration
  if (q.youtubeId) {
    youtubeContainer.style.display = "block";
    youtubePlayer.innerHTML = `<iframe src="https://www.youtube.com/embed/${q.youtubeId}?autoplay=1&enablejsapi=1" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
  } else {
    youtubeContainer.style.display = "none";
    youtubePlayer.innerHTML = "";
  }

  startQuestionTimer(q.timerSeconds || 10);
}

function startQuestionTimer(duration) {
  let timeLeft = duration;
  timerEl.textContent = `Cash out: ${timeLeft}s`;

  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    timeLeft--;
    timerEl.textContent = `Cash out: ${timeLeft}s`;

    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      // Auto-resolve question outcome for solo mode simulation
      resolveSoloQuestion();
    }
  }, 1000);
}

// Choice Click Triggers Stake Keypad
btnYes.addEventListener("click", () => openStakePopup("YES"));
btnNo.addEventListener("click", () => openStakePopup("NO"));

function openStakePopup(choice) {
  selectedChoice = choice;
  if (choice === "YES") {
    btnYes.classList.add("selected");
    btnNo.classList.remove("selected");
  } else {
    btnNo.classList.add("selected");
    btnYes.classList.remove("selected");
  }

  currentStake = 0;
  stakeDisplay.textContent = "0";
  stakeInput.value = "0";
  stakePopup.style.display = "flex";
}

// Keypad Input Logic
window.pressKey = function(key) {
  let valStr = stakeInput.value || "0";

  if (key === 'C') {
    valStr = "0";
  } else if (key === 'ALL_IN') {
    valStr = Math.floor(balance).toString();
  } else {
    if (valStr === "0") valStr = key;
    else valStr += key;
  }

  const numVal = Number(valStr);
  if (numVal > balance) {
    valStr = Math.floor(balance).toString();
  }

  stakeInput.value = valStr;
  stakeDisplay.textContent = valStr;
};

stakeCancelBtn.addEventListener("click", () => {
  stakePopup.style.display = "none";
});

stakeSaveBtn.addEventListener("click", () => {
  const stakeValue = Number(stakeInput.value);
  if (stakeValue <= 0 || stakeValue > balance) {
    alert("Please enter a valid stake within your available balance.");
    return;
  }

  currentStake = stakeValue;
  balance -= currentStake;
  updateBalanceDisplay();

  qInfoEl.innerHTML = `You chose: <span style="color:${selectedChoice==='YES'?'var(--yes-green)':'var(--no-red)'}; font-weight:700;">${selectedChoice}</span><br>Stake: ${currentStake}⚡<br>Timer: Active`;
  stakePopup.style.display = "none";
});

// Resolve Solo Question & Move to Next
function resolveSoloQuestion() {
  clearInterval(timerInterval);

  // Simulated Solo Outcome (Random 50/50 win/loss for instant single-player pacing)
  const isWin = Math.random() > 0.5;

  if (currentStake > 0) {
    if (isWin) {
      const payout = currentStake * 2;
      balance += payout;
      showAlert(`Question ${currentQuestionIndex + 1} Result: WIN! +${payout}⚡`);
    } else {
      showAlert(`Question ${currentQuestionIndex + 1} Result: LOSS. Better luck next time!`);
    }
    updateBalanceDisplay();
  }

  // Advance to next question after brief pause
  setTimeout(() => {
    loadQuestion(currentQuestionIndex + 1);
  }, 1500);
}

function endGame() {
  clearInterval(timerInterval);
  youtubeContainer.style.display = "none";
  youtubePlayer.innerHTML = "";

  gameOverMessage.innerHTML = balance >= 50 ? "Fantastic run! You finished in profit! 🎉" : "Game complete! Great effort on the blitz. 🏉";
  gameOverFinalBalance.textContent = `Final Balance: ${balance.toFixed(2)}⚡`;
  gameOverModal.style.display = "flex";
}

logoutBtn.addEventListener("click", () => {
  window.location.href = "https://thesportvolt.wixsite.com/sport-volt";
});

function showAlert(msg) {
  // Uses your existing custom alert modal if present, or fallback
  const alertModal = document.getElementById("custom-alert-modal");
  const alertMsg = document.getElementById("custom-alert-message");
  const alertOk = document.getElementById("custom-alert-ok");

  if (alertModal && alertMsg) {
    alertMsg.textContent = msg;
    alertModal.style.display = "flex";
    alertOk.onclick = () => { alertModal.style.display = "none"; };
  } else {
    console.log(msg);
  }
}
