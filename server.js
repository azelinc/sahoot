const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(express.static('public'));

const DEMO_QUIZ = require('./src/data/demo-quiz');
const rooms = {};

function generatePin() {
  let pin;
  do {
    pin = Math.floor(100000 + Math.random() * 900000).toString();
  } while (rooms[pin]);
  return pin;
}

function createRoom(hostSocket, quiz = DEMO_QUIZ) {
  const pin = generatePin();
  const room = {
    pin,
    hostId: hostSocket.id,
    quiz,
    players: {},
    state: 'waiting',
    currentQuestionIndex: -1,
    questionStartTime: 0,
    answersReceived: new Set(),
    timer: null,
    maxPlayers: 100,
  };
  rooms[pin] = room;
  hostSocket.join(pin);
  hostSocket.emit('roomCreated', { pin, quizTitle: quiz.title });
  return room;
}

function broadcastPlayerList(room) {
  const list = Object.values(room.players).map(p => ({
    name: p.name,
    score: p.score
  }));
  io.to(room.pin).emit('playerList', list);
}

function sendQuestion(room) {
  const q = room.quiz.questions[room.currentQuestionIndex];
  room.state = 'question';
  room.answersReceived.clear();
  room.questionStartTime = Date.now();

  io.to(room.pin).emit('question', {
    index: room.currentQuestionIndex,
    total: room.quiz.questions.length,
    text: q.text,
    image: q.image || null,
    timeLimit: q.timeLimit || 10,
    choices: q.choices.map((c, i) => ({ index: i, text: c.text })),
  });

  const timeMs = (q.timeLimit || 10) * 1000;
  room.timer = setTimeout(() => {
    showLeaderboard(room);
  }, timeMs + 1500);
}

function showLeaderboard(room) {
  room.state = 'leaderboard';
  const q = room.quiz.questions[room.currentQuestionIndex];

  const results = Object.entries(room.players).map(([sid, p]) => {
    const ans = p.answers[room.currentQuestionIndex];
    let isCorrect = false;
    let points = 0;
    if (ans) {
      isCorrect = ans.choiceIndex === q.correctIndex;
      if (isCorrect) {
        const timeUsed = ans.time;
        const maxTime = (q.timeLimit || 10) * 1000;
        const speedBonus = Math.max(0, 1 - (timeUsed / maxTime));
        points = Math.round(500 + speedBonus * 500);
      }
      p.score += points;
    }
    return {
      name: p.name,
      isCorrect,
      points,
      totalScore: p.score,
    };
  });

  results.sort((a, b) => b.totalScore - a.totalScore);

  io.to(room.hostId).emit('leaderboard', {
    questionIndex: room.currentQuestionIndex,
    correctIndex: q.correctIndex,
    results,
    correctCount: results.filter(r => r.isCorrect).length,
    totalPlayers: results.length,
  });

  io.to(room.pin).emit('roundOver', {
    correctIndex: q.correctIndex,
  });

  Object.entries(room.players).forEach(([sid, p]) => {
    const res = results.find(r => r.name === p.name);
    if (res) {
      io.to(sid).emit('personalResult', {
        isCorrect: res.isCorrect,
        points: res.points,
        totalScore: res.totalScore,
        rank: results.findIndex(r => r.name === p.name) + 1,
      });
    }
  });
}

function endGame(room) {
  room.state = 'ended';
  const podium = Object.values(room.players)
    .map(p => ({ name: p.name, score: p.score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  io.to(room.hostId).emit('gameEnded', { podium });
  io.to(room.pin).emit('gameEnded', { podium });
}

io.on('connection', (socket) => {
  console.log('Client connected', socket.id);

  socket.on('createRoom', () => {
    createRoom(socket);
  });

  socket.on('startGame', () => {
    const room = Object.values(rooms).find(r => r.hostId === socket.id);
    if (!room) return;
    room.currentQuestionIndex = 0;
    sendQuestion(room);
  });

  socket.on('nextQuestion', () => {
    const room = Object.values(rooms).find(r => r.hostId === socket.id);
    if (!room) return;
    if (room.timer) clearTimeout(room.timer);
    room.currentQuestionIndex++;
    if (room.currentQuestionIndex >= room.quiz.questions.length) {
      endGame(room);
    } else {
      sendQuestion(room);
    }
  });

  socket.on('showLeaderboard', () => {
    const room = Object.values(rooms).find(r => r.hostId === socket.id);
    if (!room) return;
    if (room.timer) clearTimeout(room.timer);
    showLeaderboard(room);
  });

  socket.on('kickPlayer', ({ playerName }) => {
    const room = Object.values(rooms).find(r => r.hostId === socket.id);
    if (!room) return;
    const entry = Object.entries(room.players).find(([sid, p]) => p.name === playerName);
    if (entry) {
      const [sid] = entry;
      io.to(sid).emit('kicked');
      delete room.players[sid];
      broadcastPlayerList(room);
    }
  });

  socket.on('joinRoom', ({ pin, name }) => {
    const cleanPin = pin.toString().trim();
    const room = rooms[cleanPin];
    if (!room) {
      socket.emit('joinError', 'Room not found. Check the PIN.');
      return;
    }
    if (room.state !== 'waiting') {
      socket.emit('joinError', 'Game already in progress.');
      return;
    }
    if (Object.values(room.players).find(p => p.name.toLowerCase() === name.toLowerCase())) {
      socket.emit('joinError', 'Name already taken in this room.');
      return;
    }
    if (Object.keys(room.players).length >= room.maxPlayers) {
      socket.emit('joinError', 'Room is full.');
      return;
    }
    room.players[socket.id] = {
      name: name.trim(),
      score: 0,
      answers: [],
    };
    socket.join(room.pin);
    socket.emit('joined', { pin: cleanPin, quizTitle: room.quiz.title });
    broadcastPlayerList(room);
  });

  socket.on('answer', ({ choiceIndex }) => {
    const room = Object.values(rooms).find(r => r.players[socket.id]);
    if (!room || room.state !== 'question') return;
    if (room.answersReceived.has(socket.id)) return;

    const player = room.players[socket.id];
    const timeUsed = Date.now() - room.questionStartTime;

    player.answers[room.currentQuestionIndex] = {
      choiceIndex,
      time: timeUsed,
    };
    room.answersReceived.add(socket.id);
    socket.emit('answerAck');

    if (room.answersReceived.size === Object.keys(room.players).length && Object.keys(room.players).length > 0) {
      if (room.timer) clearTimeout(room.timer);
      setTimeout(() => showLeaderboard(room), 800);
    }
  });

  socket.on('disconnect', () => {
    const hostRoom = Object.values(rooms).find(r => r.hostId === socket.id);
    if (hostRoom) {
      io.to(hostRoom.pin).emit('hostLeft');
      if (hostRoom.timer) clearTimeout(hostRoom.timer);
      delete rooms[hostRoom.pin];
      return;
    }
    for (const pin in rooms) {
      const room = rooms[pin];
      if (room.players[socket.id]) {
        delete room.players[socket.id];
        broadcastPlayerList(room);
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Sahoot server running on port ${PORT}`);
});
