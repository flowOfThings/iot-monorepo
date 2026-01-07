Check out Django backend code at https://github.com/flowOfThings/django-iot-backend

![Architecture diagram](/images/chart.png)


System Architecture

This project demonstrates a scalable IoT ingestion and visualization pipeline designed for both demo environments and industrial deployments.
1. ESP8266 Sensor Nodes
Low-power microcontrollers collect temperature/humidity readings and send signed payloads upstream.
2. HTTPS Gateway (Linux device or Cloudflare Worker)
Acts as the first secure hop:
- Terminates TLS
- Signs sensor payloads using a shared secret
- Normalizes the JSON format
This ensures even constrained devices can participate securely.
3. Cloudflare Workers (Edge Ingestion Layer)
Workers run globally at the edge and provide:
- JWT validation
- Input sanitization
- Rate limiting
- Fan‑out routing to multiple backends
This design enables extremely low-latency ingestion and horizontal scalability.
4. Render Backend (Demo Environment)
A lightweight Express backend used for:
- Rapid prototyping
- Demo dashboards
- Educational walkthroughs
It also serves a classic React UI for quick visualization.
5. Django Backend (Industrial System)
The production-grade backend:
- Implements business logic
- Handles authentication and RBAC
- Writes validated sensor data into TimescaleDB
- Exposes APIs for the industrial PWA
6. TimescaleDB (Time-Series Storage)
Stores high-frequency sensor data using:
- Hypertables
- Continuous aggregates
- Retention policies
Optimized for IoT workloads.
7. Industrial PWA Dashboard
A modern, offline-first dashboard:
- Real-time charts
- Historical analytics
- Field-ready UX
- Works on tablets and low-connectivity environments
