import React, { useEffect, useState } from "react";
import SensorChart from "./components/SensorChart";

function App() {
  const [data, setData] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    let jwt = null;

    const fetchData = async () => {
      if (!navigator.onLine) {
        const cached = localStorage.getItem("cachedSensorData");
        if (cached) {
          setData(JSON.parse(cached));
          setError("Offline — showing cached data");
        } else {
          setError("Offline — no cached data available");
        }
        return;
      }

      try {
        // Step 1: Login once
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
            const text = await loginRes.text();
            console.error("Login failed:", text);
            setError("Login failed");
            return;
          }

          const loginJson = await loginRes.json();
          jwt = loginJson.token;
        }

        // Step 2: Fetch sensor data
        const res = await fetch(
          `${process.env.REACT_APP_BACKEND_URL}/api/data/`,
          {
            headers: { Authorization: `Bearer ${jwt}` },
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