# 🚀 Analytics Engine

A production-grade real-time analytics platform built with React, Node.js, Kafka, PostgreSQL, Redis, Docker, and WebSockets.

The system ingests user activity events, processes them through a Kafka-based event pipeline, stores them in PostgreSQL, aggregates metrics in Redis, and visualizes everything through a real-time analytics dashboard.

---

## 📌 Features

### Authentication

* JWT-based authentication
* User registration and login
* Role-based access control (Admin, Analyst, Viewer)

### Event Ingestion

* Single event ingestion
* Batch event ingestion
* Request validation with Joi
* Redis-backed rate limiting

### Real-Time Analytics

* Event volume tracking
* Top event types
* Error rate monitoring
* Unique user metrics
* Session analytics
* Live events-per-minute counter

### Alerts System

* Create alert rules
* Threshold-based alert evaluation
* Alert history
* Real-time alert notifications

### Real-Time Updates

* WebSocket integration
* Live dashboard updates
* Instant metric refresh

### Infrastructure

* Kafka event streaming
* PostgreSQL persistent storage
* Redis caching and live metrics
* Dockerized development environment

---

## 🏗 Architecture

```text
Client (React Dashboard)
            │
            ▼
      Express API
            │
            ▼
        Kafka Topic
      (raw-events)
            │
 ┌──────────┼──────────┐
 ▼          ▼          ▼
Persistence Analytics Alerts
 Consumer   Consumer  Consumer
 ▼          ▼          ▼
Postgres   Redis    Alert Rules
            │
            ▼
     Analytics APIs
            │
            ▼
      React Dashboard
```

---

## 🛠 Tech Stack

### Frontend

* React
* React Router
* Recharts
* Axios
* Socket.IO Client
* CSS Modules

### Backend

* Node.js
* Express.js
* JWT Authentication
* Joi Validation

### Data Layer

* PostgreSQL
* Redis

### Streaming & Messaging

* Apache Kafka
* KafkaJS

### DevOps

* Docker
* Docker Compose

---

## 📊 Dashboard Metrics

The dashboard provides:

* Total Events
* Unique Users
* Sessions
* Live Events/Minute
* Error Rate
* Event Volume Trends
* Top Event Types
* Alert Monitoring

---

## 📂 Project Structure

```text
analytics-engine/
├── client/
│   ├── src/
│   ├── components/
│   ├── pages/
│   └── hooks/
│
├── server/
│   ├── src/
│   ├── routes/
│   ├── services/
│   ├── consumers/
│   ├── websocket/
│   └── database/
│
├── docker-compose.yml
├── docker-compose.prod.yml
└── .env.example
```

---

## ⚙️ Local Setup

### Clone Repository

```bash
git clone https://github.com/yug0973/analytics-engine.git
cd analytics-engine
```

### Start Infrastructure

```bash
docker compose up -d
```

### Backend

```bash
cd server
npm install
npm run dev
```

### Frontend

```bash
cd client
npm install
npm run dev
```

Frontend:

```text
http://localhost:5173
```

Backend:

```text
http://localhost:3001
```

---

## 🔐 Demo Credentials

```text
Email: test@test.com
Password: Test1234!
```

---

## 🎯 Learning Outcomes

This project demonstrates:

* Event-Driven Architecture
* Distributed Systems Fundamentals
* Real-Time Data Processing
* Kafka Stream Processing
* Redis Caching Strategies
* WebSocket Communication
* Full-Stack Application Development
* Production-Oriented Backend Design

---

## 📜 License

This project is built for educational and portfolio purposes.
