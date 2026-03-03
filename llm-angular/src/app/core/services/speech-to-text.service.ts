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
  onerror: ((event: Event & { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  onaudiostart: (() => void) | null;
  onaudioend: (() => void) | null;
  onsoundstart: (() => void) | null;
  onsoundend: (() => void) | null;
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
@Injectable({
  providedIn: 'root',
})
export class SpeechToTextService {
  private recognition: ISpeechRecognition | null = null;
  private readonly transcriptSubject = new Subject<SpeechTranscript>();
  private readonly listeningSubject = new BehaviorSubject<boolean>(false);
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

  /** Whether the Web Speech API is available (secure context + supported browser). */
  isSupported(): boolean {
    if (typeof window === 'undefined') return false;
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    return typeof Ctor === 'function';
  }

  /**
   * Start recognition. Optional lang (e.g. 'en-US', 'he-IL').
   * No-op if already listening or if API is not supported.
   */
  start(lang?: string): void {
    if (this.isListening) return;
    if (!this.isSupported()) return;

    this.disposeRecognition();
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (typeof Ctor !== 'function') return;
    this.recognition = new Ctor();

    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = lang ?? navigator.language ?? 'en-US';
    this.recognition.maxAlternatives = 1;

    this.recognition.onstart = () => {
      this.isListening = true;
      this.listeningSubject.next(true);
    };

    this.recognition.onend = () => {
      this.setStopped();
    };

    this.recognition.onerror = (event: Event & { error?: string }) => {
      const err = (event as { error?: string }).error;
      if (err !== 'aborted') {
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
    } catch {
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
      this.recognition.abort();
    } catch {
      // ignore
    }
    this.recognition = null;
  }
}
