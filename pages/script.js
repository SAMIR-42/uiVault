/* =======================
   GLOBAL STATE
======================= */
let ALL_COMPONENTS = [];
let currentCategory = "All";
const CODE_CACHE = new Map();
const CARD_REGISTRY = new Map();
let RENDER_SOURCE = [];
let renderedCount = 0;
let listLoading = false;
let loadMoreObserver = null;
const BATCH_SIZE = 15;
const MIN_LOADER_VISIBLE_MS = 250;

const cashfree = window.Cashfree ? window.Cashfree({ mode: "production" }) : null;




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
fetch("/admin/public/components")
  .then((res) => res.json())
  .then((components) => {
    ALL_COMPONENTS = components;
    renderComponents(components); // default = ALL
    autoHandleReturnFromPayment();
  })
  .catch((err) => {
    console.error("Component load error:", err);
  });

/* =======================
   RENDER COMPONENTS
======================= */
function renderComponents(list) {
  grid.innerHTML = "";
  CARD_REGISTRY.clear();
  RENDER_SOURCE = list;
  renderedCount = 0;
  listLoading = false;

  if (loadMoreObserver) {
    loadMoreObserver.disconnect();
    loadMoreObserver = null;
  }

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

  renderNextBatch();
  createLoadMoreUI();
  // setupLoadMoreObserver();
}

function renderNextBatch() {
  if (listLoading) return;
  if (renderedCount >= RENDER_SOURCE.length) return;
  listLoading = true;

  const end = Math.min(renderedCount + BATCH_SIZE, RENDER_SOURCE.length);
  for (let i = renderedCount; i < end; i += 1) {
    const comp = RENDER_SOURCE[i];
    const card = document.createElement("div");
    card.className = "component-card";

    card.innerHTML = `
      <div class="preview-box">
      <div class="preview-box" data-src="/admin/public/components/${comp.id}/preview">
      <div class="preview-loader">
        <div class="line-loader">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    </div>
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
          <button class="unlock-btn">${Number(comp.price) === 0 || Number(comp.is_unlocked) ? "Open Code" : "Unlock Code"}</button>
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
    loader.style.display = "flex";
    const loadStartedAt = Date.now();

    iframe.addEventListener("load", () => {
      const elapsed = Date.now() - loadStartedAt;
      const wait = Math.max(0, MIN_LOADER_VISIBLE_MS - elapsed);
      setTimeout(() => {
        loader.style.display = "none";
      }, wait);
    });

    iframe.addEventListener("error", () => {
      loader.innerHTML = `<div class="preview-placeholder">Preview unavailable</div>`;
    });

    const unlockBtn = card.querySelector(".unlock-btn");
    const codePanel = card.querySelector(".component-code");
    const tabs = card.querySelectorAll(".tab");
    const codeBlock = card.querySelector(".code-block code");
    const copyBtn = card.querySelector(".copy-btn");
    const componentId = comp.id;

    CODE_CACHE.set(componentId, null);
    CARD_REGISTRY.set(componentId, {
      comp,
      card,
      codePanel,
      codeBlock,
      tabs,
      copyBtn,
      unlockBtn,
    });

    if (Number(comp.price) === 0 || Number(comp.is_unlocked)) {
      unlockBtn.textContent = "Open Code";
    }

    unlockBtn.addEventListener("click", async () => {
      if (Number(comp.price) === 0 || Number(comp.is_unlocked)) {
        await openCodePanel(componentId);
        return;
      }

      await startCheckout(componentId);
    });

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        tabs.forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");

        const type = tab.dataset.tab;
        const code = CODE_CACHE.get(componentId) || {};
        if (type === "html") codeBlock.innerHTML = escapeHTML(code.html_code || "");
        if (type === "css") codeBlock.innerHTML = escapeHTML(code.css_code || "");
        if (type === "js") codeBlock.innerHTML = escapeHTML(code.js_code || "");
      });
    });

    copyBtn.addEventListener("click", () => {
      const activeTab = card.querySelector(".tab.active");
      if (!activeTab) return;

      let text = "";
      const type = activeTab.dataset.tab;
      const code = CODE_CACHE.get(componentId) || {};

      if (type === "html") text = code.html_code || "";
      if (type === "css") text = code.css_code || "";
      if (type === "js") text = code.js_code || "";

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
  }
  renderedCount = end;
  listLoading = false;
  
  initLazyPreview();

}

//new fun ak bari me sirf 20 comp dikhayenge

function createLoadMoreUI() {
  // already exist remove
  const old = document.getElementById("loadMoreWrap");
  if (old) old.remove();

  if (renderedCount >= RENDER_SOURCE.length) return;

  const wrap = document.createElement("div");
  wrap.id = "loadMoreWrap";

  wrap.innerHTML = `
    <div class="load-more-blur"></div>
    <button class="load-more-btn">Explore More</button>
  `;

  grid.parentElement.appendChild(wrap);

  wrap.querySelector("button").onclick = () => {
    renderNextBatch();
    createLoadMoreUI(); // update again
  };
}



function setupLoadMoreObserver() {
  const sentinel = document.createElement("div");
  sentinel.id = "componentLoadSentinel";
  sentinel.style.height = "1px";
  grid.appendChild(sentinel);

  loadMoreObserver = new IntersectionObserver(
    (entries) => {
      const [entry] = entries;
      if (!entry?.isIntersecting) return;
      if (renderedCount >= RENDER_SOURCE.length) return;
      renderNextBatch();
      grid.appendChild(sentinel);
    },
    {
      root: null,
      rootMargin: "200px 0px",
      threshold: 0,
    }
  );

  loadMoreObserver.observe(sentinel);
}

async function fetchComponentCode(componentId) {
  const existing = CODE_CACHE.get(componentId);
  if (existing) return existing;

  const res = await fetch(`/admin/public/components/${componentId}/code`);
  if (!res.ok) {
    throw new Error("Code locked");
  }

  const data = await res.json();
  CODE_CACHE.set(componentId, data);
  return data;
}

async function openCodePanel(componentId) {
  const cardData = CARD_REGISTRY.get(componentId);
  if (!cardData) return;

  const { codePanel, codeBlock, tabs, comp, unlockBtn } = cardData;
  const data = await fetchComponentCode(componentId);

  comp.is_unlocked = 1;
  unlockBtn.textContent = "Open Code";
  codePanel.classList.remove("hidden");

  const activeTab = [...tabs].find((t) => t.classList.contains("active"));
  const type = activeTab?.dataset.tab || "html";
  if (type === "html") codeBlock.innerHTML = escapeHTML(data.html_code || "");
  if (type === "css") codeBlock.innerHTML = escapeHTML(data.css_code || "");
  if (type === "js") codeBlock.innerHTML = escapeHTML(data.js_code || "");
}

async function startCheckout(componentId) {
  if (!cashfree) {
    alert("Payment SDK not loaded. Please refresh.");
    return;
  }

  const cardData = CARD_REGISTRY.get(componentId);
  if (!cardData) return;
  cardData.unlockBtn.disabled = true;
  cardData.unlockBtn.textContent = "Opening...";

  try {
    const orderRes = await fetch("/admin/public/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ componentId }),
    });
    const orderData = await orderRes.json().catch(() => ({}));
    if (!orderRes.ok) {
      const details =
        orderData.details?.message ||
        orderData.details?.reason ||
        orderData.details?.error_description ||
        orderData.details?.error ||
        orderData.details ||
        "";
      throw new Error(
        [orderData.error || "Order creation failed", details]
          .filter(Boolean)
          .join(" | ")
      );
    }

    const checkoutOptions = {
      paymentSessionId: orderData.paymentSessionId,
      redirectTarget: "_self",
    };
    await cashfree.checkout(checkoutOptions);
  } catch (err) {
    console.error("Payment start error:", err);
    alert(`Payment start failed: ${err.message || "Try again."}`);
  } finally {
    cardData.unlockBtn.disabled = false;
    cardData.unlockBtn.textContent = "Unlock Code";
  }
}

async function autoHandleReturnFromPayment() {
  const params = new URLSearchParams(window.location.search);
  const orderId = params.get("cf_order_id");
  const componentId = params.get("componentId");
  if (!orderId || !componentId) return;

  const maxAttempts = 10;
  for (let i = 0; i < maxAttempts; i += 1) {
    const res = await fetch(
      `/admin/public/payment-status/${encodeURIComponent(orderId)}?componentId=${encodeURIComponent(componentId)}`
    );
    if (res.ok) {
      const data = await res.json();
      if (String(data.status).toLowerCase() === "paid" && data.unlocked) {
        const compRef = ALL_COMPONENTS.find((c) => String(c.id) === String(componentId));
        if (compRef) compRef.is_unlocked = 1;
        await openCodePanel(Number(componentId));
        cleanupPaymentQueryParams();
        return;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  cleanupPaymentQueryParams();
}

function cleanupPaymentQueryParams() {
  const url = new URL(window.location.href);
  url.searchParams.delete("cf_order_id");
  url.searchParams.delete("componentId");
  window.history.replaceState({}, "", url.toString());
}

function enableCategoryMouseScroll() {
  const scroller = document.getElementById("categoryScroll");
  if (!scroller || scroller.dataset.mouseScrollEnabled === "1") return;

  scroller.dataset.mouseScrollEnabled = "1";

  // Mouse wheel: vertical wheel -> horizontal scroll
  scroller.addEventListener(
    "wheel",
    (e) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        scroller.scrollLeft += e.deltaY;
        e.preventDefault();
      }
    },
    { passive: false }
  );

  // Click + drag support for desktop users
  let isDragging = false;
  let startX = 0;
  let startScrollLeft = 0;

  scroller.addEventListener("mousedown", (e) => {
    isDragging = true;
    startX = e.pageX;
    startScrollLeft = scroller.scrollLeft;
    scroller.classList.add("dragging");
  });

  window.addEventListener("mouseup", () => {
    isDragging = false;
    scroller.classList.remove("dragging");
  });

  scroller.addEventListener("mouseleave", () => {
    isDragging = false;
    scroller.classList.remove("dragging");
  });

  scroller.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    const walk = e.pageX - startX;
    scroller.scrollLeft = startScrollLeft - walk;
  });
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

enableCategoryMouseScroll();

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

function initLazyPreview() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;

      const box = entry.target;
      if (box.dataset.loaded) return;

      const iframe = document.createElement("iframe");
      iframe.className = "component-preview";
      iframe.src = box.dataset.src;
      iframe.sandbox = "allow-scripts";

      const loader = box.querySelector(".preview-loader");

      iframe.onload = () => {
        if (loader) loader.style.display = "none";
      };

      iframe.onerror = () => {
        if (loader) {
          loader.innerHTML = `<div class="preview-placeholder">Preview unavailable</div>`;
        }
      };

      box.appendChild(iframe);
      box.dataset.loaded = "1";

      observer.unobserve(box);
    });
  }, {
    rootMargin: "200px"
  });

  document.querySelectorAll(".preview-box").forEach((box) => {
    observer.observe(box);
  });
}
