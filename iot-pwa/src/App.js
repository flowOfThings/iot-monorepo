import React, { useEffect, useState, useRef } from "react";
import SensorChart from "./components/SensorChart";

const CACHE_NAME = "sensor-data-cache-v6";
const API_PATH = "/api/data/";
const LOGIN_PATH = "/api/login";

function App() {
  const [data, setData] = useState([]);
  const [error, setError] = useState(null);
  const pollingRef = useRef(null);
  const jwtRef = useRef(null);

  useEffect(() => {
    let stopped = false;

    const readCachedData = async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        const apiUrl = `${process.env.REACT_APP_BACKEND_URL}${API_PATH}`;

        // Try exact URL first
        let cachedResponse = await cache.match(apiUrl);

        // If not found, search keys for any entry that contains the API path (handles query params)
        if (!cachedResponse) {
          const keys = await cache.keys();
          const matchReq = keys.find((req) => req.url && req.url.includes(API_PATH));
          if (matchReq) cachedResponse = await cache.match(matchReq.url || matchReq);
        }

        if (cachedResponse) {
          const cachedJson = await cachedResponse.json();
          return cachedJson;
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.log("SW cache read failed:", err);
      }

      // Fallback to localStorage
      try {
        const local = localStorage.getItem("cachedSensorData");
        if (local) return JSON.parse(local);
      } catch (err) {
        // ignore parse errors
      }

      return null;
    };

    const fetchData = async () => {
      if (stopped) return;

      // If offline, use cache/localStorage and stop polling
      if (!navigator.onLine) {
        setError("Offline — showing cached data");
        const cached = await readCachedData();
        if (cached && Array.isArray(cached) && cached.length > 0) {
          setData(cached);
        } else {
          setData([]);
        }

        // Stop polling while offline to avoid repeated network attempts
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
        return;
      }

      // Online: ensure polling is running
      if (!pollingRef.current) {
        pollingRef.current = setInterval(fetchData, 5000);
      }

      // ONLINE MODE: attempt login (only when online)
      try {
        if (!jwtRef.current) {
          // Double-check online before login
          if (!navigator.onLine) {
            setError("Offline — cannot login");
            return;
          }

          const loginRes = await fetch(
            `${process.env.REACT_APP_BACKEND_URL}${LOGIN_PATH}`,
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
          jwtRef.current = loginJson.token;
        }

        // Double-check online before fetching data
        if (!navigator.onLine) {
          setError("Offline — showing cached data");
          const cached = await readCachedData();
          if (cached) setData(cached);
          return;
        }

        const res = await fetch(
          `${process.env.REACT_APP_BACKEND_URL}${API_PATH}`,
          {
            headers: { Authorization: `Bearer ${jwtRef.current}` },
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
        // Network or unexpected error while online; fall back to cache gracefully
        // eslint-disable-next-line no-console
        console.error("Fetch error:", err);
        setError("Unexpected error — showing cached data");
        const cached = await readCachedData();
        if (cached) setData(cached);
      }
    };

    // initial fetch and start polling
    fetchData();
    if (!pollingRef.current) {
      pollingRef.current = setInterval(fetchData, 5000);
    }

    return () => {
      stopped = true;
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
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

      {sortedData.length > 0 ? (
        <SensorChart readings={sortedData} />
      ) : (
        <p>No sensor data available</p>
      )}
    </div>
  );
}

export default App;