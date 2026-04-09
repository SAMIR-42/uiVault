// 🔐 SESSION CHECK (MOST IMPORTANT)
(async () => {
  const res = await fetch("/admin/me", {
    credentials: "include",
  });

  if (!res.ok) {
    location.href = "/pages/admin-login.html";
  }
})();

let components = [];
let categories = [];
let activeId = null;
let renderSource = [];
let renderedCount = 0;
let listLoading = false;
let loadMoreObserver = null;
const BATCH_SIZE = 10;
const MIN_LOADER_VISIBLE_MS = 220;

const grid = document.getElementById("componentGrid");

// DOM refs
const editModal = document.getElementById("editModal");
const deleteModal = document.getElementById("deleteModal");

const editName = document.getElementById("editName");
const editPrice = document.getElementById("editPrice");
const editCategory = document.getElementById("editCategory");
const editHTML = document.getElementById("editHTML");
const editCSS = document.getElementById("editCSS");
const editJS = document.getElementById("editJS");

const saveEdit = document.getElementById("saveEdit");
const closeEdit = document.getElementById("closeEdit");

const confirmDelete = document.getElementById("confirmDelete");
const cancelDelete = document.getElementById("cancelDelete");
const logoutBtn = document.getElementById("logoutBtn");

function fillCategorySelect() {
  if (!editCategory || editCategory.dataset.filled === "1") return;
  editCategory.innerHTML = categories
    .map((c) => `<option value="${c.id}">${c.name}</option>`)
    .join("");
  editCategory.dataset.filled = "1";
}

(async function initMyComps() {
  try {
    const r = await fetch("/admin/components", { credentials: "include" });
    if (r.ok) components = await r.json();
  } catch (_) {
    /* keep empty */
  }
  try {
    const r = await fetch("/admin/categories", { credentials: "include" });
    if (r.ok) {
      const cats = await r.json();
      if (Array.isArray(cats)) categories = cats;
    }
  } catch (_) {
    /* categories optional for list; edit needs them */
  }
  fillCategorySelect();
  render();
})();

// RENDER
function render() {
  grid.innerHTML = "";
  renderSource = components;
  renderedCount = 0;
  listLoading = false;

  if (loadMoreObserver) {
    loadMoreObserver.disconnect();
    loadMoreObserver = null;
  }

  renderNextBatch();
  setupLoadMoreObserver();
}

function renderNextBatch() {
  if (listLoading) return;
  if (renderedCount >= renderSource.length) return;
  listLoading = true;

  const end = Math.min(renderedCount + BATCH_SIZE, renderSource.length);
  for (let i = renderedCount; i < end; i += 1) {
    const comp = renderSource[i];
    const card = document.createElement("div");
    card.className = "component-card";

    card.innerHTML = `
      <div class="preview-box">
        <iframe
          class="component-preview"
          sandbox="allow-scripts"
          loading="lazy"
          src="/admin/public/components/${comp.id}/preview">
        </iframe>
        <div class="preview-loader">
          <div class="line-loader">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
      </div>

      <div class="component-body">
        <h3>${comp.name}</h3>
        <span>${comp.category}</span>

        <div class="component-footer">
          <span>₹${comp.price}</span>
          <button class="edit">Edit</button>
          <button class="delete">Delete</button>
        </div>
      </div>
    `;

    const iframe = card.querySelector(".component-preview");
    const loader = card.querySelector(".preview-loader");
    const loadStart = Date.now();

    iframe.addEventListener("load", () => {
      const elapsed = Date.now() - loadStart;
      const wait = Math.max(0, MIN_LOADER_VISIBLE_MS - elapsed);
      setTimeout(() => {
        loader.style.display = "none";
      }, wait);
    });

    iframe.addEventListener("error", () => {
      loader.innerHTML = `<div class="preview-placeholder">Preview unavailable</div>`;
    });

    card.querySelector(".edit").onclick = () => openEdit(comp);
    card.querySelector(".delete").onclick = () => openDelete(comp.id);

    grid.appendChild(card);
  }
  renderedCount = end;
  listLoading = false;
}

function setupLoadMoreObserver() {
  const sentinel = document.createElement("div");
  sentinel.id = "adminLoadSentinel";
  sentinel.style.height = "1px";
  grid.appendChild(sentinel);

  loadMoreObserver = new IntersectionObserver(
    (entries) => {
      if (!entries[0]?.isIntersecting) return;
      if (renderedCount >= renderSource.length) return;

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

function rerenderAfterMutation() {
  render();
  lucide.createIcons();
}

// EDIT
function openEdit(comp) {
  activeId = comp.id;
  fillCategorySelect();

  editName.value = comp.name;
  editPrice.value = comp.price;
  editCategory.value = String(comp.category_id || "");
  editHTML.value = comp.html_code;
  editCSS.value = comp.css_code;
  editJS.value = comp.js_code || "";

  editModal.classList.remove("hidden");
}

saveEdit.onclick = async () => {
  const res = await fetch(`/admin/components/${activeId}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: editName.value,
      price: editPrice.value,
      category_id: editCategory.value,
      html: editHTML.value,
      css: editCSS.value,
      js: editJS.value,
    }),
  });

  if (!res.ok) {
    alert("Edit failed");
    return;
  }

  const idx = components.findIndex((c) => c.id === activeId);
  const selectedCat = categories.find(
    (c) => String(c.id) === String(editCategory.value)
  );
  if (idx !== -1) {
    components[idx] = {
      ...components[idx],
      name: editName.value,
      price: Number(editPrice.value),
      category_id: Number(editCategory.value),
      category: selectedCat ? selectedCat.name : components[idx].category,
      html_code: editHTML.value,
      css_code: editCSS.value,
      js_code: editJS.value,
    };
  }
  editModal.classList.add("hidden");
  rerenderAfterMutation();
};

closeEdit.onclick = () => {
  editModal.classList.add("hidden");
};

// DELETE
function openDelete(id) {
  activeId = id;
  deleteModal.classList.remove("hidden");
}

confirmDelete.onclick = async () => {
  const res = await fetch(`/admin/components/${activeId}`, {
    method: "DELETE",
    credentials: "include",
  });

  if (!res.ok) {
    alert("Delete failed");
    return;
  }

  components = components.filter((c) => c.id !== activeId);
  deleteModal.classList.add("hidden");
  rerenderAfterMutation();
};

cancelDelete.onclick = () => {
  deleteModal.classList.add("hidden");
};

// LOGOUT
logoutBtn.onclick = async () => {
  await fetch("/admin/logout", { credentials: "include" });
  location.href = "index.html";
};
