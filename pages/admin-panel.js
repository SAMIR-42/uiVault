(async () => {
  const res = await fetch("/admin/me");
  if (!res.ok) {
    window.location.href = "/pages/admin-login.html";
    return;
  }
})();

//session check and redirect to my-comps. by mycomponent btn 
document.getElementById("myCompsBtn").onclick = () => {
  window.location.href = "/pages/my-comps.html";
};


document.getElementById("logoutBtn").addEventListener("click", async () => {
  await fetch("/admin/logout");
  window.location.href = "/pages/admin-login.html";
});
//fetch categories
async function loadCategories() {
  const res = await fetch("/admin/categories");
  if (!res.ok) return;

  const categories = await res.json();
  const select = document.getElementById("categorySelect");

  categories.forEach((cat) => {
    const option = document.createElement("option");
    option.value = cat.id;
    option.textContent = cat.name;
    select.appendChild(option);
  });
}

loadCategories();
//form submit
document
  .getElementById("componentForm")
  .addEventListener("submit", async (e) => {
    e.preventDefault();

    const payload = {
      name: document.getElementById("compName").value,
      category_id: document.getElementById("categorySelect").value,
      price: document.getElementById("price").value,
      html: document.getElementById("htmlCode").value,
      css: document.getElementById("cssCode").value,
      js: document.getElementById("jsCode").value,
    };
    
    const res = await fetch("/admin/components", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    const msg = document.getElementById("formMsg");

    if (!res.ok) {
      msg.textContent = data.error;
      msg.style.color = "#ff6b6b";
      return;
    }

    msg.textContent = "Component saved successfully";
    msg.style.color = "#6bffb0";
    e.target.reset();
  });

