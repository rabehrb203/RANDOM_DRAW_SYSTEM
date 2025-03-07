let currentParticipant = null;

function showLoginSection() {
  fadeOut("initialSection", () => {
    fadeIn("loginSection");
  });
}

function checkParticipant() {
  const participantId = document.getElementById("participantId").value;
  if (!participantId) {
    showNotification("Please enter your ID number", "error");
    return;
  }

  showLoading();

  fetch(`/check-participant/${participantId}`)
    .then((res) => res.json())
    .then((data) => {
      hideLoading();
      if (!data.found) {
        showNotification("ID number not found", "error");
        return;
      }
      if (data.hasWon) {
        showNotification("You have already received your prize", "info");
        return;
      }
      currentParticipant = data;
      document.getElementById("participantName").textContent = data.name;
      fadeOut("loginSection", () => {
        fadeIn("drawSection");
      });
    })
    .catch((err) => {
      hideLoading();
      showNotification("System error occurred", "error");
      console.error(err);
    });
}

function drawPrize() {
  if (!currentParticipant) return;

  showLoading();

  const prizes = [20, 30, 40];
  const randomPrize = prizes[Math.floor(Math.random() * prizes.length)];

  fetch("/draw-prize", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      participantId: currentParticipant.id,
      prize: randomPrize,
    }),
  })
    .then((res) => res.json())
    .then((data) => {
      hideLoading();
      if (data.alreadyWon) {
        showNotification("You have already received your prize", "error");
        goBack();
        return;
      }
      if (data.maxLimitReached) {
        const remaining = data.remainingPrizes;
        let message = "This prize category is full. Remaining prizes:\n";
        for (const [prize, count] of Object.entries(remaining)) {
          if (count > 0) {
            message += `${prize}: ${count} winners remaining\n`;
          }
        }
        showNotification(message, "error");
        return;
      }
      document.getElementById(
        "prizeAmount"
      ).textContent = `Congratulations! You won ${randomPrize} DB!`;
      fadeOut("drawSection", () => {
        fadeIn("congratsSection");
        playConfetti();
      });
    })
    .catch((err) => {
      hideLoading();
      showNotification("System error occurred", "error");
      console.error(err);
    });
}

function goBack() {
  fadeOut("drawSection", () => {
    fadeIn("loginSection");
  });
}

function newRegistration() {
  document.getElementById("participantId").value = "";
  currentParticipant = null;
  fadeOut("congratsSection", () => {
    fadeIn("initialSection");
  });
}

function fadeOut(elementId, callback) {
  const element = document.getElementById(elementId);
  element.style.opacity = "1";

  (function fade() {
    if ((element.style.opacity -= 0.1) < 0) {
      element.style.display = "none";
      if (callback) callback();
    } else {
      requestAnimationFrame(fade);
    }
  })();
}

function fadeIn(elementId) {
  const element = document.getElementById(elementId);
  element.style.display = "flex";
  element.style.opacity = "0";

  (function fade() {
    let val = parseFloat(element.style.opacity);
    if (!((val += 0.1) > 1)) {
      element.style.opacity = val;
      requestAnimationFrame(fade);
    }
  })();
}

function showNotification(message, type = "info") {
  const notification = document.createElement("div");
  notification.className = `notification ${type}`;
  notification.textContent = message;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.classList.add("show");
  }, 100);

  setTimeout(() => {
    notification.classList.remove("show");
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

function playConfetti() {
  const confettiCount = 200;
  const colors = ["#BA623E", "#FFD700", "#FF6B6B", "#4ecdc4"];

  for (let i = 0; i < confettiCount; i++) {
    createConfetti(colors[Math.floor(Math.random() * colors.length)]);
  }
}

function createConfetti(color) {
  const confetti = document.createElement("div");
  confetti.className = "confetti";
  confetti.style.backgroundColor = color;
  confetti.style.left = Math.random() * 100 + "vw";
  confetti.style.animationDuration = Math.random() * 3 + 2 + "s";
  confetti.style.opacity = Math.random();
  confetti.style.transform = `rotate(${Math.random() * 360}deg)`;

  document.body.appendChild(confetti);

  setTimeout(() => {
    confetti.remove();
  }, 5000);
}

function showLoading() {
  const loading = document.createElement("div");
  loading.className = "loading-overlay";
  loading.innerHTML = '<div class="loading-spinner"></div>';
  document.body.appendChild(loading);
}

function hideLoading() {
  const loading = document.querySelector(".loading-overlay");
  if (loading) loading.remove();
}

const styles = `
    .notification {
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 25px;
        border-radius: 8px;
        background: white;
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        transform: translateX(120%);
        transition: transform 0.3s ease;
        z-index: 1000;
    }

    .notification.show {
        transform: translateX(0);
    }

    .notification.error {
        background: #ff6b6b;
        color: white;
    }

    .notification.info {
        background: #4ecdc4;
        color: white;
    }

    .loading-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(255,255,255,0.8);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
    }

    .loading-spinner {
        width: 50px;
        height: 50px;
        border: 5px solid #f3f3f3;
        border-top: 5px solid var(--primary-button-color);
        border-radius: 50%;
        animation: spin 1s linear infinite;
    }

    .confetti {
        position: fixed;
        width: 10px;
        height: 10px;
        background: #BA623E;
        animation: fall linear forwards;
        z-index: 1000;
    }

    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }

    @keyframes fall {
        to {
            transform: translateY(100vh) rotate(360deg);
        }
    }
`;

const styleSheet = document.createElement("style");
styleSheet.textContent = styles;
document.head.appendChild(styleSheet);

document
  .getElementById("participantId")
  .addEventListener("keypress", function (event) {
    if (event.key === "Enter") {
      checkParticipant();
    }
  });
