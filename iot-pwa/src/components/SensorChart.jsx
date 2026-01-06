import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  LineElement,
  CategoryScale,
  LinearScale,
  PointElement,
  Tooltip,
  Legend
} from "chart.js";

ChartJS.register(
  LineElement,
  CategoryScale,
  LinearScale,
  PointElement,
  Tooltip,
  Legend
);

export default function SensorChart({ readings }) {
  const data = {
    labels: readings.map(r =>
      new Date(r.timestamp).toLocaleTimeString("fi-FI", { hour12: false })
    ),
    datasets: [
      {
        label: "Temperature (°C)",
        data: readings.map(r => r.temperature),
        borderColor: "rgb(255, 99, 132)",
        backgroundColor: "rgba(255, 99, 132, 0.3)",
        tension: 0.3
      },
      {
        label: "Humidity (%)",
        data: readings.map(r => r.humidity),
        borderColor: "rgb(54, 162, 235)",
        backgroundColor: "rgba(54, 162, 235, 0.3)",
        tension: 0.3
      }
    ]
  };

  return <Line data={data} />;
}