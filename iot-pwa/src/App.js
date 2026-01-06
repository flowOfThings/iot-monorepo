import React, { useEffect, useState } from "react";
import SensorChart from "./components/SensorChart";

function App() {
  const [data, setData] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    let jwt = null;

    const fetchData = async () => {
      try {
        // --- Step 1: Login once ---
        if (!jwt) {
          const loginRes = await fetch(
            `${process.env.REACT_APP_BACKEND_URL}/api/login`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ username: "demo", password: "demo" })
            }
          );

          if (!loginRes.ok) {
            const text = await loginRes.text();
            console.error("Login failed:", text);
            setError("Login failed");
            return;
          }

          const loginJson = await loginRes.json();
          jwt = loginJson.token;
        }

        // --- Step 2: Fetch sensor data ---
        const res = await fetch(
          `${process.env.REACT_APP_BACKEND_URL}/api/data/`,
          {
            headers: { Authorization: `Bearer ${jwt}` }
          }
        );

        if (!res.ok) {
          const text = await res.text();
          console.error("Data fetch failed:", text);
          setError("Failed to fetch sensor data");
          return;
        }

        const json = await res.json();
        setData(json);
      } catch (err) {
        console.error("Unexpected error:", err);
        setError("Unexpected error");
      }
    };

    // Fetch immediately
    fetchData();

    // Auto-refresh every 5 seconds
    const interval = setInterval(fetchData, 5000);

    return () => clearInterval(interval);
  }, []);

  // Sort oldest → newest (Option A)
  const sortedData = [...data].sort(
    (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
  );

  return (
    <div style={{ padding: "20px" }}>
      <h2>Sensor Dashboard</h2>

      {error && <p style={{ color: "red" }}>{error}</p>}

      {/* Chart */}
      {sortedData.length > 0 && <SensorChart readings={sortedData} />}

      {/* List (commented out) */}
      {/*
      <ul>
        {sortedData.map((r) => (
          <li key={r.timestamp}>
            {r.timestamp}: {r.temperature}°C / {r.humidity}%
          </li>
        ))}
      </ul>
      */}
    </div>
  );
}

export default App;