import React, { useEffect, useState } from "react";
import SensorChart from "./components/SensorChart";

const CACHE_NAME = "sensor-data-cache-v6";
const API_PATH = "/api/data/";

function App() {
  const [data, setData] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    let jwt = null;
    let stopped = false;

    const fetchData = async () => {
      if (stopped) return;

      // --- OFFLINE MODE ---
      if (!navigator.onLine) {
        setError("Offline — showing cached data");

        try {
          const cache = await caches.open(CACHE_NAME);
          const apiUrl = `${process.env.REACT_APP_BACKEND_URL}${API_PATH}`;

          // Try exact URL first
          let cachedResponse = await cache.match(apiUrl);

          // If not found, search keys for any entry that contains the API path (handles query params)
          if (!cachedResponse) {
            const keys = await cache.keys();
            const matchReq = keys.find((req) => req.url.includes(API_PATH));
            if (matchReq) cachedResponse = await cache.match(matchReq.url);
          }

          if (cachedResponse) {
            const cachedJson = await cachedResponse.json();
            setData(cachedJson);
            return;
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.log("SW cache read failed:", err);
        }

        // Fallback to localStorage
        try {
          const local = localStorage.getItem("cachedSensorData");
          if (local) {
            setData(JSON.parse(local));
            return;
          }
        } catch (err) {
          // ignore localStorage parse errors
        }

        setError("Offline — no cached data available");
        return;
      }

      // --- ONLINE MODE ---
      try {
        // Login once per session
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
          `${process.env.REACT_APP_BACKEND_URL}${API_PATH}`,
          {
            headers: { Authorization: `Bearer ${jwt}` },
            cache: "no-store",
          }
        );

        if (!res.ok) {
          setError("Failed to fetch sensor data");
          return;
        }

        const json = await res.json();
        setData(json);

        // Save to localStorage for fallback
        try {
          localStorage.setItem("cachedSensorData", JSON.stringify(json));
        } catch (err) {
          // ignore storage errors
        }

        setError(null);
      } catch (err) {
        // Network or unexpected error while online; surface a friendly message
        // eslint-disable-next-line no-console
        console.error("Unexpected error:", err);
        setError("Unexpected error");
      }
    };

    // initial fetch and polling
    fetchData();
    const interval = setInterval(fetchData, 5000);

    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, []);

  const sortedData = [...data].sort(
    (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
  );

  return (
    <div style={{ padding: "20px" }}>
      <h2>Sensor Dashboard</h2>

      {!navigator.onLine && (
        <div
          style={{
            background: "#ffcccb",
            padding: "10px",
            marginBottom: "10px",
          }}
        >
          You are offline — some features may be unavailable
        </div>
      )}

      {error && <p style={{ color: "red" }}>{error}</p>}

      {sortedData.length > 0 ? (
        <SensorChart readings={sortedData} />
      ) : (
        <p>No sensor data available</p>
      )}
    </div>
  );
}

export default App;