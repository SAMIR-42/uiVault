const express = require("express");
const bcrypt = require("bcrypt");
const db = require("../db");

const router = express.Router();
console.log("admin routes file loaded");

router.post("/login", (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Missing credentials" });
  }

  const query = "SELECT * FROM admins WHERE email = ? LIMIT 1";
  db.query(query, [email], async (err, results) => {
    if (err) {
      return res.status(500).json({ error: "Server error" });
    }

    if (results.length === 0) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const admin = results[0];
    const match = await bcrypt.compare(password, admin.password);

    if (!match) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // session set
    req.session.admin = {
      id: admin.id,
      email: admin.email,
      role: admin.role,
    };

    res.json({ success: true });
  });
});

//session check routrouter.get("/me", (req, res) => {
router.get("/me", (req, res) => {
  if (!req.session.admin) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  res.json({ admin: req.session.admin });
});

//logout rout

router.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});
//session check, categories db se, clean json return
router.get("/categories", (req, res) => {
  if (!req.session.admin) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const query = "SELECT id, name FROM categories ORDER BY name ASC";
  db.query(query, (err, results) => {
    if (err) {
      return res.status(500).json({ error: "DB error" });
    }
    res.json(results);
  });
});
//db me components save krne
router.post("/components", (req, res) => {
  if (!req.session.admin) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { name, category_id, price, html, css, js } = req.body;

  if (!name || !category_id || price === undefined || !html || !css) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const query = `
    INSERT INTO components
    (name, category_id, price, html_code, css_code, js_code)
    VALUES (?, ?, ?, ?, ?, ?)
  `;
  db.query(query, [name, category_id, price, html, css, js || ""], (err) => {
    if (err) {
      return res.status(500).json({ error: "DB insert failed" });
    }
    res.json({ success: true });
  });
});

//backend component fetch
router.get("/public/components", (req, res) => {
  const query = `
    SELECT c.id, c.name, c.price, cat.name AS category,
           c.html_code, c.css_code, c.js_code
    FROM components c
    JOIN categories cat ON c.category_id = cat.id
    ORDER BY c.created_at DESC
  `;

  db.query(query, (err, results) => {
    if (err) {
      return res.status(500).json({ error: "DB error" });
    }
    res.json(results);
  });
});

// UPDATE COMPONENT
router.put("/components/:id", (req, res) => {
  if (!req.session.admin)
    return res.status(401).json({ error: "Unauthorized" });

  const { name, price, html, css, js } = req.body;

  const q = `
    UPDATE components
    SET name=?, price=?, html_code=?, css_code=?, js_code=?
    WHERE id=?
  `;

  db.query(q, [name, price, html, css, js || "", req.params.id], (err) => {
    if (err) return res.status(500).json({ error: "DB error" });
    res.json({ success: true });
  });
});

// DELETE COMPONENT
router.delete("/components/:id", (req, res) => {
  if (!req.session.admin)
    return res.status(401).json({ error: "Unauthorized" });

  db.query("DELETE FROM components WHERE id=?", [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: "DB error" });
    res.json({ success: true });
  });
});

//ye sabse niche hi rhna chahiye
module.exports = router;
