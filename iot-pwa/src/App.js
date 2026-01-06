import React, { useEffect, useState, useRef } from "react";
import SensorChart from "./components/SensorChart";

const CACHE_NAME = "sensor-data-cache-v7"; // match your SW version (v7)
const API_PATH = "/api/data/";
const LOGIN_PATH = "/api/login";

function normalizeReadings(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((r) => {
      const ts = r.timestamp ? new Date(r.timestamp) : null;
      return {
        timestamp: ts && !Number.isNaN(ts.getTime()) ? ts.toISOString() : null,
        temperature: r.temperature == null ? null : Number(r.temperature),
        humidity: r.humidity == null ? null : Number(r.humidity),
      };
    })
    .filter((r) => r.timestamp && r.temperature !== null && r.humidity !== null);
}

async function readCachedData() {
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
      const json = await cachedResponse.json();
      return normalizeReadings(json);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.log("SW cache read failed:", err);
  }

  // Fallback to localStorage
  try {
    const local = localStorage.getItem("cachedSensorData");
    if (local) {
      return normalizeReadings(JSON.parse(local));
    }
  } catch (err) {
    // ignore parse errors
  }

  return null;
}

function App() {
  const [data, setData] = useState([]);
  const [error, setError] = useState(null); // only for real errors (no cached data)
  const [cached, setCached] = useState(false); // true when data came from cache
  const pollingRef = useRef(null);
  const jwtRef = useRef(null);
  const stoppedRef = useRef(false);

  useEffect(() => {
    stoppedRef.current = false;

    const fetchData = async () => {
      if (stoppedRef.current) return;

      // If offline, read cache and stop polling
      if (!navigator.onLine) {
        const cachedData = await readCachedData();
        if (cachedData && cachedData.length > 0) {
          setData(cachedData);
          setCached(true);
          setError(null); // clear any previous error because we have cached data
        } else {
          setData([]);
          setCached(false);
          setError("Offline — no cached data available");
        }

        // stop polling while offline
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
        return;
      }

      // Ensure polling is running when online
      if (!pollingRef.current) {
        pollingRef.current = setInterval(fetchData, 5000);
      }

      // Online: attempt login and fetch
      try {
        // Login if needed
        if (!jwtRef.current) {
          const loginRes = await fetch(`${process.env.REACT_APP_BACKEND_URL}${LOGIN_PATH}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: "demo", password: "demo" }),
          });

          if (!loginRes.ok) {
            // If login fails, try cached data before reporting error
            const cachedData = await readCachedData();
            if (cachedData && cachedData.length > 0) {
              setData(cachedData);
              setCached(true);
              setError(null);
              return;
            }
            setError("Login failed");
            return;
          }

          const loginJson = await loginRes.json();
          jwtRef.current = loginJson.token;
        }

        // Fetch sensor data
        const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}${API_PATH}`, {
          headers: { Authorization: `Bearer ${jwtRef.current}` },
          cache: "no-store",
        });

        if (!res.ok) {
          // Try cached data before reporting error
          const cachedData = await readCachedData();
          if (cachedData && cachedData.length > 0) {
            setData(cachedData);
            setCached(true);
            setError(null);
            return;
          }
          setError("Failed to fetch sensor data");
          return;
        }

        const json = await res.json();
        const normalized = normalizeReadings(json);
        setData(normalized);
        setCached(false);
        setError(null);

        // Save to localStorage for fallback
        try {
          localStorage.setItem("cachedSensorData", JSON.stringify(normalized));
        } catch (err) {
          // ignore storage errors
        }
      } catch (err) {
        // Network or unexpected error while online: try cache first
        // eslint-disable-next-line no-console
        console.error("Fetch error:", err);

        const cachedData = await readCachedData();
        if (cachedData && cachedData.length > 0) {
          setData(cachedData);
          setCached(true);
          setError(null); // do not show fatal error when cached data exists
          return;
        }

        setData([]);
        setCached(false);
        setError("Unexpected error");
      }
    };

    // initial fetch and start polling
    fetchData();
    if (!pollingRef.current) {
      pollingRef.current = setInterval(fetchData, 5000);
    }

    return () => {
      stoppedRef.current = true;
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, []);

  const sortedData = [...data].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  return (
    <div style={{ padding: "20px" }}>
      <h2>Sensor Dashboard</h2>

      {!navigator.onLine && (
        <div style={{ background: "#ffcccb", padding: "10px", marginBottom: "10px" }}>
          You are offline — some features may be unavailable
        </div>
      )}

      {/* Show cached status (non-error) */}
      {cached && (
        <div style={{ background: "#fff3cd", padding: "8px", marginBottom: "10px", color: "#856404" }}>
          Showing cached data
        </div>
      )}

      {/* Only show error when there truly is no usable data */}
      {error && !cached && <p style={{ color: "red" }}>{error}</p>}

      {sortedData.length > 0 ? (
        <SensorChart readings={sortedData} />
      ) : (
        <p>No sensor data available</p>
      )}
    </div>
  );
}

export default App;