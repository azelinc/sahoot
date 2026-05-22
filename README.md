# SAHOOT

Live quiz competition for seminars, forums & events — inspired by Kahoot, but stripped to the core: real-time multiplayer quiz battles.

## Features

- Host creates a room → gets a 6-digit PIN
- Players join via PIN + nickname on any phone/browser
- Speed-based scoring: faster correct answers = more points (500–1000)
- Live leaderboard after every question
- Auto-advance when timer expires or all players answer
- Top-3 podium at game end
- 10-question demo quiz included

## Tech Stack

- **Node.js + Express** — static serving
- **Socket.IO** — real-time game state sync
- Vanilla HTML/CSS/JS — no frontend build step

## Quick Start

```bash
npm install
npm start
```

Then open:
- `http://localhost:3000/host/` — to host a game
- `http://localhost:3000/player/` — to join as a player (or use multiple tabs to simulate)

## Environment Variables

| Var | Default | Description |
|-----|---------|-------------|
| `PORT` | `3000` | Server port |

## Deployment

### Docker
```bash
docker build -t sahoot .
docker run -p 3000:3000 sahoot
```

### PM2
```bash
npm install -g pm2
pm2 start server.js --name sahoot
```

## Custom Quizzes

Replace or extend `src/data/demo-quiz.js` with your own quiz data:

```js
{
  title: "Your Quiz",
  questions: [
    {
      text: "Question here?",
      choices: [{ text: "A" }, { text: "B" }, { text: "C" }, { text: "D" }],
      correctIndex: 0,
      timeLimit: 10
    }
  ]
}
```

## License

MIT


## Deploying the Backend

The frontend can be hosted statically (GitHub Pages, etc.), but the multiplayer engine needs a live Node.js server.

### Free Options

| Option | URL |
|--------|-----|
| **Render** | https://render.com (free tier, no credit card) |
| **Railway** | https://railway.app (free tier) |
| **Fly.io** | https://fly.io (free tier) |

### 1-Click Deploy to Render

1. Fork this repo on GitHub
2. Go to https://dashboard.render.com/select-repo?type=web
3. Select your `sahoot` repo
4. Set `Build Command`: `npm install`
5. Set `Start Command`: `node server.js`
6. Done! Your backend will be at `https://sahoot-xxxxx.onrender.com`

### Making it One-Click

Chain this URL after setting your backend:
```
https://azelinc.github.io/sahoot/?backend=https://sahoot-xxxxx.onrender.com
```
