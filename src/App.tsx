import { useEffect, useState } from 'react';
import io from 'socket.io-client';
import { motion, AnimatePresence } from 'motion/react';
import { Users, Play, AlertTriangle, CheckCircle, XCircle, Crown, Link as LinkIcon, Copy } from 'lucide-react';

interface Player {
  id: string;
  name: string;
  isHost: boolean;
  votedFor?: string;
}

interface Room {
  id: string;
  players: Player[];
  gameState: 'lobby' | 'playing' | 'voting' | 'result';
  category?: string;
  keyword?: string;
  liarId?: string;
  votes: Record<string, number>;
  mode: 'basic' | 'fool';
}

export default function App() {
  const [socket, setSocket] = useState<any>(null);
  const [screen, setScreen] = useState<'welcome' | 'lobby' | 'game' | 'voting' | 'result'>('welcome');
  const [playerName, setPlayerName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [room, setRoom] = useState<Room | null>(null);
  const [role, setRole] = useState<'liar' | 'citizen' | null>(null);
  const [keyword, setKeyword] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gameResult, setGameResult] = useState<any>(null);

  useEffect(() => {
    // Use default connection settings which try polling first, then upgrade to websocket
    // This is often more robust in proxy/firewall environments
    const newSocket = io(window.location.origin, {
      path: '/socket.io/',
      transports: ['polling', 'websocket'],
    });
    setSocket(newSocket);

    newSocket.on('connect_error', (err) => {
      console.error('Socket connection error:', err);
      // Don't show alert immediately, let it retry
      // setError('서버 연결에 실패했습니다. 잠시 후 다시 시도해주세요.');
    });

    newSocket.on('connect', () => {
      console.log('Connected to server');
      setError(null);
      // If we think we are in a room, check if it still exists on server
      // This handles server restarts where in-memory state is lost
      setRoomId((currentRoomId) => {
        if (currentRoomId) {
          newSocket.emit('check_room', currentRoomId, (response: { exists: boolean }) => {
            if (!response.exists) {
              alert('방이 만료되었거나 서버가 재시작되었습니다. 메인 화면으로 이동합니다.');
              setScreen('welcome');
              setRoomId('');
              setRoom(null);
            } else {
              // Re-join logic could go here if we wanted to persist sessions, 
              // but for now just knowing the room exists is a good start.
              // Ideally we would re-associate the new socket ID with the player.
            }
          });
        }
        return currentRoomId;
      });
    });

    newSocket.on('room_update', (updatedRoom: Room) => {
      setRoom(updatedRoom);
      if (updatedRoom.gameState === 'lobby') setScreen('lobby');
      if (updatedRoom.gameState === 'playing') setScreen('game');
      if (updatedRoom.gameState === 'voting') setScreen('voting');
      if (updatedRoom.gameState === 'result') setScreen('result');
    });

    newSocket.on('your_role', (data: { role: 'liar' | 'citizen'; keyword: string | null; category: string }) => {
      setRole(data.role);
      setKeyword(data.keyword);
      setCategory(data.category);
    });

    newSocket.on('game_over', (result) => {
      setGameResult(result);
      setScreen('result');
    });

    return () => {
      newSocket.close();
    };
  }, []);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (screen !== 'welcome' && screen !== 'result') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [screen]);

  const createRoom = () => {
    if (!playerName) return setError('닉네임을 입력해주세요');
    socket?.emit('create_room', playerName, (response: any) => {
      if (response.roomId) {
        setRoomId(response.roomId);
        setScreen('lobby');
      }
    });
  };

  const joinRoom = () => {
    if (!playerName) return setError('닉네임을 입력해주세요');
    if (!roomId) return setError('방 코드를 입력해주세요');
    socket?.emit('join_room', { roomId, playerName }, (response: any) => {
      if (response.error) {
        setError(response.error);
      } else {
        setScreen('lobby');
      }
    });
  };

  const changeMode = (mode: 'basic' | 'fool') => {
    socket?.emit('change_mode', mode);
  };

  const startGame = () => {
    socket?.emit('start_game');
  };

  const startVoting = () => {
    socket?.emit('start_voting');
  };

  const vote = (targetId: string) => {
    socket?.emit('vote', targetId);
  };

  const playAgain = () => {
    socket?.emit('play_again');
  };

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.origin);
    alert('링크가 복사되었습니다! 친구들에게 공유하세요.');
  };

  const isHost = room?.players.find((p) => p.id === socket?.id)?.isHost;

  return (
    <div className="min-h-screen bg-zinc-900 text-white font-sans flex items-center justify-center p-4">
      <AnimatePresence mode="wait">
        {screen === 'welcome' && (
          <motion.div
            key="welcome"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full max-w-md space-y-8"
          >
            <div className="text-center">
              <h1 className="text-5xl font-bold bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent mb-2">
                라이어 게임
              </h1>
              <p className="text-zinc-400">속이고, 찾아내고, 승리하세요.</p>
            </div>

            <div className="bg-zinc-800/50 backdrop-blur-xl p-8 rounded-2xl border border-white/10 shadow-xl space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-400">닉네임</label>
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  placeholder="닉네임을 입력하세요"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={createRoom}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  <Play size={18} />
                  방 만들기
                </button>
                <div className="space-y-2">
                  <input
                    type="text"
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                    className="w-full bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-center uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
                    placeholder="코드 입력"
                  />
                  <button
                    onClick={joinRoom}
                    className="w-full bg-zinc-700 hover:bg-zinc-600 text-white font-semibold py-2 px-4 rounded-xl transition-colors text-sm"
                  >
                    참가하기
                  </button>
                </div>
              </div>
              
              {error && (
                <div className="text-red-400 text-sm text-center bg-red-400/10 py-2 rounded-lg">
                  {error}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {screen === 'lobby' && room && (
          <motion.div
            key="lobby"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="w-full max-w-2xl"
          >
            <div className="text-center mb-8">
              <div className="flex flex-col items-center gap-3">
                <div className="inline-block bg-zinc-800 px-6 py-3 rounded-2xl text-lg font-mono text-zinc-400 border border-white/5 shadow-lg">
                  방 코드: <span className="text-white font-bold tracking-widest ml-2">{room.id}</span>
                </div>
                <button
                  onClick={copyLink}
                  className="text-indigo-400 text-sm hover:text-indigo-300 transition-colors flex items-center gap-1.5 font-medium py-1 px-3 rounded-lg hover:bg-indigo-500/10"
                >
                  <LinkIcon size={14} />
                  게임 링크 복사하기
                </button>
              </div>
              <h2 className="text-3xl font-bold mt-8">플레이어 대기 중...</h2>
              <p className="text-zinc-400 mt-2">{room.players.length}명 접속 중</p>
            </div>

            <div className="bg-zinc-800/50 p-6 rounded-2xl border border-white/10 mb-8">
              <h3 className="text-zinc-400 text-sm font-medium mb-4 uppercase tracking-wider">게임 모드</h3>
              <div className="flex gap-4">
                <button
                  onClick={() => isHost && changeMode('basic')}
                  disabled={!isHost}
                  className={`flex-1 p-4 rounded-xl border transition-all ${
                    room.mode === 'basic'
                      ? 'bg-indigo-600 border-indigo-400 ring-2 ring-indigo-400 ring-offset-2 ring-offset-zinc-900'
                      : 'bg-zinc-900/50 border-white/10 hover:bg-zinc-800'
                  } ${!isHost ? 'cursor-default' : ''}`}
                >
                  <div className="font-bold text-lg mb-1">기본 모드</div>
                  <div className="text-xs text-zinc-400">라이어는 제시어를 모릅니다.</div>
                </button>
                <button
                  onClick={() => isHost && changeMode('fool')}
                  disabled={!isHost}
                  className={`flex-1 p-4 rounded-xl border transition-all ${
                    room.mode === 'fool'
                      ? 'bg-purple-600 border-purple-400 ring-2 ring-purple-400 ring-offset-2 ring-offset-zinc-900'
                      : 'bg-zinc-900/50 border-white/10 hover:bg-zinc-800'
                  } ${!isHost ? 'cursor-default' : ''}`}
                >
                  <div className="font-bold text-lg mb-1">바보 모드</div>
                  <div className="text-xs text-zinc-400">라이어는 다른 제시어를 받습니다.</div>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
              {room.players.map((player) => (
                <div
                  key={player.id}
                  className="bg-zinc-800/50 p-4 rounded-xl border border-white/5 flex items-center gap-3"
                >
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center font-bold text-lg">
                    {player.name[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{player.name}</div>
                    {player.isHost && <div className="text-xs text-indigo-400 flex items-center gap-1"><Crown size={12}/> 방장</div>}
                  </div>
                </div>
              ))}
            </div>

            {isHost && (
              <div className="flex justify-center">
                <button
                  onClick={startGame}
                  disabled={room.players.length < 3}
                  className="bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 px-12 rounded-full shadow-lg shadow-green-600/20 transition-all transform hover:scale-105"
                >
                  게임 시작
                </button>
              </div>
            )}
            {isHost && room.players.length < 3 && (
               <p className="text-center text-zinc-500 mt-4 text-sm">최소 3명이 필요합니다.</p>
            )}
          </motion.div>
        )}

        {screen === 'game' && (
          <motion.div
            key="game"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="w-full max-w-md text-center space-y-8"
          >
            <div className="bg-zinc-800/50 p-8 rounded-3xl border border-white/10 shadow-2xl">
              <div className="text-zinc-400 text-sm uppercase tracking-widest mb-2">주제</div>
              <div className="text-2xl font-bold mb-8 text-indigo-300">{category}</div>

              <div className="text-zinc-400 text-sm uppercase tracking-widest mb-4">당신의 역할</div>
              {keyword ? (
                <div className="space-y-4">
                  <div className="text-5xl font-black text-green-400 tracking-tight">{keyword}</div>
                  <p className="text-zinc-400">
                    {room?.mode === 'fool' 
                      ? "제시어를 확인했습니다. 들키지 않게 설명하세요." 
                      : "라이어에게 들키지 않게 설명하세요."}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="text-5xl font-black text-red-500 tracking-tight">라이어</div>
                  <p className="text-zinc-400">정체를 들키지 않게 연기하세요.</p>
                </div>
              )}
            </div>

            {isHost && (
              <button
                onClick={startVoting}
                className="bg-red-600 hover:bg-red-500 text-white font-bold py-3 px-8 rounded-xl shadow-lg shadow-red-600/20 transition-all"
              >
                투표 시작
              </button>
            )}
          </motion.div>
        )}

        {screen === 'voting' && (
          <motion.div
            key="voting"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="w-full max-w-2xl text-center"
          >
            <h2 className="text-3xl font-bold mb-8">누가 라이어인가요?</h2>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {room?.players.map((player) => (
                <button
                  key={player.id}
                  onClick={() => vote(player.id)}
                  disabled={!!room.players.find(p => p.id === socket?.id)?.votedFor}
                  className={`p-6 rounded-xl border transition-all ${
                    room.players.find(p => p.id === socket?.id)?.votedFor === player.id
                      ? 'bg-indigo-600 border-indigo-400 ring-2 ring-indigo-400 ring-offset-2 ring-offset-zinc-900'
                      : 'bg-zinc-800/50 border-white/10 hover:bg-zinc-700 hover:border-white/20'
                  } ${!!room.players.find(p => p.id === socket?.id)?.votedFor && room.players.find(p => p.id === socket?.id)?.votedFor !== player.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-zinc-700 to-zinc-600 flex items-center justify-center font-bold text-2xl mb-3">
                    {player.name[0].toUpperCase()}
                  </div>
                  <div className="font-medium">{player.name}</div>
                </button>
              ))}
            </div>
            <p className="mt-8 text-zinc-400">
              {room?.players.filter(p => p.votedFor).length} / {room?.players.length} 투표 완료
            </p>
          </motion.div>
        )}

        {screen === 'result' && gameResult && (
          <motion.div
            key="result"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md text-center space-y-8"
          >
            <div className="space-y-4">
              {gameResult.liarCaught ? (
                <>
                  <CheckCircle className="w-20 h-20 text-green-500 mx-auto" />
                  <h2 className="text-4xl font-bold text-green-400">시민 승리!</h2>
                  <p className="text-zinc-400">라이어를 찾아냈습니다.</p>
                </>
              ) : (
                <>
                  <XCircle className="w-20 h-20 text-red-500 mx-auto" />
                  <h2 className="text-4xl font-bold text-red-500">라이어 승리!</h2>
                  <p className="text-zinc-400">라이어가 승리했습니다.</p>
                </>
              )}
            </div>

            <div className="bg-zinc-800/50 p-6 rounded-2xl border border-white/10 space-y-4">
              <div className="flex justify-between items-center border-b border-white/5 pb-4">
                <span className="text-zinc-400">라이어 정체</span>
                <span className="font-bold text-xl text-red-400">{gameResult.liarName}</span>
              </div>
              <div className="flex justify-between items-center border-b border-white/5 pb-4">
                <span className="text-zinc-400">시민 제시어</span>
                <span className="font-bold text-xl text-indigo-400">{gameResult.keyword}</span>
              </div>
              {gameResult.mode === 'fool' && (
                <div className="flex justify-between items-center border-b border-white/5 pb-4">
                  <span className="text-zinc-400">라이어 제시어</span>
                  <span className="font-bold text-xl text-purple-400">{gameResult.liarKeyword}</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">지목된 사람</span>
                <span className="font-bold text-xl">{gameResult.votedOutName || '없음'}</span>
              </div>
            </div>

            {isHost && (
              <button
                onClick={playAgain}
                className="bg-white text-black hover:bg-zinc-200 font-bold py-3 px-8 rounded-xl transition-colors"
              >
                다시 하기
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
