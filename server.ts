import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import { nanoid } from "nanoid";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = 3000;

// Game State
interface Player {
  id: string;
  name: string;
  roomId: string;
  role?: "liar" | "citizen";
  votedFor?: string;
  isHost: boolean;
}

interface Room {
  id: string;
  players: Player[];
  gameState: "lobby" | "playing" | "voting" | "result";
  category?: string;
  keyword?: string;
  liarId?: string;
  votes: Record<string, number>; // playerId -> count
}

const rooms: Record<string, Room> = {};
const players: Record<string, Player> = {};

// Game Data
const CATEGORIES = {
  "동물": ["강아지", "고양이", "사자", "코끼리", "원숭이", "기린", "펭귄", "호랑이", "곰", "토끼"],
  "음식": ["피자", "햄버거", "초밥", "파스타", "아이스크림", "초콜릿", "사과", "바나나", "빵", "치즈"],
  "장소": ["학교", "병원", "공원", "해변", "도서관", "영화관", "식당", "공항", "헬스장", "박물관"],
  "사물": ["스마트폰", "컴퓨터", "의자", "책상", "자동차", "자전거", "시계", "볼펜", "책", "신발"],
  "직업": ["의사", "선생님", "경찰관", "소방관", "요리사", "화가", "가수", "파일럿", "간호사", "엔지니어"],
};

const FOOL_MODE_PAIRS: Record<string, [string, string][]> = {
  "동물": [
    ["강아지", "고양이"], ["사자", "호랑이"], ["소", "말"], ["독수리", "매"], ["고래", "상어"], ["치타", "표범"], ["악어", "하마"]
  ],
  "음식": [
    ["짜장면", "짬뽕"], ["피자", "햄버거"], ["콜라", "사이다"], ["물냉면", "비빔냉면"], ["후라이드", "양념치킨"], ["사과", "배"], ["김치찌개", "된장찌개"]
  ],
  "장소": [
    ["노래방", "영화관"], ["바다", "계곡"], ["백화점", "마트"], ["학교", "학원"], ["PC방", "오락실"], ["카페", "도서관"]
  ],
  "사물": [
    ["볼펜", "연필"], ["안경", "선글라스"], ["노트북", "태블릿"], ["칫솔", "치약"], ["우산", "양산"], ["이어폰", "헤드셋"]
  ],
  "직업": [
    ["경찰", "형사"], ["의사", "간호사"], ["가수", "배우"], ["대통령", "국회의원"], ["요리사", "제빵사"], ["택시기사", "버스기사"]
  ]
};

interface Room {
  id: string;
  players: Player[];
  gameState: "lobby" | "playing" | "voting" | "result";
  category?: string;
  keyword?: string;
  liarKeyword?: string; // For fool mode
  liarId?: string;
  votes: Record<string, number>; // playerId -> count
  mode: "basic" | "fool";
}

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("create_room", (playerName: string, callback) => {
    const roomId = nanoid(6).toUpperCase();
    const player: Player = {
      id: socket.id,
      name: playerName,
      roomId,
      isHost: true,
    };

    rooms[roomId] = {
      id: roomId,
      players: [player],
      gameState: "lobby",
      votes: {},
      mode: "basic",
    };
    players[socket.id] = player;

    socket.join(roomId);
    callback({ roomId });
    io.to(roomId).emit("room_update", rooms[roomId]);
  });

  socket.on("join_room", ({ roomId, playerName }, callback) => {
    const room = rooms[roomId];
    if (!room) {
      return callback({ error: "방을 찾을 수 없습니다." });
    }
    if (room.gameState !== "lobby") {
      return callback({ error: "이미 게임이 진행 중입니다." });
    }
    if (room.players.some((p) => p.name === playerName)) {
      return callback({ error: "이미 사용 중인 닉네임입니다." });
    }

    const player: Player = {
      id: socket.id,
      name: playerName,
      roomId,
      isHost: false,
    };

    room.players.push(player);
    players[socket.id] = player;

    socket.join(roomId);
    callback({ roomId });
    io.to(roomId).emit("room_update", room);
  });

  socket.on("change_mode", (mode: "basic" | "fool") => {
    const player = players[socket.id];
    if (!player || !player.isHost) return;

    const room = rooms[player.roomId];
    if (!room) return;

    room.mode = mode;
    io.to(room.id).emit("room_update", room);
  });

  socket.on("start_game", () => {
    const player = players[socket.id];
    if (!player || !player.isHost) return;

    const room = rooms[player.roomId];
    if (!room || room.players.length < 3) return; // Min 3 players

    // Reset game state
    room.gameState = "playing";
    room.votes = {};
    room.players.forEach((p) => {
      delete p.votedFor;
      delete p.role;
    });

    // Assign Liar
    const liarIndex = Math.floor(Math.random() * room.players.length);
    room.liarId = room.players[liarIndex].id;

    room.players.forEach((p, index) => {
      p.role = index === liarIndex ? "liar" : "citizen";
    });

    // Pick category and keyword based on mode
    if (room.mode === "fool") {
      const categoryKeys = Object.keys(FOOL_MODE_PAIRS);
      const randomCategory = categoryKeys[Math.floor(Math.random() * categoryKeys.length)];
      const pairs = FOOL_MODE_PAIRS[randomCategory];
      const randomPair = pairs[Math.floor(Math.random() * pairs.length)];
      
      // Randomly assign which word is for citizens and which for liar
      if (Math.random() > 0.5) {
        room.keyword = randomPair[0];
        room.liarKeyword = randomPair[1];
      } else {
        room.keyword = randomPair[1];
        room.liarKeyword = randomPair[0];
      }
      room.category = randomCategory;
    } else {
      // Basic mode
      const categoryKeys = Object.keys(CATEGORIES);
      const randomCategory = categoryKeys[Math.floor(Math.random() * categoryKeys.length)];
      const words = CATEGORIES[randomCategory as keyof typeof CATEGORIES];
      const randomKeyword = words[Math.floor(Math.random() * words.length)];

      room.category = randomCategory;
      room.keyword = randomKeyword;
      room.liarKeyword = undefined;
    }

    io.to(room.id).emit("game_started", {
      category: room.category,
      mode: room.mode,
      players: room.players.map(p => ({ id: p.id, name: p.name })),
    });

    // Send individual roles
    room.players.forEach((p) => {
      let keywordToSend = null;
      if (p.role === "citizen") {
        keywordToSend = room.keyword;
      } else if (p.role === "liar") {
        keywordToSend = room.mode === "fool" ? room.liarKeyword : null;
      }

      io.to(p.id).emit("your_role", {
        role: p.role,
        keyword: keywordToSend,
        category: room.category,
      });
    });
    
    io.to(room.id).emit("room_update", room);
  });

  socket.on("vote", (targetId: string) => {
    const player = players[socket.id];
    if (!player || player.votedFor) return;

    const room = rooms[player.roomId];
    if (!room || room.gameState !== "voting") return;

    player.votedFor = targetId;
    room.votes[targetId] = (room.votes[targetId] || 0) + 1;

    // Check if everyone voted
    const allVoted = room.players.every((p) => p.votedFor);
    
    io.to(room.id).emit("room_update", room);

    if (allVoted) {
      room.gameState = "result";
      
      // Find who got most votes
      let maxVotes = 0;
      let votedOutId: string | null = null;
      let isTie = false;

      Object.entries(room.votes).forEach(([pid, count]) => {
        if (count > maxVotes) {
          maxVotes = count;
          votedOutId = pid;
          isTie = false;
        } else if (count === maxVotes) {
          isTie = true;
        }
      });

      const liarCaught = votedOutId === room.liarId && !isTie;
      const liarName = room.players.find(p => p.id === room.liarId)?.name;
      const votedOutName = room.players.find(p => p.id === votedOutId)?.name;

      io.to(room.id).emit("game_over", {
        liarId: room.liarId,
        liarName,
        votedOutId,
        votedOutName,
        liarCaught,
        keyword: room.keyword,
        liarKeyword: room.liarKeyword,
        isTie,
        mode: room.mode
      });
      
      io.to(room.id).emit("room_update", room);
    }
  });

  socket.on("start_voting", () => {
      const player = players[socket.id];
      if (!player || !player.isHost) return;
      
      const room = rooms[player.roomId];
      if (!room) return;

      room.gameState = "voting";
      io.to(room.id).emit("room_update", room);
  });

  socket.on("play_again", () => {
    const player = players[socket.id];
    if (!player || !player.isHost) return;

    const room = rooms[player.roomId];
    if (!room) return;

    room.gameState = "lobby";
    room.votes = {};
    room.players.forEach((p) => {
      delete p.votedFor;
      delete p.role;
    });
    
    io.to(room.id).emit("room_update", room);
  });

  socket.on("disconnect", () => {
    const player = players[socket.id];
    if (player) {
      const room = rooms[player.roomId];
      if (room) {
        room.players = room.players.filter((p) => p.id !== socket.id);
        
        if (room.players.length === 0) {
          delete rooms[room.id];
        } else {
          // Assign new host if host left
          if (player.isHost) {
            room.players[0].isHost = true;
          }
          io.to(room.id).emit("room_update", room);
        }
      }
      delete players[socket.id];
    }
    console.log("User disconnected:", socket.id);
  });
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
