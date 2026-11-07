/**
 * MediaPipe Pose Landmarker Wrapper & Local Video Processor
 * Privacy guarantee: Video stream is strictly processed in local memory.
 */

import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { Landmark, POSE_LANDMARKS } from '../../types/pose';

// MediaPipe standard skeletal connection pairs
export const POSE_CONNECTIONS: [number, number][] = [
  // Face
  [POSE_LANDMARKS.LEFT_EYE, POSE_LANDMARKS.NOSE],
  [POSE_LANDMARKS.RIGHT_EYE, POSE_LANDMARKS.NOSE],
  [POSE_LANDMARKS.LEFT_EYE, POSE_LANDMARKS.LEFT_EAR],
  [POSE_LANDMARKS.RIGHT_EYE, POSE_LANDMARKS.RIGHT_EAR],
  [POSE_LANDMARKS.MOUTH_LEFT, POSE_LANDMARKS.MOUTH_RIGHT],
  // Upper body
  [POSE_LANDMARKS.LEFT_SHOULDER, POSE_LANDMARKS.RIGHT_SHOULDER],
  [POSE_LANDMARKS.LEFT_SHOULDER, POSE_LANDMARKS.LEFT_ELBOW],
  [POSE_LANDMARKS.LEFT_ELBOW, POSE_LANDMARKS.LEFT_WRIST],
  [POSE_LANDMARKS.RIGHT_SHOULDER, POSE_LANDMARKS.RIGHT_ELBOW],
  [POSE_LANDMARKS.RIGHT_ELBOW, POSE_LANDMARKS.RIGHT_WRIST],
  // Hands
  [POSE_LANDMARKS.LEFT_WRIST, POSE_LANDMARKS.LEFT_PINKY],
  [POSE_LANDMARKS.LEFT_WRIST, POSE_LANDMARKS.LEFT_INDEX],
  [POSE_LANDMARKS.LEFT_WRIST, POSE_LANDMARKS.LEFT_THUMB],
  [POSE_LANDMARKS.RIGHT_WRIST, POSE_LANDMARKS.RIGHT_PINKY],
  [POSE_LANDMARKS.RIGHT_WRIST, POSE_LANDMARKS.RIGHT_INDEX],
  [POSE_LANDMARKS.RIGHT_WRIST, POSE_LANDMARKS.RIGHT_THUMB],
  // Torso
  [POSE_LANDMARKS.LEFT_SHOULDER, POSE_LANDMARKS.LEFT_HIP],
  [POSE_LANDMARKS.RIGHT_SHOULDER, POSE_LANDMARKS.RIGHT_HIP],
  [POSE_LANDMARKS.LEFT_HIP, POSE_LANDMARKS.RIGHT_HIP],
  // Legs
  [POSE_LANDMARKS.LEFT_HIP, POSE_LANDMARKS.LEFT_KNEE],
  [POSE_LANDMARKS.LEFT_KNEE, POSE_LANDMARKS.LEFT_ANKLE],
  [POSE_LANDMARKS.LEFT_ANKLE, POSE_LANDMARKS.LEFT_HEEL],
  [POSE_LANDMARKS.LEFT_HEEL, POSE_LANDMARKS.LEFT_FOOT_INDEX],
  [POSE_LANDMARKS.RIGHT_HIP, POSE_LANDMARKS.RIGHT_KNEE],
  [POSE_LANDMARKS.RIGHT_KNEE, POSE_LANDMARKS.RIGHT_ANKLE],
  [POSE_LANDMARKS.RIGHT_ANKLE, POSE_LANDMARKS.RIGHT_HEEL],
];

export interface BodyExposureReport {
  headVisible: boolean;
  shouldersVisible: boolean;
  wristsVisible: boolean;
  hipsVisible: boolean;
  kneesVisible: boolean;
  feetVisible: boolean;
  fullBodyExposed: boolean;
  exposureScore: number; // 0 - 100
  distance: 'TOO_CLOSE' | 'TOO_FAR' | 'GOOD';
  guidanceMessage: string;
  suggestedAction: string;
}

export class CameraPoseService {
  private landmarker: PoseLandmarker | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private isInitializing: boolean = false;
  private isRunning: boolean = false;
  private lastVideoTime: number = -1;
  private animationFrameId: number = 0;

  // Performance telemetry
  private fps: number = 0;
  private latencyMs: number = 0;
  private frameCount: number = 0;
  private lastFpsTimestamp: number = 0;

  // Simulation mode fallback (e.g. headless tests or camera permission denied)
  private isSimulated: boolean = false;
  private simTime: number = 0;

  public async initialize(): Promise<void> {
    if (this.landmarker || this.isInitializing) return;
    this.isInitializing = true;

    try {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      );

      this.landmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
    } catch (err) {
      console.warn('MediaPipe initialization fallback to simulation mode:', err);
      this.isSimulated = true;
    } finally {
      this.isInitializing = false;
    }
  }

  public async startCamera(videoEl: HTMLVideoElement): Promise<boolean> {
    this.videoElement = videoEl;

    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        this.stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: 'user',
          },
          audio: false,
        });

        videoEl.srcObject = this.stream;
        await new Promise<void>((resolve) => {
          videoEl.onloadedmetadata = () => {
            videoEl.play().catch(() => {});
            resolve();
          };
        });
        this.isRunning = true;
        return true;
      } else {
        throw new Error('getUserMedia not supported in this browser environment');
      }
    } catch (err) {
      console.warn('Camera access error. Enabling synthetic motion mode:', err);
      this.isSimulated = true;
      this.isRunning = true;
      return false;
    }
  }

  public stop(): void {
    this.isRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }
  }

  public processFrame(onLandmarks: (landmarks: Landmark[], timestamp: number) => void): void {
    if (!this.isRunning) return;

    const startT = performance.now();
    const now = Date.now();

    // FPS calculation
    this.frameCount++;
    if (now - this.lastFpsTimestamp >= 1000) {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.lastFpsTimestamp = now;
    }

    if (this.isSimulated || !this.landmarker || !this.videoElement) {
      // Generate synthetic idle/breathing motion with testability
      this.simTime += 0.033;
      const simLandmarks = this.generateSyntheticPose(this.simTime);
      this.latencyMs = Math.round(performance.now() - startT);
      onLandmarks(simLandmarks, now);
      return;
    }

    // Video processing
    if (
      this.videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      this.videoElement.currentTime !== this.lastVideoTime
    ) {
      this.lastVideoTime = this.videoElement.currentTime;

      try {
        const result = this.landmarker.detectForVideo(this.videoElement, now);
        this.latencyMs = Math.round(performance.now() - startT);

        if (result && result.landmarks && result.landmarks.length > 0) {
          const lms: Landmark[] = result.landmarks[0].map((pt) => ({
            x: pt.x,
            y: pt.y,
            z: pt.z,
            visibility: pt.visibility ?? 1,
          }));
          onLandmarks(lms, now);
        }
      } catch {
        // Ignored transient frame drop
      }
    }
  }

  public getTelemetry(): { fps: number; latencyMs: number; isSimulated: boolean } {
    return {
      fps: this.fps,
      latencyMs: this.latencyMs,
      isSimulated: this.isSimulated,
    };
  }

  /**
   * Generates a realistic synthetic humanoid pose for headless environments or manual testing
   */
  public generateSyntheticPose(time: number, overrideAction?: string): Landmark[] {
    const lms: Landmark[] = new Array(33).fill(null).map(() => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.98 }));
    const breath = Math.sin(time * 2) * 0.015;

    // Head
    lms[POSE_LANDMARKS.NOSE] = { x: 0.5, y: 0.22 + breath, z: 0, visibility: 0.99 };
    lms[POSE_LANDMARKS.LEFT_EYE] = { x: 0.48, y: 0.2 + breath, z: -0.02, visibility: 0.99 };
    lms[POSE_LANDMARKS.RIGHT_EYE] = { x: 0.52, y: 0.2 + breath, z: -0.02, visibility: 0.99 };

    // Shoulders
    lms[POSE_LANDMARKS.LEFT_SHOULDER] = { x: 0.41, y: 0.35 + breath, z: 0, visibility: 0.99 };
    lms[POSE_LANDMARKS.RIGHT_SHOULDER] = { x: 0.59, y: 0.35 + breath, z: 0, visibility: 0.99 };

    // Hips
    lms[POSE_LANDMARKS.LEFT_HIP] = { x: 0.43, y: 0.6, z: 0, visibility: 0.99 };
    lms[POSE_LANDMARKS.RIGHT_HIP] = { x: 0.57, y: 0.6, z: 0, visibility: 0.99 };

    // Default guard/ready hands
    let lw = { x: 0.44, y: 0.45, z: -0.1 };
    let rw = { x: 0.56, y: 0.45, z: -0.1 };
    let le = { x: 0.38, y: 0.48, z: 0 };
    let re = { x: 0.62, y: 0.48, z: 0 };

    if (overrideAction === 'LEFT_PUNCH') {
      lw = { x: 0.35, y: 0.35, z: -0.45 };
      le = { x: 0.38, y: 0.35, z: -0.2 };
    } else if (overrideAction === 'RIGHT_PUNCH') {
      rw = { x: 0.65, y: 0.35, z: -0.45 };
      re = { x: 0.62, y: 0.35, z: -0.2 };
    } else if (overrideAction === 'BLOCK') {
      lw = { x: 0.48, y: 0.26, z: -0.2 };
      rw = { x: 0.52, y: 0.26, z: -0.2 };
      le = { x: 0.44, y: 0.36, z: -0.1 };
      re = { x: 0.56, y: 0.36, z: -0.1 };
    }

    lms[POSE_LANDMARKS.LEFT_ELBOW] = { ...le, visibility: 0.99 };
    lms[POSE_LANDMARKS.RIGHT_ELBOW] = { ...re, visibility: 0.99 };
    lms[POSE_LANDMARKS.LEFT_WRIST] = { ...lw, visibility: 0.99 };
    lms[POSE_LANDMARKS.RIGHT_WRIST] = { ...rw, visibility: 0.99 };

    // Knees and feet
    lms[POSE_LANDMARKS.LEFT_KNEE] = { x: 0.43, y: 0.78, z: 0, visibility: 0.99 };
    lms[POSE_LANDMARKS.RIGHT_KNEE] = { x: 0.57, y: 0.78, z: 0, visibility: 0.99 };
    lms[POSE_LANDMARKS.LEFT_ANKLE] = { x: 0.42, y: 0.95, z: 0, visibility: 0.99 };
    lms[POSE_LANDMARKS.RIGHT_ANKLE] = { x: 0.58, y: 0.95, z: 0, visibility: 0.99 };

    return lms;
  }

  /**
   * Evaluates how well the player's full body is exposed to the camera
   */
  public evaluateBodyExposure(landmarks: Landmark[]): BodyExposureReport {
    if (!landmarks || landmarks.length < 33) {
      return {
        headVisible: false,
        shouldersVisible: false,
        wristsVisible: false,
        hipsVisible: false,
        kneesVisible: false,
        feetVisible: false,
        fullBodyExposed: false,
        exposureScore: 0,
        distance: 'TOO_FAR',
        guidanceMessage: 'No player detected in camera view',
        suggestedAction: 'Step into the camera view with good lighting',
      };
    }

    const nose = landmarks[POSE_LANDMARKS.NOSE];
    const leftShoulder = landmarks[POSE_LANDMARKS.LEFT_SHOULDER];
    const rightShoulder = landmarks[POSE_LANDMARKS.RIGHT_SHOULDER];
    const leftWrist = landmarks[POSE_LANDMARKS.LEFT_WRIST];
    const rightWrist = landmarks[POSE_LANDMARKS.RIGHT_WRIST];
    const leftHip = landmarks[POSE_LANDMARKS.LEFT_HIP];
    const rightHip = landmarks[POSE_LANDMARKS.RIGHT_HIP];
    const leftKnee = landmarks[POSE_LANDMARKS.LEFT_KNEE];
    const rightKnee = landmarks[POSE_LANDMARKS.RIGHT_KNEE];
    const leftAnkle = landmarks[POSE_LANDMARKS.LEFT_ANKLE];
    const rightAnkle = landmarks[POSE_LANDMARKS.RIGHT_ANKLE];

    const isVis = (lm?: Landmark): boolean => Boolean(lm && ((lm.visibility ?? 1) > 0.45));

    const headVisible = isVis(nose);
    const shouldersVisible = isVis(leftShoulder) && isVis(rightShoulder);
    const wristsVisible = isVis(leftWrist) || isVis(rightWrist);
    const hipsVisible = isVis(leftHip) && isVis(rightHip);
    const kneesVisible = isVis(leftKnee) || isVis(rightKnee);
    const feetVisible = isVis(leftAnkle) || isVis(rightAnkle);

    let partsCount = 0;
    if (headVisible) partsCount += 20;
    if (shouldersVisible) partsCount += 20;
    if (wristsVisible) partsCount += 15;
    if (hipsVisible) partsCount += 20;
    if (kneesVisible) partsCount += 15;
    if (feetVisible) partsCount += 10;

    // Check distance based on shoulder width & vertical extent
    const shoulderWidth = Math.abs(leftShoulder.x - rightShoulder.x);
    let distance: 'TOO_CLOSE' | 'TOO_FAR' | 'GOOD' = 'GOOD';
    let guidanceMessage = 'Full body detected! Ready to fight.';
    let suggestedAction = 'Hold neutral stance to begin';

    if (shoulderWidth > 0.42 || (nose.y < 0.1 && (!hipsVisible || !kneesVisible))) {
      distance = 'TOO_CLOSE';
      guidanceMessage = 'You are too close to the camera';
      suggestedAction = 'Step back 2-3 steps so your feet and hips are visible';
    } else if (shoulderWidth < 0.12) {
      distance = 'TOO_FAR';
      guidanceMessage = 'You are too far from the camera';
      suggestedAction = 'Step slightly forward for better strike accuracy';
    } else if (!feetVisible && !kneesVisible) {
      distance = 'TOO_CLOSE';
      guidanceMessage = 'Lower body not visible';
      suggestedAction = 'Tilt camera down slightly or step back';
    } else if (!headVisible) {
      guidanceMessage = 'Head/face out of frame';
      suggestedAction = 'Adjust camera up slightly';
    }

    const fullBodyExposed = headVisible && shouldersVisible && hipsVisible && (kneesVisible || feetVisible);

    return {
      headVisible,
      shouldersVisible,
      wristsVisible,
      hipsVisible,
      kneesVisible,
      feetVisible,
      fullBodyExposed,
      exposureScore: Math.min(100, partsCount),
      distance,
      guidanceMessage,
      suggestedAction,
    };
  }

  /**
   * Render neon cyber skeleton overlay on 2D canvas
   */
  public drawSkeleton(ctx: CanvasRenderingContext2D, width: number, height: number, landmarks: Landmark[]): void {
    ctx.clearRect(0, 0, width, height);

    // Draw connection lines
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#00F0FF';
    ctx.shadowColor = '#00F0FF';
    ctx.shadowBlur = 8;

    for (const [fromIdx, toIdx] of POSE_CONNECTIONS) {
      const from = landmarks[fromIdx];
      const to = landmarks[toIdx];
      if (!from || !to) continue;
      if ((from.visibility ?? 1) < 0.4 || (to.visibility ?? 1) < 0.4) continue;

      ctx.beginPath();
      // Mirror horizontally for natural webcam experience
      ctx.moveTo((1 - from.x) * width, from.y * height);
      ctx.lineTo((1 - to.x) * width, to.y * height);
      ctx.stroke();
    }

    // Draw joint nodes
    for (let i = 0; i < landmarks.length; i++) {
      const lm = landmarks[i];
      if (!lm || (lm.visibility ?? 1) < 0.4) continue;

      const px = (1 - lm.x) * width;
      const py = lm.y * height;

      // Color coding: fists & head get bright magenta accents, joints get cyan
      const isFist = i === POSE_LANDMARKS.LEFT_WRIST || i === POSE_LANDMARKS.RIGHT_WRIST;
      const isHead = i === POSE_LANDMARKS.NOSE;

      ctx.beginPath();
      ctx.arc(px, py, isFist ? 6 : isHead ? 7 : 4, 0, 2 * Math.PI);
      ctx.fillStyle = isFist ? '#FF0055' : isHead ? '#FFE600' : '#00F0FF';
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 10;
      ctx.fill();
    }

    ctx.shadowBlur = 0;
  }
}

export const cameraPoseService = new CameraPoseService();
