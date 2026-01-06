// server.js
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const Sensor = require("./models/Sensor");

// Basic env checks
if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET is missing — check Render environment settings");
}
if (!process.env.MONGO_URI) {
  throw new Error("MONGO_URI is missing — check Render environment settings");
}

const port = process.env.PORT || 4000;
const app = express();

// Allowed origins — add any frontends you control here
const ALLOWED_ORIGINS = [
  "https://iot-project-frontend-liard.vercel.app",
  "https://react.flowofthings.net"
];

// CORS middleware: allow listed origins and echo origin when appropriate
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin) {
    // No origin (curl, server-to-server) — allow
    res.setHeader("Access-Control-Allow-Origin", "*");
  } else if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  } else {
    // Not allowed origin — do not set ACAO header (browser will block)
    // You can also choose to explicitly block with a 403 for stricter behavior.
  }

  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

// Body parser
app.use(express.json());

// Simple request logging (lightweight)
app.use((req, res, next) => {
  // Minimal log for Render/Cloudflare debugging
  console.log(`${new Date().toISOString()} ${req.method} ${req.originalUrl} from ${req.headers.origin || "no-origin"}`);
  next();
});

// MongoDB connection
mongoose
  .connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ Connected to MongoDB Atlas"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Health check
app.get("/health", (req, res) => res.json({ status: "ok", uptime: process.uptime() }));

// Routes
app.get("/api/sensor/latest", async (req, res) => {
  try {
    const latest = await Sensor.findOne().sort({ timestamp: -1 });
    if (!latest) {
      return res.status(404).json({ message: "No sensor data found" });
    }
    res.json(latest);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/sensor", async (req, res) => {
  try {
    // Expect a token in body (existing behavior). If you prefer Authorization header, adapt here.
    const token = req.body.token;
    if (!token) return res.status(400).json({ error: "Missing token" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const sensor = new Sensor({
      timestamp: decoded.timestamp,
      temperature: decoded.temperature,
      humidity: decoded.humidity
    });
    await sensor.save();
    res.json({ success: true, data: sensor });
  } catch (err) {
    console.error("POST /api/sensor error:", err.message);
    res.status(401).json({ error: "Invalid token or save failed" });
  }
});

app.get("/api/sensor", async (req, res) => {
  try {
    const sensors = await Sensor.find().sort({ timestamp: -1 }).limit(50);
    res.json(sensors);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch sensor data" });
  }
});

// Generic error handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// Start server
app.listen(port, () => console.log(`Server running on port ${port}`));