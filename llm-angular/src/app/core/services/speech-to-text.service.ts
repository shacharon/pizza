import { Injectable } from '@angular/core';
import { Observable, Subject, BehaviorSubject } from 'rxjs';
import { shareReplay, distinctUntilChanged } from 'rxjs/operators';

/** Emitted for each recognition result; isFinal distinguishes interim vs final. */
export interface SpeechTranscript {
  text: string;
  isFinal: boolean;
}

/**
 * Minimal typing for Web Speech API recognition.
 * The API is not in all TypeScript DOM libs; we use the standard interface shape.
 * See: https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition
 */
interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
  readonly isFinal: boolean;
}

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

interface ISpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event & { error?: string; message?: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  onaudiostart: (() => void) | null;
  onaudioend: (() => void) | null;
  onsoundstart: (() => void) | null;
  onsoundend: (() => void) | null;
  onspeechstart?: (() => void) | null;
  onspeechend: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => ISpeechRecognition;
    webkitSpeechRecognition?: new () => ISpeechRecognition;
  }
}

/**
 * Web Speech API wrapper for browser-based Speech-to-Text.
 *
 * Important:
 * - Requires HTTPS (browser security restriction for microphone access).
 * - Not fully supported in all browsers (best support: Chrome/Edge).
 * - Uses webkitSpeechRecognition fallback for compatibility.
 * - This is client-side only (no server / no cost).
 *
 * For production-grade reliability across browsers,
 * consider server-side STT (e.g., Whisper).
 */
const LOG_PREFIX = '[SpeechToText]';

function safeLog(message: string, detail?: Record<string, unknown>): void {
  try {
    if (typeof console !== 'undefined' && console.warn) {
      const payload = detail ? ` ${JSON.stringify(detail)}` : '';
      console.warn(`${LOG_PREFIX} ${message}${payload}`);
    }
  } catch {
    // no-op
  }
}

/** Android Chrome has known issues with continuous: true; use false there. */
function isAndroid(): boolean {
  if (typeof navigator === 'undefined' || !navigator.userAgent) return false;
  return /Android/i.test(navigator.userAgent);
}

@Injectable({
  providedIn: 'root',
})
export class SpeechToTextService {
  private recognition: ISpeechRecognition | null = null;
  private readonly transcriptSubject = new Subject<SpeechTranscript>();
  private readonly listeningSubject = new BehaviorSubject<boolean>(false);
  private readonly statusMessageSubject = new BehaviorSubject<string | null>(null);
  private isListening = false;

  /** Stream of transcript updates; both interim and final results are emitted. */
  readonly transcript$: Observable<SpeechTranscript> = this.transcriptSubject.asObservable().pipe(
    shareReplay({ bufferSize: 0, refCount: true })
  );

  /** Stream of listening state (true while recognition is active). */
  readonly listening$: Observable<boolean> = this.listeningSubject.asObservable().pipe(
    distinctUntilChanged(),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  /** Stream of status/error message for UI (unsupported, blocked, error code). Null when OK. */
  readonly statusMessage$: Observable<string | null> = this.statusMessageSubject.asObservable().pipe(
    distinctUntilChanged(),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  /**
   * Whether the Web Speech API is available.
   * Requires: window, secure context (HTTPS), and SpeechRecognition or webkitSpeechRecognition.
   * Returns false when any check fails so UI can hide the mic and we avoid silent no-ops.
   */
  isSupported(): boolean {
    if (typeof window === 'undefined') {
      safeLog('isSupported() false: no window');
      return false;
    }
    const win = window as Window & { isSecureContext?: boolean };
    const hasSecure = typeof win.isSecureContext === 'boolean';
    const secure = hasSecure && win.isSecureContext === true;
    const hasSpeech = typeof window.SpeechRecognition === 'function';
    const hasWebkit = typeof window.webkitSpeechRecognition === 'function';
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    const hasConstructor = typeof Ctor === 'function';
    const supported = secure && hasConstructor;
    safeLog('isSupported()', {
      result: supported,
      isSecureContext: hasSecure ? secure : 'unknown',
      hasSpeechRecognition: hasSpeech,
      hasWebkitSpeechRecognition: hasWebkit,
      constructor: hasSpeech ? 'SpeechRecognition' : hasWebkit ? 'webkitSpeechRecognition' : 'none',
    });
    return supported;
  }

  /** Clear the current status/error message (e.g. after user dismisses or retries). */
  clearStatus(): void {
    this.statusMessageSubject.next(null);
  }

  /**
   * When the API is not supported, returns a short hint for the UI (e.g. "Voice search: use Chrome on Android").
   * When supported, returns null. Use this to show a friendly fallback when the mic button is hidden.
   */
  getSupportHint(): string | null {
    if (typeof window === 'undefined') return null;
    const win = window as Window & { isSecureContext?: boolean };
    if (win.isSecureContext !== true) {
      return 'Voice search needs a secure connection (HTTPS).';
    }
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (typeof Ctor !== 'function') {
      return isAndroid()
        ? 'Voice search: use Chrome on Android.'
        : 'Voice search: use Chrome or Edge.';
    }
    return null;
  }

  private setStatusMessage(msg: string): void {
    this.statusMessageSubject.next(msg);
    safeLog('statusMessage', { message: msg });
  }

  /**
   * Start recognition. Optional lang (e.g. 'en-US', 'he-IL').
   * Must be called directly from a user gesture (e.g. button click); otherwise some browsers (e.g. Android Chrome) block mic.
   * No-op if already listening or if API is not supported.
   */
  start(lang?: string, options?: { fromUserGesture?: boolean }): void {
    const fromUserGesture = options?.fromUserGesture ?? false;
    safeLog('start() invoked', { lang, fromUserGesture, isListening: this.isListening });

    if (this.isListening) {
      safeLog('start() no-op: already listening');
      return;
    }

    if (typeof window === 'undefined') {
      safeLog('start() blocked: no window');
      this.setStatusMessage('Voice input not available');
      return;
    }

    const win = window as Window & { isSecureContext?: boolean };
    const isSecure = win.isSecureContext === true;
    if (!isSecure) {
      safeLog('start() blocked: not a secure context (HTTPS required)');
      this.setStatusMessage('Voice input needs a secure connection (HTTPS). Open in Chrome over HTTPS.');
      return;
    }

    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (typeof Ctor !== 'function') {
      safeLog('start() unsupported: no SpeechRecognition constructor');
      this.setStatusMessage(
        isAndroid()
          ? 'Voice input isn\'t supported here. Try Chrome on Android.'
          : 'Voice input isn\'t supported in this browser.'
      );
      return;
    }

    const ctorName = window.SpeechRecognition ? 'SpeechRecognition' : 'webkitSpeechRecognition';
    const android = isAndroid();
    safeLog('start() proceeding (sync from user gesture)', {
      constructor: ctorName,
      lang: lang ?? navigator.language ?? 'en-US',
      isAndroid: android,
    });

    this.statusMessageSubject.next(null);
    this.disposeRecognition();

    // Always call start synchronously from this stack so recognition.start() runs in the same user gesture.
    // On Android, deferring (e.g. after getUserMedia.then) causes not-allowed because the gesture is lost.
    this.createAndStartRecognition(Ctor, lang, android);
  }

  private createAndStartRecognition(
    Ctor: new () => ISpeechRecognition,
    lang: string | undefined,
    android: boolean
  ): void {
    if (this.isListening) return;
    this.disposeRecognition();
    this.recognition = new Ctor();

    // Android Chrome: continuous=true often fails (mic drops after 1–2s or never starts). Use false.
    this.recognition.continuous = !android;
    this.recognition.interimResults = true;
    this.recognition.lang = lang ?? navigator.language ?? 'en-US';
    this.recognition.maxAlternatives = 1;
    safeLog('recognition config', { continuous: this.recognition.continuous, android });

    this.recognition.onstart = () => {
      safeLog('event: onstart');
      this.isListening = true;
      this.listeningSubject.next(true);
    };

    this.recognition.onaudiostart = () => {
      safeLog('event: onaudiostart');
    };

    if ('onspeechstart' in this.recognition) {
      this.recognition.onspeechstart = () => {
        safeLog('event: onspeechstart');
      };
    }

    this.recognition.onspeechend = () => {
      safeLog('event: onspeechend');
    };

    this.recognition.onend = () => {
      safeLog('event: onend');
      this.setStopped();
    };

    this.recognition.onerror = (event: Event & { error?: string; message?: string }) => {
      const err = (event as { error?: string; message?: string }).error;
      const msg = (event as { error?: string; message?: string }).message;
      const code = err ?? 'unknown';
      safeLog('event: onerror', { error: code, message: msg });
      if (err !== 'aborted') {
        if (err === 'not-allowed' || err === 'service-not-allowed') {
          this.setStatusMessage('Microphone access was denied. Allow mic in browser or device settings.');
        } else if (err === 'no-speech') {
          this.setStatusMessage('No speech detected. Try again.');
        } else if (err === 'network') {
          this.setStatusMessage('Voice input needs a network connection.');
        } else if (err === 'audio-capture') {
          this.setStatusMessage('Microphone not available.');
        } else {
          this.setStatusMessage('Voice input couldn\'t start. Try again or use the keyboard.');
        }
        this.setStopped();
      }
    };

    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        const item = result[0];
        if (!item) continue;
        this.transcriptSubject.next({
          text: item.transcript,
          isFinal: result.isFinal,
        });
      }
    };

    try {
      this.recognition.start();
      safeLog('recognition.start() called');
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      safeLog('recognition.start() threw', { error: message });
      this.setStatusMessage('Voice input couldn\'t start. Try again or use the keyboard.');
      this.setStopped();
    }
  }

  /**
   * Stop recognition and fully reset: abort the instance and clear state
   * so a subsequent start() creates a fresh session.
   */
  stop(): void {
    if (!this.recognition) {
      this.setStopped();
      return;
    }
    try {
      this.recognition.abort();
    } finally {
      this.disposeRecognition();
      this.setStopped();
    }
  }

  private setStopped(): void {
    this.isListening = false;
    this.listeningSubject.next(false);
  }

  private disposeRecognition(): void {
    if (!this.recognition) return;
    try {
      this.recognition.onresult = null;
      this.recognition.onend = null;
      this.recognition.onerror = null;
      this.recognition.onstart = null;
      this.recognition.onaudiostart = null;
      if (this.recognition.onspeechstart !== undefined) this.recognition.onspeechstart = null;
      this.recognition.onspeechend = null;
      this.recognition.abort();
    } catch {
      // ignore
    }
    this.recognition = null;
  }
}
