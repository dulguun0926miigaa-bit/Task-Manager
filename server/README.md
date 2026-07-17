# TaskFlow Pro

A production-ready real-time collaborative task manager inspired by Discord, Notion, Trello, and Slack.

## Features
- Authentication with JWT and refresh tokens
- Real-time notifications and socket foundation
- Group and task management architecture
- Responsive dashboard UI
- Docker support for frontend, backend, and MySQL

## Quick Start

### Docker
```bash
docker compose up --build
```

### Development
```bash
npm install
npm run dev
```

## Project Structure
```text
client/
server/
docker-compose.yml
README.md
```

## Environment Variables
Create a server .env file based on .env.example.

## API Routes
- POST /api/auth/register
- POST /api/auth/login
- POST /api/auth/logout
- GET /health
