/**
 * Online Multiplayer Lobby, Matchmaking Queue & Private Room Screen
 * Features:
 * - Real 6-digit room code generation (e.g. KNT-8392)
 * - Copy room code to clipboard with 1-click toast
 * - Shareable direct room link with ?room=KNT-XXXX
 * - Authentic matchmaking: NO fake auto-bot in Quick Match (player stays in waiting room until real opponent joins)
 * - Real peer connection feedback and 3-second strike countdown
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  Users,
  Wifi,
  Search,
  Shield,
  Zap,
  CheckCircle2,
  Clock,
  Swords,
  Copy,
  Check,
  Share2,
  AlertCircle,
} from 'lucide-react';
import { sound } from '../game/audio/synthAudio';
import { MatchmakingState, MultiplayerPlayer } from '../types/combat';
import { multiplayerRoomManager } from '../multiplayer/roomManager';

interface MultiplayerLobbyProps {
  onStartMatch: (opponent: MultiplayerPlayer) => void;
  onBackToTitle: () => void;
}

export const MultiplayerLobby: React.FC<MultiplayerLobbyProps> = ({ onStartMatch, onBackToTitle }) => {
  const [matchState, setMatchState] = useState<MatchmakingState>('IDLE');
  const [searchTime, setSearchTime] = useState<number>(0);
  const [matchedOpponent, setMatchedOpponent] = useState<MultiplayerPlayer | null>(null);
  const [countdown, setCountdown] = useState<number>(3);
  const [createdRoomCode, setCreatedRoomCode] = useState<string>('');
  const [enteredCode, setEnteredCode] = useState<string>('');
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'quick' | 'custom'>('custom');
  const [joinError, setJoinError] = useState<string>('');

  const timerRef = useRef<number | null>(null);

  // Check URL query parameters for ?room=KNT-XXXX direct link
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam && roomParam.startsWith('KNT-')) {
      setActiveTab('custom');
      setEnteredCode(roomParam.toUpperCase());
    }
  }, []);

  // Listen for real peer connections
  useEffect(() => {
    multiplayerRoomManager.onPeerConnected((peer: MultiplayerPlayer) => {
      setMatchedOpponent(peer);
      setMatchState('FOUND');
      sound.playRoundBell();

      let count = 3;
      setCountdown(3);
      const cdInterval = setInterval(() => {
        count -= 1;
        setCountdown(count);
        sound.playWhoosh(350);
        if (count <= 0) {
          clearInterval(cdInterval);
          onStartMatch(peer);
        }
      }, 1000);
    });

    multiplayerRoomManager.onPeerDisconnected(() => {
      setMatchedOpponent(null);
      setMatchState('IDLE');
    });

    return () => {
      multiplayerRoomManager.leaveRoom();
    };
  }, [onStartMatch]);

  // Search queue timer (NO fake match trigger! Real authentic waiting room timer)
  useEffect(() => {
    if (matchState === 'SEARCHING') {
      const startT = Date.now();
      timerRef.current = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - startT) / 1000);
        setSearchTime(elapsed);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setSearchTime(0);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [matchState]);

  // Quick match search (authentic queue)
  const handleStartQuickSearch = () => {
    sound.playRoundBell();
    setCreatedRoomCode('');
    setMatchState('SEARCHING');
    multiplayerRoomManager.enterQuickMatchQueue();
  };

  // Create real room code
  const handleCreateRoom = () => {
    sound.playRoundBell();
    const code = multiplayerRoomManager.createPrivateRoom();
    setCreatedRoomCode(code);
    setMatchState('SEARCHING');
  };

  // Join room code
  const handleJoinRoom = () => {
    const code = enteredCode.trim().toUpperCase();
    if (code.length < 4) {
      setJoinError('Please enter a valid room code (e.g. KNT-8492)');
      return;
    }
    setJoinError('');
    sound.playRoundBell();
    multiplayerRoomManager.joinPrivateRoom(code);
    setMatchState('SEARCHING');
  };

  const handleCancelSearch = () => {
    multiplayerRoomManager.leaveRoom();
    setMatchState('IDLE');
    setCreatedRoomCode('');
    setSearchTime(0);
  };

  const copyRoomCode = () => {
    if (!createdRoomCode) return;
    navigator.clipboard.writeText(createdRoomCode);
    setCopiedCode(true);
    sound.playWhoosh(400);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  const copyShareableLink = () => {
    if (!createdRoomCode) return;
    const url = `${window.location.origin}${window.location.pathname}?room=${createdRoomCode}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    sound.playWhoosh(400);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  return (
    <div className="relative w-full h-full min-h-screen bg-[#060812] text-white flex flex-col p-4 sm:p-8 select-none font-sans justify-between overflow-y-auto">
      {/* Background radial glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-cyan-500/10 rounded-full blur-[130px] pointer-events-none" />

      {/* Top Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-900 z-10">
        <div className="flex items-center space-x-3">
          <button
            onClick={() => {
              multiplayerRoomManager.leaveRoom();
              onBackToTitle();
            }}
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 hover:border-cyan-500/50 text-slate-300 hover:text-white transition-colors cursor-pointer"
            aria-label="Back to Title"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-base sm:text-xl font-black tracking-wider text-cyan-400 uppercase">
              MULTIPLAYER COMBAT LOBBY
            </h1>
            <p className="text-xs text-slate-400 font-mono">
              Fight friends via private room codes or wait for live challengers
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 text-xs font-mono px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-emerald-400">
          <Wifi className="w-3.5 h-3.5" />
          <span>NET: P2P ACTIVE</span>
        </div>
      </div>

      {/* Main Container */}
      <div className="my-auto py-8 z-10 flex flex-col items-center max-w-xl mx-auto w-full">
        {matchState === 'IDLE' && (
          <div className="w-full bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl text-center">
            <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mx-auto mb-4 text-cyan-400 shadow-[0_0_15px_rgba(0,240,255,0.3)]">
              <Swords className="w-8 h-8" />
            </div>

            <h2 className="text-xl sm:text-2xl font-black uppercase tracking-wider mb-2">
              REAL-TIME COMBAT ROOMS
            </h2>
            <p className="text-xs text-slate-400 font-mono mb-6 max-w-sm mx-auto">
              Create a custom room code to play with a friend or queue for real human opponents.
            </p>

            {/* Mode Tabs */}
            <div className="flex rounded-xl bg-slate-950 p-1 mb-6 border border-slate-800">
              <button
                onClick={() => {
                  setActiveTab('custom');
                  setJoinError('');
                }}
                className={`flex-1 py-2 text-xs font-bold uppercase rounded-lg transition-colors cursor-pointer ${
                  activeTab === 'custom' ? 'bg-cyan-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                Friend Room Code
              </button>
              <button
                onClick={() => {
                  setActiveTab('quick');
                  setJoinError('');
                }}
                className={`flex-1 py-2 text-xs font-bold uppercase rounded-lg transition-colors cursor-pointer ${
                  activeTab === 'quick' ? 'bg-cyan-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                Quick Match Queue
              </button>
            </div>

            {activeTab === 'custom' ? (
              <div className="space-y-4">
                {/* Create Room Button (Generates 6-Digit Code) */}
                <button
                  onClick={handleCreateRoom}
                  className="w-full py-4 rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-400 hover:from-cyan-400 hover:to-cyan-300 text-slate-950 font-bold uppercase tracking-wider text-xs flex items-center justify-center space-x-2 transition-all cursor-pointer shadow-[0_0_20px_rgba(0,240,255,0.35)]"
                >
                  <Swords className="w-4 h-4" />
                  <span>Create New Room & Get Room Code</span>
                </button>

                <div className="flex items-center my-4">
                  <div className="flex-1 border-t border-slate-800" />
                  <span className="px-3 text-slate-500 text-[11px] font-mono uppercase">OR JOIN FRIEND'S CODE</span>
                  <div className="flex-1 border-t border-slate-800" />
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={enteredCode}
                    onChange={(e) => {
                      setEnteredCode(e.target.value.toUpperCase());
                      setJoinError('');
                    }}
                    placeholder="e.g. KNT-8492"
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 font-mono text-center text-sm font-bold tracking-widest text-white uppercase focus:border-cyan-500 outline-none"
                  />
                  <button
                    onClick={handleJoinRoom}
                    disabled={!enteredCode.trim()}
                    className="px-6 py-3 rounded-xl bg-cyan-500 disabled:bg-slate-800 disabled:text-slate-600 text-slate-950 font-bold uppercase text-xs transition-colors cursor-pointer shadow"
                  >
                    Join Room
                  </button>
                </div>

                {joinError && (
                  <div className="flex items-center space-x-2 text-rose-400 text-xs font-mono justify-center">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>{joinError}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-left font-mono text-xs">
                  <div className="flex items-center space-x-2 text-amber-400 mb-1 font-bold">
                    <Shield className="w-4 h-4" />
                    <span>AUTHENTIC MULTIPLAYER QUEUE</span>
                  </div>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    No simulated bots. When you enter the queue, you will stay in the waiting room until another live player or second window enters the queue.
                  </p>
                </div>

                <button
                  onClick={handleStartQuickSearch}
                  className="w-full py-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold uppercase tracking-wider text-xs flex items-center justify-center space-x-2 transition-all cursor-pointer shadow-[0_0_20px_rgba(0,240,255,0.4)]"
                >
                  <Search className="w-4 h-4" />
                  <span>Enter Quick Match Queue</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* WAITING ROOM (Searching or Host Waiting for Friend with Shareable Room Code) */}
        {matchState === 'SEARCHING' && (
          <div className="w-full bg-slate-900/95 border border-cyan-500/40 rounded-2xl p-6 sm:p-8 shadow-2xl text-center relative overflow-hidden">
            {createdRoomCode ? (
              // HOST SCREEN: Prominent Room Code & Sharing Card
              <div>
                <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-cyan-500/20 text-cyan-400 text-xs font-mono font-bold mb-4 border border-cyan-500/40">
                  <Clock className="w-3.5 h-3.5 animate-spin" />
                  <span>ROOM HOST ACTIVE</span>
                </div>

                <h2 className="text-lg sm:text-xl font-black uppercase tracking-wider mb-2 text-white">
                  SHARE THIS ROOM CODE WITH YOUR FRIEND
                </h2>
                <p className="text-xs text-slate-400 font-mono mb-6">
                  Tell your friend to enter this code in the Multiplayer lobby:
                </p>

                {/* Big Shareable Code Display */}
                <div className="bg-slate-950 border-2 border-cyan-500/60 rounded-2xl p-6 mb-6 shadow-[0_0_25px_rgba(0,240,255,0.2)]">
                  <div className="text-3xl sm:text-5xl font-black font-mono tracking-widest text-cyan-400 select-all mb-4">
                    {createdRoomCode}
                  </div>

                  <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                    <button
                      onClick={copyRoomCode}
                      className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold uppercase text-xs flex items-center justify-center space-x-2 transition-colors cursor-pointer"
                    >
                      {copiedCode ? <Check className="w-4 h-4 text-emerald-950" /> : <Copy className="w-4 h-4" />}
                      <span>{copiedCode ? 'Code Copied!' : 'Copy Code'}</span>
                    </button>

                    <button
                      onClick={copyShareableLink}
                      className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold uppercase text-xs flex items-center justify-center space-x-2 transition-colors cursor-pointer"
                    >
                      {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4" />}
                      <span>{copiedLink ? 'Link Copied!' : 'Copy Direct Link'}</span>
                    </button>
                  </div>
                </div>

                {/* Waiting status */}
                <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800/80 font-mono text-xs text-slate-400 mb-6 flex items-center justify-center space-x-2">
                  <div className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                  <span>Waiting for Player 2 to join... (Elapsed: {searchTime}s)</span>
                </div>
              </div>
            ) : (
              // QUICK MATCH QUEUE / JOIN WAITING SCREEN
              <div>
                <div className="relative w-24 h-24 mx-auto mb-6 flex items-center justify-center">
                  <div className="absolute inset-0 rounded-full border-2 border-cyan-500/40 animate-ping opacity-30" />
                  <div className="absolute inset-2 rounded-full border border-cyan-400/50 animate-pulse" />
                  <div className="w-14 h-14 rounded-full bg-cyan-500/20 border border-cyan-400 flex items-center justify-center text-cyan-300">
                    <Search className="w-6 h-6" />
                  </div>
                </div>

                <h2 className="text-xl font-black uppercase tracking-wider mb-1 text-cyan-300">
                  {enteredCode ? `CONNECTING TO ROOM ${enteredCode}...` : 'WAITING FOR ONLINE OPPONENT...'}
                </h2>
                <p className="text-xs text-slate-400 font-mono mb-6">
                  {enteredCode
                    ? 'Handshaking with room host. The match will begin once connected.'
                    : 'Authentic matchmaking queue. Staying in waiting room until another player connects.'}
                </p>

                {/* Waiting telemetry */}
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-xs mb-6 grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-[10px] text-slate-500 mb-0.5">TIME IN WAITING ROOM</div>
                    <div className="text-base font-bold text-cyan-400 tabular-nums">
                      {Math.floor(searchTime / 60)}:{(searchTime % 60).toString().padStart(2, '0')}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 mb-0.5">OPPONENT TYPE</div>
                    <div className="text-base font-bold text-emerald-400">REAL HUMAN (P2P)</div>
                  </div>
                </div>
              </div>
            )}

            {/* Warm-Up Advice */}
            <div className="p-3 rounded-xl bg-cyan-950/30 border border-cyan-800/40 text-left font-mono text-xs mb-6 flex items-center space-x-3">
              <Zap className="w-5 h-5 text-amber-400 shrink-0" />
              <div>
                <div className="text-cyan-300 font-bold text-[11px]">WARM-UP WHILE WAITING</div>
                <div className="text-[10px] text-slate-400">
                  Stand in front of your camera, test your jab distance, and prepare your guard.
                </div>
              </div>
            </div>

            <button
              onClick={handleCancelSearch}
              className="py-2.5 px-6 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold uppercase tracking-wider text-xs transition-colors cursor-pointer"
            >
              Cancel & Return
            </button>
          </div>
        )}

        {/* MATCH FOUND! COUNTDOWN TO BATTLE */}
        {matchState === 'FOUND' && matchedOpponent && (
          <div className="w-full bg-slate-900 border-2 border-emerald-500/70 rounded-2xl p-6 sm:p-8 shadow-[0_0_30px_rgba(16,185,129,0.3)] text-center animate-in fade-in zoom-in-95">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-mono font-bold mb-4 border border-emerald-500/40">
              <CheckCircle2 className="w-4 h-4" />
              <span>REAL OPPONENT CONNECTED!</span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-wider mb-2">CHALLENGER ENTERED</h2>

            {/* Opponent Card */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-xs my-4 flex items-center justify-between">
              <div className="text-left">
                <div className="text-sm font-black text-rose-400">{matchedOpponent.name}</div>
                <div className="text-[10px] text-slate-400">{matchedOpponent.rank}</div>
              </div>
              <div className="text-right">
                <div className="text-emerald-400 font-bold tabular-nums">{matchedOpponent.pingMs} ms</div>
                <div className="text-[10px] text-slate-500">PEER PING</div>
              </div>
            </div>

            {/* Countdown Strike */}
            <div className="my-6">
              <div className="text-5xl font-black font-mono tracking-widest text-cyan-400 drop-shadow-[0_0_15px_#00f0ff]">
                {countdown}
              </div>
              <div className="text-xs font-mono uppercase text-slate-400 mt-1">FIGHT BEGINS IN SECONDS</div>
            </div>
          </div>
        )}
      </div>

      {/* Footer Notice */}
      <div className="text-center text-xs text-slate-500 font-mono z-10 border-t border-slate-900 pt-4">
        Zero Camera Streaming · Only kinematic strike inputs and health states are synchronized.
      </div>
    </div>
  );
};
