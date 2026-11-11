/*******************************
 * HISTORY MODULE
 *******************************/
window.History = {
  items: [],

  push(entry) {
    // Timestamp for display
    entry.timestamp = new Date();

    // Store entry safely with parsed numbers
    entry.oldBalance = Number(entry.oldBalance || 0);
    entry.newBalance = Number(entry.newBalance || entry.oldBalance);

    this.items.push(entry);

    // Re-render list
    this.render();
  },

  formatProfit(entry) {
    const oldBal = typeof entry.oldBalance === "number" ? entry.oldBalance : 0;
    const newBal = typeof entry.newBalance === "number" ? entry.newBalance : 0;
    const profit = newBal - oldBal;

    if (profit > 0)
      return `<span class="profit-pos">(+£${profit.toFixed(2)})</span>`;

    if (profit < 0)
      return `<span class="profit-neg">(-£${Math.abs(profit).toFixed(2)})</span>`;

    return `<span class="profit-zero">(£0)</span>`;
  },

  formatTime(date) {
    const validDate = date instanceof Date ? date : new Date();
    const d = validDate.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });

    const t = validDate.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit"
    });

    return `${d} • ${t}`;
  },

  outcomeClass(entry) {
    if (entry.cashedOut) return "outcome-cash";
    if (entry.userChoice === entry.outcome) return "outcome-yes";
    return "outcome-no";
  },

  outcomeText(entry) {
    if (entry.cashedOut) return "CASHED OUT";
    if (entry.outcome === "YES") return "YES ✔";
    if (entry.outcome === "NO") return "NO ✘";
    return entry.outcome || "--";
  },

  render() {
    const container = document.querySelector(".history-list");
    if (!container) return;

    container.innerHTML = this.items
      .map(entry => {
        const oldBal = typeof entry.oldBalance === "number" ? entry.oldBalance : 0;
        const newBal = typeof entry.newBalance === "number" ? entry.newBalance : oldBal;

        return `
          <div class="history-card ${this.outcomeClass(entry)}">
            
            <div class="history-question">${entry.text || "Unknown question"}</div>

            <div class="history-outcome-text">${this.outcomeText(entry)}</div>

            <div class="history-balance">
              £${oldBal.toFixed(2)} → £${newBal.toFixed(2)}
              ${this.formatProfit(entry)}
            </div>

            <div class="history-time">${this.formatTime(entry.timestamp)}</div>

          </div>
        `;
      })
      .join("");
  }
};

/*******************************
 * HISTORY PANEL (SLIDE-UP)
 *******************************/
window.openHistory = function () {
  const panel = document.getElementById("historyPanel");
  if (panel) {
    panel.classList.add("active");
    // Ensure history list updates instantly upon opening
    if (window.History && typeof window.History.render === "function") {
      window.History.render();
    }
  }
};

window.closeHistory = function () {
  const panel = document.getElementById("historyPanel");
  if (panel) {
    panel.classList.remove("active");
  }
};
