/**
 * Camera Setup & Full-Body Exposure Guide
 * Helps the user position their camera to expose full body before combat
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Camera, CheckCircle2, AlertTriangle, ArrowRight, RefreshCw, Sparkles, Check, ArrowLeft } from 'lucide-react';
import { cameraPoseService, BodyExposureReport } from '../motion/pose/poseDetector';
import { GestureDetector } from '../motion/gestures/gestureDetector';
import { calibrationManager } from '../motion/calibration/calibrationManager';
import { sound } from '../game/audio/synthAudio';
import { Landmark, PoseFrame } from '../types/pose';
import { ActionType } from '../types/combat';

interface CameraSetupGuideProps {
  onComplete: () => void;
  onBack: () => void;
}

export const CameraSetupGuide: React.FC<CameraSetupGuideProps> = ({ onComplete, onBack }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const detectorRef = useRef<GestureDetector>(new GestureDetector());

  const [exposure, setExposure] = useState<BodyExposureReport>({
    headVisible: false,
    shouldersVisible: false,
    wristsVisible: false,
    hipsVisible: false,
    kneesVisible: false,
    feetVisible: false,
    fullBodyExposed: false,
    exposureScore: 0,
    distance: 'GOOD',
    guidanceMessage: 'Initializing camera...',
    suggestedAction: 'Please stand 1.5 - 2.5 meters back',
  });

  const [testMoves, setTestMoves] = useState({
    punch: false,
    block: false,
    dodge: false,
  });

  const [isCalibrated, setIsCalibrated] = useState<boolean>(false);
  const [activeGesture, setActiveGesture] = useState<string>('IDLE');

  const handleDetectedAction = useCallback((act: ActionType) => {
    setActiveGesture(act);
    if (act.includes('PUNCH') || act.includes('HOOK')) {
      setTestMoves((prev) => ({ ...prev, punch: true }));
      sound.playWhoosh(300);
    } else if (act === 'BLOCK') {
      setTestMoves((prev) => ({ ...prev, block: true }));
      sound.playBlockClank();
    } else if (act.includes('DODGE')) {
      setTestMoves((prev) => ({ ...prev, dodge: true }));
      sound.playDodge();
    }
  }, []);

  useEffect(() => {
    let active = true;

    async function init() {
      await cameraPoseService.initialize();
      if (!active) return;
      if (videoRef.current) {
        await cameraPoseService.startCamera(videoRef.current);
      }
    }

    init();

    let frameId: number = 0;
    const loop = () => {
      if (!active) return;

      cameraPoseService.processFrame((landmarks: Landmark[], timestamp: number) => {
        if (!active) return;

        // Draw skeleton
        if (canvasRef.current) {
          const ctx = canvasRef.current.getContext('2d');
          if (ctx) {
            cameraPoseService.drawSkeleton(ctx, canvasRef.current.width, canvasRef.current.height, landmarks);
          }
        }

        // Evaluate body exposure
        const rep = cameraPoseService.evaluateBodyExposure(landmarks);
        setExposure(rep);

        // Feed to detector
        const frame: PoseFrame | null = detectorRef.current.processRawLandmarks(landmarks, timestamp);
        if (frame) {
          calibrationManager.addSample(frame);
          const res = detectorRef.current.detect(frame, calibrationManager.getCalibration());
          if (res.action !== 'IDLE') {
            handleDetectedAction(res.action);
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
  }, [handleDetectedAction]);

  const handleConfirmCalibration = () => {
    calibrationManager.finalizeCalibration();
    setIsCalibrated(true);
    sound.playRoundBell();
    setTimeout(() => {
      onComplete();
    }, 400);
  };

  return (
    <div className="relative w-full h-full min-h-screen bg-[#060812] text-white flex flex-col p-4 sm:p-8 select-none font-sans overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-900 mb-6">
        <div className="flex items-center space-x-3">
          <button
            onClick={onBack}
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 hover:border-cyan-500/50 text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-base sm:text-xl font-black tracking-wider text-cyan-400 uppercase">
              CAMERA SETUP & FULL-BODY EXPOSURE
            </h1>
            <p className="text-xs text-slate-400 font-mono">
              Position your camera so your full body is exposed for fluid in-game strike mirroring
            </p>
          </div>
        </div>

        <button
          onClick={handleConfirmCalibration}
          className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold uppercase tracking-wider text-xs flex items-center space-x-2 transition-all cursor-pointer shadow-[0_0_15px_rgba(0,240,255,0.4)]"
        >
          <span>Skip to Dojo</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Main Setup Layout: Left Camera Preview with Full Body Silhouette, Right Diagnostic Checklist */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 items-start">
        {/* Camera Feed Column */}
        <div className="lg:col-span-7 flex flex-col items-center">
          <div className="relative w-full max-w-xl aspect-[4/3] bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 shadow-2xl">
            <video
              ref={videoRef}
              className="w-full h-full object-cover transform -scale-x-100 opacity-70"
              playsInline
              muted
            />
            <canvas
              ref={canvasRef}
              width={640}
              height={480}
              className="absolute inset-0 w-full h-full pointer-events-none"
            />

            {/* Target Silhouette Frame */}
            <div
              className={`absolute inset-6 border-2 border-dashed rounded-2xl pointer-events-none transition-colors duration-300 ${
                exposure.fullBodyExposed ? 'border-cyan-400/80 shadow-[0_0_20px_rgba(0,240,255,0.2)]' : 'border-amber-400/60'
              }`}
            >
              {/* Head Circle Guide */}
              <div className="absolute top-4 left-1/2 -translate-x-1/2 w-20 h-24 rounded-full border border-dashed border-cyan-400/40" />
              {/* Shoulder Bar Guide */}
              <div className="absolute top-28 left-1/4 right-1/4 h-0.5 border-t border-dashed border-cyan-400/40" />
              {/* Torso Center Guide */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] font-mono text-cyan-400/40 uppercase tracking-widest">
                CENTER BODY HERE
              </div>
            </div>

            {/* Top Diagnostic Banner */}
            <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none">
              <div className="bg-slate-950/85 border border-slate-800 px-3 py-1.5 rounded-xl font-mono text-xs flex items-center space-x-2">
                <Camera className="w-3.5 h-3.5 text-cyan-400" />
                <span>EXPOSURE SCORE:</span>
                <span className={`font-bold ${exposure.exposureScore >= 80 ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {exposure.exposureScore}%
                </span>
              </div>

              <div
                className={`px-3 py-1.5 rounded-xl font-mono text-xs font-bold border ${
                  exposure.distance === 'GOOD'
                    ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
                    : 'bg-amber-950/80 border-amber-500/50 text-amber-300'
                }`}
              >
                {exposure.distance === 'GOOD' ? 'DISTANCE: OPTIMAL' : `DISTANCE: ${exposure.distance}`}
              </div>
            </div>

            {/* Bottom Real-Time Guidance Prompt */}
            <div className="absolute bottom-3 left-3 right-3 bg-slate-950/90 border border-slate-800 p-3 rounded-xl font-mono text-xs flex items-center justify-between">
              <div className="flex items-center space-x-2">
                {exposure.fullBodyExposed ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                )}
                <div>
                  <div className="font-bold text-white">{exposure.guidanceMessage}</div>
                  <div className="text-[11px] text-cyan-300">{exposure.suggestedAction}</div>
                </div>
              </div>

              {activeGesture !== 'IDLE' && (
                <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800 shrink-0 uppercase">
                  {activeGesture}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right Checklist & Calibration Panel */}
        <div className="lg:col-span-5 flex flex-col space-y-4">
          {/* Full-Body Visibility Checklist */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl font-mono text-xs">
            <div className="text-cyan-400 font-bold mb-3 uppercase tracking-wider text-[11px] flex items-center justify-between">
              <span>BODY EXPOSURE CHECKLIST</span>
              <span className="text-slate-400 text-[10px]">
                {[exposure.headVisible, exposure.shouldersVisible, exposure.hipsVisible, exposure.kneesVisible, exposure.feetVisible].filter(Boolean).length}/5 PARTS
              </span>
            </div>

            <div className="space-y-2">
              {[
                { label: 'Head & Face Visibility', state: exposure.headVisible, tip: 'Keep head below top edge' },
                { label: 'Shoulders & Arms', state: exposure.shouldersVisible, tip: 'Arms must have room to swing' },
                { label: 'Torso & Hip Alignment', state: exposure.hipsVisible, tip: 'Center hips inside frame' },
                { label: 'Knees & Leg Drive', state: exposure.kneesVisible, tip: 'Ensure knees are unblocked' },
                { label: 'Feet / Ground Stance', state: exposure.feetVisible, tip: 'Tilt camera down slightly if hidden' },
              ].map((item, idx) => (
                <div
                  key={idx}
                  className={`flex items-center justify-between p-2.5 rounded-xl border transition-colors ${
                    item.state
                      ? 'bg-emerald-950/30 border-emerald-600/40 text-emerald-300'
                      : 'bg-slate-950/80 border-slate-800 text-slate-400'
                  }`}
                >
                  <div>
                    <span className="font-bold">{item.label}</span>
                    <div className="text-[10px] text-slate-500">{item.tip}</div>
                  </div>
                  <span>{item.state ? '✓ READY' : '○ EXPOSE'}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Rapid Move Rehearsal */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl font-mono text-xs">
            <div className="text-amber-400 font-bold mb-3 uppercase tracking-wider text-[11px] flex items-center space-x-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>TEST YOUR MOVEMENTS</span>
            </div>

            <p className="text-slate-400 text-[11px] mb-3">
              Perform each gesture in front of your camera to verify that your strikes directly mirror to your fighter.
            </p>

            <div className="grid grid-cols-3 gap-2 mb-4">
              <div
                className={`p-2.5 rounded-xl border text-center transition-colors ${
                  testMoves.punch
                    ? 'bg-cyan-950/40 border-cyan-500/50 text-cyan-300'
                    : 'bg-slate-950 border-slate-800 text-slate-400'
                }`}
              >
                <div className="text-[10px] text-slate-500 mb-0.5">MOVE 1</div>
                <div className="font-bold text-xs">PUNCH</div>
                <div className="text-[10px] mt-1">{testMoves.punch ? '✓ VERIFIED' : 'Extend fist'}</div>
              </div>

              <div
                className={`p-2.5 rounded-xl border text-center transition-colors ${
                  testMoves.block
                    ? 'bg-cyan-950/40 border-cyan-500/50 text-cyan-300'
                    : 'bg-slate-950 border-slate-800 text-slate-400'
                }`}
              >
                <div className="text-[10px] text-slate-500 mb-0.5">MOVE 2</div>
                <div className="font-bold text-xs">BLOCK</div>
                <div className="text-[10px] mt-1">{testMoves.block ? '✓ VERIFIED' : 'Raise guard'}</div>
              </div>

              <div
                className={`p-2.5 rounded-xl border text-center transition-colors ${
                  testMoves.dodge
                    ? 'bg-cyan-950/40 border-cyan-500/50 text-cyan-300'
                    : 'bg-slate-950 border-slate-800 text-slate-400'
                }`}
              >
                <div className="text-[10px] text-slate-500 mb-0.5">MOVE 3</div>
                <div className="font-bold text-xs">DODGE</div>
                <div className="text-[10px] mt-1">{testMoves.dodge ? '✓ VERIFIED' : 'Sway body'}</div>
              </div>
            </div>

            <button
              onClick={handleConfirmCalibration}
              className="w-full py-3.5 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold uppercase tracking-wider text-xs flex items-center justify-center space-x-2 transition-all cursor-pointer shadow-[0_0_20px_rgba(0,240,255,0.35)]"
            >
              <span>LOCK CAMERA & ENTER DOJO</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
