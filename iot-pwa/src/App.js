import React, { useEffect, useState } from "react";
import SensorChart from "./components/SensorChart";

function App() {
  const [data, setData] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    let jwt = null;

    const fetchData = async () => {
      // --- OFFLINE MODE ---
      if (!navigator.onLine) {
        setError("Offline — showing cached data");

        try {
          // Open the correct versioned cache
          const cache = await caches.open("sensor-data-cache-v5");
          const keys = await cache.keys();

          // Find the cached API response (works even with query params)
          const match = keys.find((req) =>
            req.url.includes("/api/data/")
          );

          if (match) {
            const cachedResponse = await cache.match(match);
            const cachedJson = await cachedResponse.json();
            setData(cachedJson);
            return;
          }
        } catch (err) {
          console.log("SW cache read failed:", err);
        }

        // Fallback to localStorage
        const local = localStorage.getItem("cachedSensorData");
        if (local) {
          setData(JSON.parse(local));
          return;
        }

        setError("Offline — no cached data available");
        return;
      }

      // --- ONLINE MODE ---
      try {
        // Login once
        if (!jwt) {
          const loginRes = await fetch(
            `${process.env.REACT_APP_BACKEND_URL}/api/login`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ username: "demo", password: "demo" }),
            }
          );

          if (!loginRes.ok) {
            setError("Login failed");
            return;
          }

          const loginJson = await loginRes.json();
          jwt = loginJson.token;
        }

        // Fetch sensor data
        const res = await fetch(
          `${process.env.REACT_APP_BACKEND_URL}/api/data/`,
          {
            headers: { Authorization: `Bearer ${jwt}` },
          }
        );

        if (!res.ok) {
          setError("Failed to fetch sensor data");
          return;
        }

        const json = await res.json();
        setData(json);

        // Save to localStorage for offline fallback
        localStorage.setItem("cachedSensorData", JSON.stringify(json));

        setError(null);
      } catch (err) {
        console.error("Unexpected error:", err);
        setError("Unexpected error");
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const sortedData = [...data].sort(
    (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
  );

  return (
    <div style={{ padding: "20px" }}>
      <h2>Sensor Dashboard</h2>

      {!navigator.onLine && (
        <div style={{ background: "#ffcccb", padding: "10px", marginBottom: "10px" }}>
          You are offline — some features may be unavailable
        </div>
      )}

      {error && <p style={{ color: "red" }}>{error}</p>}

      {sortedData.length > 0 && <SensorChart readings={sortedData} />}
    </div>
  );
}

export default App;