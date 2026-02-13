/* =======================
   GLOBAL STATE
======================= */
let ALL_COMPONENTS = [];
let currentCategory = "All";

/* =======================
   HELPERS
======================= */
function escapeHTML(str = "") {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const grid = document.getElementById("componentGrid");

/* =======================
   FETCH COMPONENTS
======================= */
// fetch("/admin/public/components")
//   .then((res) => res.json())
//   .then((components) => {
//     ALL_COMPONENTS = components;
//     renderComponents(components); // default = ALL
//   })
//   .catch((err) => {
//     console.error("Component load error:", err);
//   });

// 1️⃣ Try loading from cache first
const cached = localStorage.getItem("components");

if (cached) {
  try {
    ALL_COMPONENTS = JSON.parse(cached);
    renderComponents(ALL_COMPONENTS);
  } catch (e) {
    console.log("Cache parse error");
  }
}

// 2️⃣ Always fetch fresh data
fetch("/admin/public/components")
  .then((res) => res.json())
  .then((components) => {
    ALL_COMPONENTS = components;

    // Save to cache
    localStorage.setItem("components", JSON.stringify(components));

    renderComponents(components);
  })
  .catch((err) => {
    console.error("Component load error:", err);
  });

/* =======================
   RENDER COMPONENTS
======================= */
function renderComponents(list) {
  grid.innerHTML = "";

  if (list.length === 0) {
    grid.innerHTML = `
      <div class="no-components">
        <h3>No components available</h3>
        <button id="viewAllBtn">View all components</button>
      </div>
    `;

    document.getElementById("viewAllBtn").onclick = () => {
      setCategory("All");
    };
    return;
  }

  list.forEach((comp) => {
    const card = document.createElement("div");
    card.className = "component-card";

    const iframeHTML = `
    <!DOCTYPE html>
    <html>
    <head>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/lucide@latest"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
    <link href="https://cdn.jsdelivr.net/npm/remixicon/fonts/remixicon.css" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/animate.css/4.1.1/animate.min.css"/>

      <style>
        html, body {
          width: 100%;
          height: 100%;
          margin: 0;
        }
        body {
          display: flex;
          align-items: center;
          justify-content: center;
        }
        ${comp.css_code || ""}
      </style>
    </head>
    <body>
      ${comp.html_code || ""}
      <script>
        ${comp.js_code || ""}
        if (window.lucide) {
          lucide.createIcons();
        }
      <\/script>
    </body>
    </html>
    `;

    card.innerHTML = `
      <div class="preview-box">
        <iframe
          class="component-preview"
          sandbox="allow-scripts"
          loading="lazy"
          srcdoc="${iframeHTML.replace(/"/g, "&quot;")}"
        ></iframe>
        <div class="preview-loader">
          <div class="line-loader">
              <span></span>
              <span></span>
              <span></span>
         </div>
        </div>
      </div>
      

      <div class="component-body">
        <div class="component-meta">
          <h3 class="component-title">${comp.name}</h3>
          <span class="component-category">${comp.category}</span>
        </div>

        <div class="component-footer">
          <span class="component-price">₹${comp.price}</span>
          <button class="unlock-btn">View Code</button>
        </div>
      </div>

      <div class="component-code hidden">
        <div class="code-tabs">
          <div class="tabs-left">
            <button class="tab active" data-tab="html">HTML</button>
            <button class="tab" data-tab="css">CSS</button>
            <button class="tab" data-tab="js">JS</button>
          </div>
          <button class="copy-btn" title="Copy code">
            <i data-lucide="copy"></i>
          </button>
        </div>

        <pre class="code-block"><code></code></pre>
      </div>
    `;

    //loader code
    const iframe = card.querySelector("iframe");
    const loader = card.querySelector(".preview-loader");

    iframe.addEventListener("load", () => {
      loader.style.display = "none";
    });

    const unlockBtn = card.querySelector(".unlock-btn");
    const codePanel = card.querySelector(".component-code");
    const tabs = card.querySelectorAll(".tab");
    const codeBlock = card.querySelector(".code-block code");
    const copyBtn = card.querySelector(".copy-btn");

    codeBlock.innerHTML = escapeHTML(comp.html_code || "");

    unlockBtn.addEventListener("click", () => {
      codePanel.classList.remove("hidden");
    });

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        tabs.forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");

        const type = tab.dataset.tab;
        if (type === "html")
          codeBlock.innerHTML = escapeHTML(comp.html_code || "");
        if (type === "css")
          codeBlock.innerHTML = escapeHTML(comp.css_code || "");
        if (type === "js") codeBlock.innerHTML = escapeHTML(comp.js_code || "");
      });
    });

    copyBtn.addEventListener("click", () => {
      const activeTab = card.querySelector(".tab.active");
      if (!activeTab) return;

      let text = "";
      const type = activeTab.dataset.tab;

      if (type === "html") text = comp.html_code || "";
      if (type === "css") text = comp.css_code || "";
      if (type === "js") text = comp.js_code || "";

      navigator.clipboard.writeText(text).then(() => {
        copyBtn.innerHTML = `<i data-lucide="check"></i>`;
        lucide.createIcons();

        setTimeout(() => {
          copyBtn.innerHTML = `<i data-lucide="copy"></i>`;
          lucide.createIcons();
        }, 1200);
      });
    });

    grid.appendChild(card);
    lucide.createIcons();
  });
}

/* =======================
   CATEGORY FILTER (READY)
======================= */
function setCategory(category) {
  currentCategory = category;

  if (category === "All") {
    renderComponents(ALL_COMPONENTS);
  } else {
    const filtered = ALL_COMPONENTS.filter((c) => c.category === category);
    renderComponents(filtered);
  }
}

/* =======================
   STATS COUNTER
======================= */
const counters = document.querySelectorAll(".stat-number");
let counterStarted = false;

function startCounters() {
  if (counterStarted) return;
  counterStarted = true;

  counters.forEach((counter) => {
    const target = +counter.dataset.target;
    let current = 0;
    const step = Math.max(1, target / 60);

    function update() {
      current += step;
      if (current < target) {
        counter.innerText = Math.floor(current);
        requestAnimationFrame(update);
      } else {
        counter.innerText = target + (target === 99 ? "%" : "+");
      }
    }

    update();
  });
}

window.addEventListener("load", () => {
  setTimeout(startCounters, 400);
});
//cate click logic
document.querySelectorAll(".cat-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    setCategory(btn.dataset.category);
  });
});

function setCategory(category) {
  currentCategory = category;

  document
    .querySelectorAll(".cat-btn")
    .forEach((b) => b.classList.remove("active"));
  document
    .querySelector(`.cat-btn[data-category="${category}"]`)
    .classList.add("active");

  if (category === "All") {
    renderComponents(ALL_COMPONENTS);
  } else {
    const filtered = ALL_COMPONENTS.filter((c) => c.category === category);
    renderComponents(filtered);
  }
}
