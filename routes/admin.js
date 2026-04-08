const express = require("express");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const db = require("../db");

const router = express.Router();
console.log("admin routes file loaded");

const FIXED_COMPONENT_PRICE = 1;
const UNLOCK_DURATION_HOURS = 1;

function dbQuery(query, params = []) {
  return new Promise((resolve, reject) => {
    db.query(query, params, (err, results) => {
      if (err) return reject(err);
      resolve(results);
    });
  });
}

function getBaseUrl(req) {
  return (
    process.env.APP_BASE_URL ||
    `${req.protocol}://${req.get("host")}`
  );
}

function getCashfreeCredentials() {
  const clientId = (
    process.env.CASHFREE_CLIENT_ID ||
    process.env.CASHFREE_APP_ID ||
    ""
  ).trim();
  const clientSecret = (
    process.env.CASHFREE_CLIENT_SECRET ||
    process.env.CASHFREE_SECRET_KEY ||
    ""
  ).trim();

  return { clientId, clientSecret };
}

function getOrCreateGuestId(req, res) {
  const existing = req.cookies?.uiv_guest_id;
  if (existing) return existing;

  const guestId = crypto.randomUUID();
  res.cookie("uiv_guest_id", guestId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 24 * 180,
  });
  return guestId;
}

function verifyCashfreeWebhookSignature(req) {
  const timestamp = req.headers["x-webhook-timestamp"];
  const signature = req.headers["x-webhook-signature"];
  const { clientSecret: secret } = getCashfreeCredentials();
  const rawBody = req.rawBody || "";

  if (!timestamp || !signature || !secret || !rawBody) return false;

  const signedPayload = `${timestamp}${rawBody}`;
  const generated = crypto
    .createHmac("sha256", secret)
    .update(signedPayload)
    .digest("base64");

  if (generated.length !== String(signature).length) return false;

  return crypto.timingSafeEqual(
    Buffer.from(generated),
    Buffer.from(String(signature))
  );
}

async function fetchCashfreeOrderPayments(orderId) {
  const { clientId, clientSecret } = getCashfreeCredentials();
  if (!clientId || !clientSecret) return [];

  const url = `https://api.cashfree.com/pg/orders/${encodeURIComponent(orderId)}/payments`;
  const cfRes = await fetch(url, {
    method: "GET",
    headers: {
      "x-api-version": "2023-08-01",
      "x-client-id": clientId,
      "x-client-secret": clientSecret,
      Accept: "application/json",
    },
  });

  if (!cfRes.ok) return [];
  const data = await cfRes.json();
  return Array.isArray(data) ? data : [];
}

async function ensurePaymentTables() {
  await dbQuery(`
    CREATE TABLE IF NOT EXISTS component_payments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_id VARCHAR(100) UNIQUE NOT NULL,
      component_id INT NOT NULL,
      guest_id VARCHAR(100) NOT NULL,
      amount INT NOT NULL,
      status ENUM('created', 'paid', 'failed') DEFAULT 'created',
      cf_payment_id VARCHAR(100),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS component_unlocks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      component_id INT NOT NULL,
      guest_id VARCHAR(100) NOT NULL,
      unlock_until DATETIME NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_guest_component (component_id, guest_id)
    )
  `);
}

async function createUnlockForPayment(paymentRow) {
  const unlockUntil = new Date(Date.now() + UNLOCK_DURATION_HOURS * 60 * 60 * 1000);
  await dbQuery(
    `
      INSERT INTO component_unlocks (component_id, guest_id, unlock_until)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE unlock_until = VALUES(unlock_until)
    `,
    [paymentRow.component_id, paymentRow.guest_id, unlockUntil]
  );
}

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

    req.session.admin = {
      id: admin.id,
      email: admin.email,
      role: admin.role,
    };

    res.json({ success: true });
  });
});

router.get("/me", (req, res) => {
  if (!req.session.admin) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  res.json({ admin: req.session.admin });
});

router.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

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

// Admin insert: price fixed to 1 on backend
router.post("/components", (req, res) => {
  if (!req.session.admin) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { name, category_id, html, css, js } = req.body;

  if (!name || !category_id || !html || !css) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const query = `
    INSERT INTO components
    (name, category_id, price, html_code, css_code, js_code)
    VALUES (?, ?, ?, ?, ?, ?)
  `;
  db.query(
    query,
    [name, category_id, FIXED_COMPONENT_PRICE, html, css, js || ""],
    (err) => {
      if (err) {
        return res.status(500).json({ error: "DB insert failed" });
      }
      res.json({ success: true });
    }
  );
});

// Public component listing: NEVER expose code directly
router.get("/public/components", async (req, res) => {
  try {
    await ensurePaymentTables();
    const guestId = getOrCreateGuestId(req, res);

    const query = `
      SELECT
        c.id,
        c.name,
        ? AS price,
        cat.name AS category,
        CASE
          WHEN u.unlock_until IS NOT NULL AND u.unlock_until > NOW() THEN 1
          ELSE 0
        END AS is_unlocked
      FROM components c
      JOIN categories cat ON c.category_id = cat.id
      LEFT JOIN component_unlocks u
        ON u.component_id = c.id
       AND u.guest_id = ?
      ORDER BY c.created_at DESC
    `;

    const results = await dbQuery(query, [FIXED_COMPONENT_PRICE, guestId]);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: "DB error" });
  }
});

router.get("/public/components/:id/code", async (req, res) => {
  try {
    await ensurePaymentTables();
    const guestId = getOrCreateGuestId(req, res);

    const unlockRows = await dbQuery(
      `
      SELECT unlock_until
      FROM component_unlocks
      WHERE component_id = ? AND guest_id = ? AND unlock_until > NOW()
      LIMIT 1
      `,
      [req.params.id, guestId]
    );

    if (!unlockRows.length) {
      return res.status(403).json({ error: "Component is locked" });
    }

    const codeRows = await dbQuery(
      `
      SELECT html_code, css_code, js_code
      FROM components
      WHERE id = ?
      LIMIT 1
      `,
      [req.params.id]
    );

    if (!codeRows.length) {
      return res.status(404).json({ error: "Component not found" });
    }

    res.json({
      html_code: codeRows[0].html_code || "",
      css_code: codeRows[0].css_code || "",
      js_code: codeRows[0].js_code || "",
      unlock_until: unlockRows[0].unlock_until,
    });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/public/components/:id/preview", async (req, res) => {
  try {
    const rows = await dbQuery(
      `
      SELECT html_code, css_code, js_code
      FROM components
      WHERE id = ?
      LIMIT 1
      `,
      [req.params.id]
    );

    if (!rows.length) {
      return res.status(404).send("Component not found");
    }

    const html = rows[0].html_code || "";
    const css = rows[0].css_code || "";
    const js = rows[0].js_code || "";

    const page = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <script src="https://unpkg.com/lucide@latest"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
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
      overflow: hidden;
    }
    ${css}
  </style>
</head>
<body>
  ${html}
  <script>
    ${js}
    if (window.lucide) {
      lucide.createIcons();
    }
  <\/script>
</body>
</html>`;

    res.set("Cache-Control", "public, max-age=3600");
    res.type("html").send(page);
  } catch (err) {
    res.status(500).send("Preview load failed");
  }
});

router.post("/public/create-order", async (req, res) => {
  try {
    await ensurePaymentTables();
    const guestId = getOrCreateGuestId(req, res);
    const { componentId } = req.body || {};
    const numericComponentId = Number(componentId);
    if (!numericComponentId || Number.isNaN(numericComponentId)) {
      return res.status(400).json({ error: "componentId is required" });
    }

    const componentRows = await dbQuery(
      "SELECT id FROM components WHERE id = ? LIMIT 1",
      [numericComponentId]
    );
    if (!componentRows.length) {
      return res.status(404).json({ error: "Component not found" });
    }

    const { clientId, clientSecret } = getCashfreeCredentials();
    if (!clientId || !clientSecret) {
      return res.status(500).json({ error: "Cashfree keys missing" });
    }

    const orderId = `uiv_${numericComponentId}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const returnUrl = `${getBaseUrl(req)}/?componentId=${numericComponentId}&cf_order_id={order_id}`;

    const cfRes = await fetch("https://api.cashfree.com/pg/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-version": "2023-08-01",
        "x-client-id": clientId,
        "x-client-secret": clientSecret,
      },
      body: JSON.stringify({
        order_id: orderId,
        order_amount: FIXED_COMPONENT_PRICE,
        order_currency: "INR",
        customer_details: {
          customer_id: `guest_${guestId.slice(0, 20)}`,
          customer_email: `guest_${guestId.slice(0, 12)}@example.com`,
          customer_phone: "9876543210",
          customer_name: "uiVault User",
        },
        order_meta: {
          return_url: returnUrl,
        },
      }),
    });

    const cfData = await cfRes.json();
    if (!cfRes.ok || !cfData.payment_session_id) {
      return res.status(400).json({
        error: "Failed to create Cashfree order",
        details: cfData,
      });
    }

    await dbQuery(
      `
      INSERT INTO component_payments
      (order_id, component_id, guest_id, amount, status)
      VALUES (?, ?, ?, ?, 'created')
      `,
      [orderId, numericComponentId, guestId, FIXED_COMPONENT_PRICE]
    );

    res.json({
      orderId,
      paymentSessionId: cfData.payment_session_id,
      amount: FIXED_COMPONENT_PRICE,
    });
  } catch (err) {
    res.status(500).json({ error: "Server error creating order", details: err.message });
  }
});

router.get("/public/cashfree-webhook", (req, res) => {
  res.status(200).json({ ok: true });
});

router.post("/public/cashfree-webhook", async (req, res) => {
  try {
    await ensurePaymentTables();
    const hasWebhookHeaders =
      req.headers["x-webhook-signature"] && req.headers["x-webhook-timestamp"];

    if (!hasWebhookHeaders) {
      return res.status(200).json({ received: true, ignored: true });
    }

    if (!verifyCashfreeWebhookSignature(req)) {
      return res.status(401).json({ error: "Invalid signature" });
    }

    const data = req.body?.data || {};
    const orderId =
      data.order?.order_id || req.body?.order?.order_id || req.body?.order_id;
    const paymentStatus =
      data.payment?.payment_status ||
      req.body?.payment?.payment_status ||
      req.body?.payment_status;
    const cfPaymentId =
      data.payment?.cf_payment_id ||
      req.body?.payment?.cf_payment_id ||
      req.body?.cf_payment_id ||
      null;

    if (!orderId) return res.status(200).json({ received: true });

    const rows = await dbQuery(
      "SELECT * FROM component_payments WHERE order_id = ? LIMIT 1",
      [orderId]
    );
    if (!rows.length) return res.status(200).json({ received: true });

    const isPaid = String(paymentStatus || "").toUpperCase() === "SUCCESS";
    const nextStatus = isPaid ? "paid" : "failed";

    await dbQuery(
      `
      UPDATE component_payments
      SET status = ?, cf_payment_id = COALESCE(?, cf_payment_id)
      WHERE order_id = ?
      `,
      [nextStatus, cfPaymentId, orderId]
    );

    if (isPaid) {
      await createUnlockForPayment(rows[0]);
    }

    res.status(200).json({ received: true });
  } catch (err) {
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

router.get("/public/payment-status/:orderId", async (req, res) => {
  try {
    await ensurePaymentTables();
    const guestId = getOrCreateGuestId(req, res);
    const { orderId } = req.params;
    const { componentId } = req.query;

    const rows = await dbQuery(
      `
      SELECT * FROM component_payments
      WHERE order_id = ? AND guest_id = ?
      LIMIT 1
      `,
      [orderId, guestId]
    );
    if (!rows.length) return res.status(404).json({ error: "Order not found" });

    const payment = rows[0];
    if (String(payment.status).toLowerCase() === "created") {
      const cfPayments = await fetchCashfreeOrderPayments(orderId);
      const successPayment = cfPayments.find(
        (p) => String(p.payment_status || "").toUpperCase() === "SUCCESS"
      );

      if (successPayment) {
        await dbQuery(
          `
          UPDATE component_payments
          SET status = 'paid', cf_payment_id = COALESCE(?, cf_payment_id)
          WHERE order_id = ?
          `,
          [successPayment.cf_payment_id || null, orderId]
        );
        payment.status = "paid";
      }
    }

    if (
      String(payment.status).toLowerCase() === "paid" &&
      String(payment.component_id) === String(componentId || payment.component_id)
    ) {
      await createUnlockForPayment(payment);
    }

    const unlockRows = await dbQuery(
      `
      SELECT unlock_until
      FROM component_unlocks
      WHERE component_id = ? AND guest_id = ? AND unlock_until > NOW()
      LIMIT 1
      `,
      [payment.component_id, guestId]
    );

    res.json({
      status: payment.status,
      componentId: payment.component_id,
      unlocked: unlockRows.length > 0,
      unlockUntil: unlockRows[0]?.unlock_until || null,
    });
  } catch (err) {
    res.status(500).json({ error: "Could not fetch payment status" });
  }
});

router.put("/components/:id", (req, res) => {
  if (!req.session.admin) return res.status(401).json({ error: "Unauthorized" });

  const { name, html, css, js } = req.body;
  const q = `
    UPDATE components
    SET name=?, price=?, html_code=?, css_code=?, js_code=?
    WHERE id=?
  `;

  db.query(q, [name, FIXED_COMPONENT_PRICE, html, css, js || "", req.params.id], (err) => {
    if (err) return res.status(500).json({ error: "DB error" });
    res.json({ success: true });
  });
});

router.delete("/components/:id", (req, res) => {
  if (!req.session.admin) return res.status(401).json({ error: "Unauthorized" });

  db.query("DELETE FROM components WHERE id=?", [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: "DB error" });
    res.json({ success: true });
  });
});

module.exports = router;
