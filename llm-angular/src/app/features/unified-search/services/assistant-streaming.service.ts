/**
 * Assistant Streaming Service
 * Handles progressive text reveal for assistant messages
 * 
 * Features:
 * - Sentence-by-sentence or word-by-word streaming
 * - Cancellable streams
 * - Configurable timing with max duration cap
 * - Always animates (does not respect prefers-reduced-motion)
 */

import { Injectable, signal, effect, isDevMode } from '@angular/core';
import { getAssistantStreamingConfig, type AssistantStreamingMode } from '../config/assistant-streaming.config';

export interface StreamingState {
  fullText: string;
  visibleText: string;
  isStreaming: boolean;
  isComplete: boolean;
  streamId: number;
}

interface ActiveStream {
  streamId: number;
  cancel: () => void;
}

@Injectable()
export class AssistantStreamingService {
  private streamIdCounter: number = 0;
  private activeStreams: Set<number> = new Set();
  private readonly DEBUG = isDevMode();

  constructor() {
    if (this.DEBUG) {
      console.log('[AssistantStreaming] Service initialized');
    }
  }

  /**
   * Start streaming text progressively based on configuration
   * Returns a signal that updates as text is revealed
   * 
   * @param fullText - Complete text to stream
   * @returns Signal with streaming state and cancel function
   */
  startStreaming(fullText: string): {
    state: ReturnType<typeof signal<StreamingState>>;
    cancel: () => void;
  } {
    const config = getAssistantStreamingConfig();
    const streamId = this.streamIdCounter++;
    
    const state = signal<StreamingState>({
      fullText,
      visibleText: '',
      isStreaming: true,
      isComplete: false,
      streamId
    });

    // Register stream as active
    this.activeStreams.add(streamId);

    // Use configured mode directly (no reduced motion override)
    const effectiveMode: AssistantStreamingMode = config.mode;

    // Debug logging
    if (this.DEBUG) {
      const tokenCount = this.countTokens(fullText);
      const estimatedDuration = effectiveMode === 'sentence' 
        ? this.splitIntoSentences(fullText).length * config.pauseAfterSentenceMs
        : this.splitIntoWords(fullText).length * config.msPerWord;
      
      console.log('[AssistantStreaming] Stream started', {
        streamId,
        mode: effectiveMode,
        tokenCount,
        estimatedDuration: Math.min(estimatedDuration, config.maxDurationMs),
        textPreview: fullText.substring(0, 50) + (fullText.length > 50 ? '...' : '')
      });
    }

    // Instant mode: show everything immediately
    if (effectiveMode === 'instant' || !fullText.trim()) {
      state.set({
        fullText,
        visibleText: fullText,
        isStreaming: false,
        isComplete: true,
        streamId
      });
      this.activeStreams.delete(streamId);
      
      if (this.DEBUG) {
        console.log('[AssistantStreaming] Stream completed instantly', { streamId });
      }
      
      return {
        state,
        cancel: () => {}
      };
    }

    let cancelled = false;
    const cancel = () => {
      if (!cancelled) {
        cancelled = true;
        this.activeStreams.delete(streamId);
        
        if (this.DEBUG) {
          console.log('[AssistantStreaming] Stream cancelled', { streamId });
        }
      }
    };

    // Start streaming based on mode
    if (effectiveMode === 'sentence') {
      this.streamBySentence(fullText, state, streamId, () => cancelled, config);
    } else if (effectiveMode === 'word') {
      this.streamByWord(fullText, state, streamId, () => cancelled, config);
    }

    return { state, cancel };
  }

  /**
   * Cancel all active streams
   */
  cancelAllStreams(): void {
    const count = this.activeStreams.size;
    this.activeStreams.clear();
    
    if (this.DEBUG && count > 0) {
      console.log('[AssistantStreaming] All streams cancelled', { count });
    }
  }

  /**
   * Reveal full text immediately (for click-to-reveal)
   */
  revealFull(state: ReturnType<typeof signal<StreamingState>>): void {
    const current = state();
    if (!current.isComplete) {
      this.activeStreams.delete(current.streamId);
      
      state.set({
        ...current,
        visibleText: current.fullText,
        isStreaming: false,
        isComplete: true
      });
      
      if (this.DEBUG) {
        console.log('[AssistantStreaming] Stream revealed fully', { streamId: current.streamId });
      }
    }
  }

  /**
   * Count approximate tokens (words) in text
   */
  private countTokens(text: string): number {
    return text.split(/\s+/).filter(w => w.length > 0).length;
  }

  /**
   * Stream text sentence by sentence
   */
  private async streamBySentence(
    fullText: string,
    state: ReturnType<typeof signal<StreamingState>>,
    streamId: number,
    isCancelled: () => boolean,
    config: ReturnType<typeof getAssistantStreamingConfig>
  ): Promise<void> {
    const sentences = this.splitIntoSentences(fullText);
    const totalSentences = sentences.length;
    
    // Calculate timing to respect maxDurationMs
    const estimatedDuration = totalSentences * config.pauseAfterSentenceMs;
    const pauseMs = estimatedDuration > config.maxDurationMs
      ? Math.floor(config.maxDurationMs / totalSentences)
      : config.pauseAfterSentenceMs;

    let visibleText = '';

    for (let i = 0; i < sentences.length; i++) {
      // Check if cancelled or stream no longer active
      if (isCancelled() || !this.activeStreams.has(streamId)) {
        if (this.DEBUG) {
          console.log('[AssistantStreaming] Sentence stream stopped', { 
            streamId, 
            progress: `${i}/${totalSentences}` 
          });
        }
        return;
      }

      visibleText += sentences[i];
      
      const isComplete = i === sentences.length - 1;
      state.set({
        fullText,
        visibleText,
        isStreaming: !isComplete,
        isComplete,
        streamId
      });

      // Complete stream if this was the last sentence
      if (isComplete) {
        this.activeStreams.delete(streamId);
        if (this.DEBUG) {
          console.log('[AssistantStreaming] Sentence stream completed', { streamId });
        }
      }

      // Pause after sentence (except for last one)
      if (i < sentences.length - 1) {
        await this.sleep(pauseMs);
      }
    }
  }

  /**
   * Stream text word by word
   */
  private async streamByWord(
    fullText: string,
    state: ReturnType<typeof signal<StreamingState>>,
    streamId: number,
    isCancelled: () => boolean,
    config: ReturnType<typeof getAssistantStreamingConfig>
  ): Promise<void> {
    const words = this.splitIntoWords(fullText);
    const totalWords = words.length;
    
    // Calculate timing to respect maxDurationMs
    const estimatedDuration = totalWords * config.msPerWord;
    const delayMs = estimatedDuration > config.maxDurationMs
      ? Math.floor(config.maxDurationMs / totalWords)
      : config.msPerWord;

    let visibleText = '';

    for (let i = 0; i < words.length; i++) {
      // Check if cancelled or stream no longer active
      if (isCancelled() || !this.activeStreams.has(streamId)) {
        if (this.DEBUG) {
          console.log('[AssistantStreaming] Word stream stopped', { 
            streamId, 
            progress: `${i}/${totalWords}` 
          });
        }
        return;
      }

      visibleText += words[i];
      
      const isComplete = i === words.length - 1;
      state.set({
        fullText,
        visibleText,
        isStreaming: !isComplete,
        isComplete,
        streamId
      });

      // Complete stream if this was the last word
      if (isComplete) {
        this.activeStreams.delete(streamId);
        if (this.DEBUG) {
          console.log('[AssistantStreaming] Word stream completed', { streamId });
        }
      }

      // Delay before next word (except for last one)
      if (i < words.length - 1) {
        await this.sleep(delayMs);
      }
    }
  }

  /**
   * Split text into sentences
   * V1: English-only sentence detection
   */
  private splitIntoSentences(text: string): string[] {
    // Split on sentence boundaries: . ! ? followed by space or end of string
    // Keep the punctuation with the sentence
    const sentences: string[] = [];
    const regex = /[^.!?]+[.!?]+(\s+|$)/g;
    let match;
    let lastIndex = 0;

    while ((match = regex.exec(text)) !== null) {
      sentences.push(match[0]);
      lastIndex = regex.lastIndex;
    }

    // Handle remaining text without terminal punctuation
    if (lastIndex < text.length) {
      sentences.push(text.substring(lastIndex));
    }

    return sentences.filter(s => s.trim().length > 0);
  }

  /**
   * Split text into words (preserving spaces)
   * V1: English-only word detection
   */
  private splitIntoWords(text: string): string[] {
    const words: string[] = [];
    const regex = /\S+\s*/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      words.push(match[0]);
    }

    return words;
  }

  /**
   * Sleep utility for async delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
