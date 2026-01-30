require("dotenv").config();
const express = require("express");
const session = require("express-session");
const path = require("path");

const app = express();

const adminRoutes = require("./routes/admin");

// Static files
app.use("/pages", express.static(path.join(__dirname, "pages")));
app.use("/assets", express.static(path.join(__dirname, "assets")));

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session
app.use(
  session({
    name: "uiVault.sid",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
    },
  })
);

// const Razorpay = require("razorpay");

// const razorpay = new Razorpay({
//   key_id: process.env.RAZORPAY_KEY_ID, // test key
//   key_secret: process.env.RAZORPAY_KEY_SECRET,
// });

//unlock check api

// app.get("/api/check-unlock/:componentId", (req, res) => {
//   const { componentId } = req.params;

//   if (!req.session.unlocked) {
//     req.session.unlocked = {};
//   }

//   res.json({
//     unlocked: req.session.unlocked[componentId] === true,
//   });
// });

//unlock set api

// app.post("/api/set-unlock/:componentId", (req, res) => {
//   const { componentId } = req.params;

//   if (!req.session.unlocked) {
//     req.session.unlocked = {};
//   }

//   req.session.unlocked[componentId] = true;

//   res.json({ success: true });
// });

//routes
app.use("/admin", adminRoutes);

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "pages", "index.html"));
});

// Test route
app.get("/health", (req, res) => {
  res.json({ status: "uiVault backend running" });
});

// Server start
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 uiVault server running on http://localhost:${PORT}`);
});
