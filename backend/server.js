const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const Sensor = require("./models/Sensor");

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET is missing — check Render environment settings");
}

const port = process.env.PORT || 4000;

// Create app first
const app = express();

// Middleware
app.use(express.json());
app.use(cors({
  origin: "https://iot-project-frontend-liard.vercel.app" // your Vercel frontend
}));

// MongoDB connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Connected to MongoDB Atlas"))
  .catch(err => console.error("MongoDB connection error:", err));

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
    const decoded = jwt.verify(req.body.token, process.env.JWT_SECRET);
    const sensor = new Sensor({
      timestamp: decoded.timestamp,
      temperature: decoded.temperature,
      humidity: decoded.humidity
    });
    await sensor.save();
    res.json({ success: true, data: sensor });
  } catch (err) {
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

// Start server
app.listen(port, () => console.log(`Server running on port ${port}`));