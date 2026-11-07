/**
 * 1v1 Combat Arena Match Screen
 * Supports Configurable Bot Difficulties (Easy / Medium / Hard) & Multiplayer Opponents
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { ArrowLeft, Volume2, VolumeX, Pause, Play, RefreshCw, Trophy, Skull, Cpu, Wifi } from 'lucide-react';
import { cameraPoseService } from '../motion/pose/poseDetector';
import { GestureDetector } from '../motion/gestures/gestureDetector';
import { KeyboardInputProvider } from '../game/input/inputProvider';
import { CombatEngine } from '../game/combat/combatEngine';
import { ArenaRenderer } from '../game/rendering/arenaScene';
import { sound } from '../game/audio/synthAudio';
import { calibrationManager } from '../motion/calibration/calibrationManager';
import { BotAI } from '../game/combat/botAI';
import { ActionType, BotDifficulty, BOT_DIFFICULTIES, MultiplayerPlayer } from '../types/combat';
import { Landmark } from '../types/pose';
import { multiplayerRoomManager } from '../multiplayer/roomManager';

interface ArenaScreenProps {
  onBackToTitle: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
  botDifficulty?: BotDifficulty;
  multiplayerOpponent?: MultiplayerPlayer | null;
}

export const ArenaScreen: React.FC<ArenaScreenProps> = ({
  onBackToTitle,
  isMuted,
  onToggleMute,
  botDifficulty = 'MEDIUM',
  multiplayerOpponent = null,
}) => {
  const threeMountRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [currentDifficulty, setCurrentDifficulty] = useState<BotDifficulty>(botDifficulty);
  const [showDifficultySelect, setShowDifficultySelect] = useState<boolean>(false);

  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isGameOver, setIsGameOver] = useState<boolean>(false);
  const [winner, setWinner] = useState<string | null>(null);

  // Fighter HUD states (throttled to avoid 60Hz React renders)
  const [playerHp, setPlayerHp] = useState<number>(100);
  const [playerStamina, setPlayerStamina] = useState<number>(100);
  const [opponentHp, setOpponentHp] = useState<number>(100);
  const [opponentStamina, setOpponentStamina] = useState<number>(100);
  const [roundTime, setRoundTime] = useState<number>(60);
  const [combo, setCombo] = useState<number>(0);
  const [lastAction, setLastAction] = useState<ActionType>('IDLE');

  // End of match stats
  const [stats, setStats] = useState({ hitsLanded: 0, damageDealt: 0, clearTime: 0 });

  const opponentName = multiplayerOpponent
    ? multiplayerOpponent.name
    : BOT_DIFFICULTIES[currentDifficulty].name;

  // Engine references
  const combatEngineRef = useRef<CombatEngine>(new CombatEngine('HERO', opponentName));
  const arenaRendererRef = useRef<ArenaRenderer | null>(null);
  const detectorRef = useRef<GestureDetector>(new GestureDetector());
  const keyboardRef = useRef<KeyboardInputProvider | null>(null);
  const botAiRef = useRef<BotAI>(new BotAI(currentDifficulty));

  // Mount 3D Scene
  useEffect(() => {
    if (!threeMountRef.current) return;
    const renderer = new ArenaRenderer(threeMountRef.current);
    arenaRendererRef.current = renderer;

    const keyboard = new KeyboardInputProvider();
    keyboardRef.current = keyboard;

    // Apply selected Bot difficulty configuration
    botAiRef.current.setDifficulty(currentDifficulty);

    // If in multiplayer mode, listen for peer's kinematic actions
    if (multiplayerOpponent) {
      multiplayerRoomManager.onPeerAction((action) => {
        combatEngineRef.current.handleInput('p2', action);
      });
    }

    let lastTime = performance.now();
    let animId: number = 0;

    const gameLoop = (currentTime: number) => {
      const dt = (currentTime - lastTime) / 1000;
      lastTime = currentTime;

      if (!isPaused) {
        // Poll keyboard fallback
        const kbEvents = keyboard.pollActionEvents();
        kbEvents.forEach((evt) => {
          handlePlayerAction(evt.action, evt.confidence);
        });

        // AI opponent behavior (only active when not facing a multiplayer human peer)
        if (!multiplayerOpponent && !combatEngineRef.current.isFinished()) {
          const p1 = combatEngineRef.current.getPlayer();
          const p2 = combatEngineRef.current.getOpponent();

          const botInput = botAiRef.current.update(dt, p2, p1);
          if (botInput) {
            combatEngineRef.current.handleInput('p2', botInput);
          }
        }

        // Advance simulation
        const res = combatEngineRef.current.update(dt);

        // Process hits
        res.hitEvents.forEach((hit) => {
          renderer.spawnHitSparks(hit.position, hit.wasBlocked);
          if (hit.wasBlocked) {
            sound.playBlockClank();
          } else {
            sound.playPunchHit(hit.damage > 12);
          }
        });

        // Update HUD readouts
        setPlayerHp(Math.round(res.player.hp));
        setPlayerStamina(Math.round(res.player.stamina));
        setOpponentHp(Math.round(res.opponent.hp));
        setOpponentStamina(Math.round(res.opponent.stamina));
        setRoundTime(Math.ceil(res.roundTimeRemaining));
        setCombo(res.player.comboCount);

        // Check Match completion
        if (res.isRoundOver && !isGameOver) {
          setIsGameOver(true);
          setWinner(res.winnerId);
          sound.playKO();
          setStats({
            hitsLanded: res.player.totalHitsLanded,
            damageDealt: res.player.totalDamageDealt,
            clearTime: Math.round(60 - res.roundTimeRemaining),
          });
        }

        renderer.render(res.player, res.opponent, dt);
      }

      animId = requestAnimationFrame(gameLoop);
    };

    animId = requestAnimationFrame(gameLoop);

    return () => {
      cancelAnimationFrame(animId);
      keyboard.dispose();
      renderer.dispose();
    };
  }, [isPaused, isGameOver, currentDifficulty]);

  const handlePlayerAction = useCallback((action: ActionType, confidence: number) => {
    if (action === 'IDLE') return;
    setLastAction(action);

    if (action.includes('PUNCH') || action.includes('HOOK')) {
      sound.playWhoosh(300);
    } else if (action === 'BLOCK') {
      sound.playBlockClank();
    } else if (action.includes('DODGE')) {
      sound.playDodge();
    } else if (action === 'KICK') {
      sound.playWhoosh(220);
    }

    const inputPayload = {
      action,
      confidence,
      source: 'camera' as const,
      timestamp: Date.now(),
    };

    combatEngineRef.current.handleInput('p1', inputPayload);

    if (multiplayerOpponent) {
      multiplayerRoomManager.sendAction(inputPayload);
    }
  }, [multiplayerOpponent]);

  // Camera feed connection
  useEffect(() => {
    let active = true;

    async function initCam() {
      await cameraPoseService.initialize();
      if (!active) return;
      if (videoRef.current) {
        await cameraPoseService.startCamera(videoRef.current);
      }
    }

    initCam();

    let frameId: number = 0;
    const loop = () => {
      if (!active) return;

      cameraPoseService.processFrame((landmarks: Landmark[], timestamp: number) => {
        if (!active || isPaused) return;

        if (canvasRef.current) {
          const ctx = canvasRef.current.getContext('2d');
          if (ctx) {
            cameraPoseService.drawSkeleton(ctx, canvasRef.current.width, canvasRef.current.height, landmarks);
          }
        }

        const frame = detectorRef.current.processRawLandmarks(landmarks, timestamp);
        if (frame) {
          const calib = calibrationManager.getCalibration();
          const result = detectorRef.current.detect(frame, calib);
          if (result.action !== 'IDLE') {
            handlePlayerAction(result.action, result.confidence);
          }
        }
      });

      frameId = requestAnimationFrame(loop);
    };

    frameId = requestAnimationFrame(loop);

    return () => {
      active = false;
      cancelAnimationFrame(frameId);
      cameraPoseService.stop();
    };
  }, [handlePlayerAction, isPaused]);

  // Restart match handler
  const handleRestart = () => {
    combatEngineRef.current.reset();
    botAiRef.current.reset();
    setIsGameOver(false);
    setWinner(null);
    setPlayerHp(100);
    setOpponentHp(100);
    setRoundTime(60);
    setCombo(0);
    sound.playRoundBell();
  };

  const handleDifficultyChange = (diff: BotDifficulty) => {
    setCurrentDifficulty(diff);
    botAiRef.current.setDifficulty(diff);
    setShowDifficultySelect(false);
    handleRestart();
  };

  return (
    <div className="relative w-full h-full min-h-screen bg-[#060812] text-white flex flex-col select-none overflow-hidden font-sans">
      {/* 3D Viewport */}
      <div ref={threeMountRef} className="absolute inset-0 w-full h-full z-0" />

      {/* Top Combat HUD: HP Bars, Round Timer, Opponent HP & Controls */}
      <header className="relative z-10 flex flex-col p-4 sm:p-6 pointer-events-none w-full">
        <div className="flex items-center justify-between w-full max-w-6xl mx-auto gap-4">
          {/* Player 1 Health & Stamina */}
          <div className="flex-1 flex flex-col items-start min-w-[120px]">
            <div className="flex items-center space-x-2 text-xs font-mono font-bold text-cyan-400 mb-1">
              <span>HERO [YOU]</span>
              <span className="text-white tabular-nums">{playerHp} HP</span>
            </div>
            {/* HP Bar */}
            <div className="w-full h-4 sm:h-5 bg-slate-900 rounded-lg overflow-hidden border border-slate-800 p-0.5">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-cyan-300 rounded transition-all duration-100"
                style={{ width: `${Math.max(0, playerHp)}%` }}
              />
            </div>
            {/* Stamina Bar */}
            <div className="w-4/5 h-1.5 sm:h-2 bg-slate-900 rounded-full overflow-hidden mt-1 border border-slate-800">
              <div
                className="h-full bg-amber-400 rounded-full transition-all duration-75"
                style={{ width: `${Math.max(0, playerStamina)}%` }}
              />
            </div>
          </div>

          {/* Center Round Timer & Pause */}
          <div className="flex flex-col items-center px-2 sm:px-4 shrink-0">
            <div className="text-2xl sm:text-4xl font-black font-mono tracking-widest text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.4)] tabular-nums">
              {roundTime}
            </div>
            <span className="text-[10px] uppercase tracking-widest text-slate-400 font-mono">ROUND 1</span>
          </div>

          {/* Opponent Health & Stamina */}
          <div className="flex-1 flex flex-col items-end min-w-[120px]">
            <div className="flex items-center space-x-2 text-xs font-mono font-bold text-rose-400 mb-1">
              <span className="text-white tabular-nums">{opponentHp} HP</span>
              <span className="truncate max-w-[140px] sm:max-w-none">{opponentName}</span>
            </div>
            {/* HP Bar */}
            <div className="w-full h-4 sm:h-5 bg-slate-900 rounded-lg overflow-hidden border border-slate-800 p-0.5">
              <div
                className="h-full bg-gradient-to-l from-rose-500 to-amber-500 rounded transition-all duration-100 ml-auto"
                style={{ width: `${Math.max(0, opponentHp)}%` }}
              />
            </div>
            {/* Stamina Bar */}
            <div className="w-4/5 h-1.5 sm:h-2 bg-slate-900 rounded-full overflow-hidden mt-1 border border-slate-800">
              <div
                className="h-full bg-amber-400 rounded-full transition-all duration-75 ml-auto"
                style={{ width: `${Math.max(0, opponentStamina)}%` }}
              />
            </div>
          </div>

          {/* Utility Buttons: Integrated into header */}
          <div className="flex items-center space-x-1.5 shrink-0 pointer-events-auto pl-2">
            {!multiplayerOpponent && (
              <button
                onClick={() => setShowDifficultySelect(true)}
                className="px-2.5 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800 hover:border-cyan-500/50 text-[11px] font-mono font-bold text-amber-400 flex items-center space-x-1 cursor-pointer"
                title="Change Bot Difficulty"
              >
                <Cpu className="w-3.5 h-3.5" />
                <span>{currentDifficulty}</span>
              </button>
            )}

            {multiplayerOpponent && (
              <div className="flex items-center space-x-1 px-2 py-1 rounded bg-slate-900/90 border border-slate-800 text-[10px] font-mono text-emerald-400">
                <Wifi className="w-3 h-3" />
                <span>{multiplayerOpponent.pingMs}ms</span>
              </div>
            )}

            <button
              onClick={() => setIsPaused(!isPaused)}
              className="p-2 rounded-lg bg-slate-900/90 border border-slate-800 hover:border-cyan-500/50 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title={isPaused ? 'Resume' : 'Pause'}
              aria-label={isPaused ? 'Resume' : 'Pause'}
            >
              {isPaused ? <Play className="w-4 h-4 text-emerald-400" /> : <Pause className="w-4 h-4 text-cyan-400" />}
            </button>

            <button
              onClick={onToggleMute}
              className="p-2 rounded-lg bg-slate-900/90 border border-slate-800 hover:border-cyan-500/50 text-slate-300 hover:text-white transition-colors cursor-pointer"
              aria-label={isMuted ? 'Unmute Audio' : 'Mute Audio'}
            >
              {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-cyan-400" />}
            </button>

            <button
              onClick={onBackToTitle}
              className="p-2 rounded-lg bg-slate-900/90 border border-slate-800 hover:border-cyan-500/50 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Quit to Menu"
              aria-label="Quit to Menu"
            >
              <ArrowLeft className="w-4 h-4 text-slate-300" />
            </button>
          </div>
        </div>

        {/* Dynamic Combo Counter (Left-Center) */}
        {combo > 1 && (
          <div className="self-start mt-4 ml-4 animate-bounce">
            <div className="text-xl sm:text-2xl font-black text-amber-400 tracking-wider drop-shadow-[0_0_12px_#ffaa00]">
              COMBO x{combo}!
            </div>
          </div>
        )}
      </header>

      {/* Floating Camera Preview PIP (Bottom Left) */}
      <div className="absolute bottom-6 left-6 z-10 w-48 h-36 bg-slate-950/90 rounded-xl overflow-hidden border border-slate-800 shadow-xl pointer-events-auto">
        <video
          ref={videoRef}
          className="w-full h-full object-cover transform -scale-x-100 opacity-60"
          playsInline
          muted
        />
        <canvas
          ref={canvasRef}
          width={192}
          height={144}
          className="absolute inset-0 w-full h-full pointer-events-none"
        />
        <div className="absolute bottom-1 left-2 right-2 flex items-center justify-between text-[9px] font-mono text-cyan-400 bg-slate-950/80 px-1.5 py-0.5 rounded">
          <span>MOTION PIP</span>
          <span>{lastAction.replace('_', ' ')}</span>
        </div>
      </div>

      {/* Victory / Defeat Modal */}
      {isGameOver && (
        <div className="absolute inset-0 z-20 bg-slate-950/85 backdrop-blur-none flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 text-center shadow-2xl">
            <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mx-auto mb-4">
              {winner === 'p1' ? (
                <Trophy className="w-8 h-8 text-amber-400 drop-shadow-[0_0_12px_#ffaa00]" />
              ) : (
                <Skull className="w-8 h-8 text-rose-500" />
              )}
            </div>

            <h2 className="text-2xl sm:text-3xl font-black tracking-wider uppercase mb-1">
              {winner === 'p1' ? 'VICTORY - KNOCKOUT!' : winner === 'p2' ? 'DEFEAT - KNOCKOUT' : 'TIME OUT - DRAW'}
            </h2>
            <p className="text-xs font-mono text-slate-400 mb-6">
              {winner === 'p1' ? 'Your strikes conquered the arena.' : 'Train your reflexes and strike back.'}
            </p>

            {/* Match Stats */}
            <div className="grid grid-cols-3 gap-2 bg-slate-950 p-3 rounded-xl border border-slate-800 font-mono text-xs mb-6">
              <div>
                <div className="text-[10px] text-slate-500">STRIKES</div>
                <div className="text-cyan-400 font-bold tabular-nums text-sm">{stats.hitsLanded}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500">DAMAGE</div>
                <div className="text-rose-400 font-bold tabular-nums text-sm">{stats.damageDealt}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500">TIME</div>
                <div className="text-white font-bold tabular-nums text-sm">{stats.clearTime}s</div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                data-start="true"
                onClick={handleRestart}
                className="flex-1 py-3 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold uppercase tracking-wider text-xs flex items-center justify-center space-x-2 transition-all cursor-pointer shadow-[0_0_15px_rgba(0,240,255,0.4)]"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Fight Again</span>
              </button>

              <button
                onClick={onBackToTitle}
                className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold uppercase tracking-wider text-xs transition-colors cursor-pointer"
              >
                Title
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Difficulty Select Modal */}
      {showDifficultySelect && (
        <div className="absolute inset-0 z-30 bg-slate-950/85 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center shadow-2xl">
            <h3 className="text-lg font-bold uppercase tracking-wider text-white mb-2">SELECT BOT DIFFICULTY</h3>
            <p className="text-xs text-slate-400 font-mono mb-4">Choose opponent speed, defense & aggression level</p>

            <div className="space-y-3 mb-6">
              {(['EASY', 'MEDIUM', 'HARD'] as BotDifficulty[]).map((diff) => {
                const cfg = BOT_DIFFICULTIES[diff];
                const active = currentDifficulty === diff;
                return (
                  <button
                    key={diff}
                    onClick={() => handleDifficultyChange(diff)}
                    className={`w-full p-3 rounded-xl border text-left font-mono transition-all cursor-pointer ${
                      active
                        ? 'bg-cyan-950/50 border-cyan-500 text-cyan-300 shadow-[0_0_15px_rgba(0,240,255,0.2)]'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between font-bold text-xs mb-1">
                      <span>{diff} - {cfg.name}</span>
                      {active && <span className="text-cyan-400 text-[10px]">CURRENT</span>}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {diff === 'EASY' && 'Slower reaction, low aggression, forgiving defense'}
                      {diff === 'MEDIUM' && 'Balanced sparring, counter-attacks, blocks heavy strikes'}
                      {diff === 'HARD' && 'Lightning reaction, combo chains, feints & defensive parries'}
                    </div>
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setShowDifficultySelect(false)}
              className="py-2.5 px-6 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold uppercase text-xs cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Pause Modal */}
      {isPaused && (
        <div className="absolute inset-0 z-20 bg-slate-950/80 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center shadow-2xl">
            <h2 className="text-xl font-bold uppercase tracking-wider mb-2">Match Paused</h2>
            <p className="text-xs text-slate-400 mb-6 font-mono">Catch your breath, fighter.</p>

            <div className="flex flex-col gap-3">
              <button
                onClick={() => setIsPaused(false)}
                className="w-full py-3 rounded-xl bg-cyan-500 text-slate-950 font-bold uppercase text-xs"
              >
                Resume Match
              </button>
              <button
                onClick={handleRestart}
                className="w-full py-3 rounded-xl bg-slate-800 text-white font-bold uppercase text-xs"
              >
                Restart Round
              </button>
              <button
                onClick={onBackToTitle}
                className="w-full py-3 rounded-xl bg-slate-800/60 text-slate-400 font-bold uppercase text-xs"
              >
                Quit to Title
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
