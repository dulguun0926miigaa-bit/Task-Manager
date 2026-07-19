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
Create a server `.env` file based on `server/.env.example`.

Example server `.env` for Docker/Postgres:
```env
PORT=5000
NODE_ENV=development
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/taskflow?schema=public
JWT_SECRET=taskflow-super-secret
JWT_REFRESH_SECRET=taskflow-refresh-secret
CLIENT_URL=http://localhost:5173
```

If you run the server locally without Docker, use:
```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/taskflow?schema=public
```

## API Routes
- POST /api/auth/register
- POST /api/auth/login
- POST /api/auth/logout
- GET /health
