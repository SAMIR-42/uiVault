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
let activeId = null;

const grid = document.getElementById("componentGrid");

// DOM refs
const editModal = document.getElementById("editModal");
const deleteModal = document.getElementById("deleteModal");

const editName = document.getElementById("editName");
const editPrice = document.getElementById("editPrice");
const editHTML = document.getElementById("editHTML");
const editCSS = document.getElementById("editCSS");
const editJS = document.getElementById("editJS");

const saveEdit = document.getElementById("saveEdit");
const closeEdit = document.getElementById("closeEdit");

const confirmDelete = document.getElementById("confirmDelete");
const cancelDelete = document.getElementById("cancelDelete");
const logoutBtn = document.getElementById("logoutBtn");

// FETCH COMPONENTS (SESSION INCLUDED)
fetch("/admin/public/components", {
  credentials: "include",
})
  .then((r) => r.json())
  .then((data) => {
    components = data;
    render();
  });

// RENDER
function render() {
  grid.innerHTML = "";

  components.forEach((comp) => {
    const card = document.createElement("div");
    card.className = "component-card";

    const iframeHTML = `
<!DOCTYPE html>
<html>
<head>
<script src="https://cdn.tailwindcss.com"></script>
<style>
html,body{width: 100%;height: 100%;margin:0;padding:0}
*{box-sizing:border-box}
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
<script>${comp.js_code || ""}<\/script>
</body>
</html>
`;

    card.innerHTML = `
      <div class="preview-box">
        <iframe
          class="component-preview"
          sandbox="allow-scripts"
          srcdoc="${iframeHTML.replace(/"/g, "&quot;")}">
        </iframe>
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

    card.querySelector(".edit").onclick = () => openEdit(comp);
    card.querySelector(".delete").onclick = () => openDelete(comp.id);

    grid.appendChild(card);
  });

  lucide.createIcons();
}

// EDIT
function openEdit(comp) {
  activeId = comp.id;

  editName.value = comp.name;
  editPrice.value = comp.price;
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
      html: editHTML.value,
      css: editCSS.value,
      js: editJS.value,
    }),
  });

  if (!res.ok) {
    alert("Edit failed");
    return;
  }

  location.reload();
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

  location.reload();
};

cancelDelete.onclick = () => {
  deleteModal.classList.add("hidden");
};

// LOGOUT
logoutBtn.onclick = async () => {
  await fetch("/admin/logout", { credentials: "include" });
  location.href = "/pages/admin-login.html";
};
