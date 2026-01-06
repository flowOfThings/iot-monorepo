import React, { useEffect, useState } from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  LineElement,
  CategoryScale,
  LinearScale,
  PointElement,
  Legend,
  Tooltip
} from "chart.js";

ChartJS.register(LineElement, CategoryScale, LinearScale, PointElement, Legend, Tooltip);

function App() {
  const [history, setHistory] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/sensor`);
        const json = await res.json();

        setHistory(
          json
          .sort((a, b) => a.timestamp - b.timestamp)
          .map(entry => ({
            time: new Date(entry.timestamp * 1000).toLocaleTimeString(),
            temperature: entry.temperature,
            humidity: entry.humidity
          }))
        );
      } catch (err) {
        console.error("Error fetching data:", err);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 5000); // refresh every 5s
    return () => clearInterval(interval);
  }, []);

  const chartData = {
    labels: history.map(entry => entry.time),
    datasets: [
      {
        label: "Temperature (°C)",
        data: history.map(entry => entry.temperature),
        borderColor: "red",
        fill: false,
        tension: 0.3   // smooth line
      },
      {
        label: "Humidity (%)",
        data: history.map(entry => entry.humidity),
        borderColor: "blue",
        fill: false,
        tension: 0.3
      }
    ]
  };

const chartOptions = {
  responsive: true,
  scales: {
    x: {
      title: { display: true, text: "Time" }
    },
    y: {
      title: { display: true, text: "Values" }
    }
  }
};

  return (
    <div style={{ fontFamily: "Arial", padding: "20px" }}>
      <h1>🌡️ IoT Sensor Dashboard</h1>
      <Line data={chartData} options={chartOptions} />
    </div>
  );
}

export default App;