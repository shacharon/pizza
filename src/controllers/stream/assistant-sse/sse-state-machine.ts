/**
 * SSE State Machine
 * Defines states and transitions for Assistant SSE flow
 * 
 * Flow:
 * - CLARIFY/STOPPED: START → META → MESSAGE → DONE
 * - SEARCH: START → META → NARRATION → WAITING → SUMMARY → DONE
 * - ERROR: Any state → ERROR
 */

/**
 * SSE flow states
 */
export enum SseState {
  START = 'START',
  META_SENT = 'META_SENT',
  MESSAGE_SENT = 'MESSAGE_SENT',      // For CLARIFY/STOPPED flow
  NARRATION_SENT = 'NARRATION_SENT',  // For SEARCH flow
  WAITING = 'WAITING',                // For SEARCH flow (polling)
  SUMMARY_SENT = 'SUMMARY_SENT',      // For SEARCH flow
  DONE = 'DONE',
  ERROR = 'ERROR'
}

/**
 * SSE flow types (decision branches)
 */
export type SseFlowType = 'CLARIFY_STOPPED' | 'SEARCH';

/**
 * State transition result
 */
export interface StateTransition {
  from: SseState;
  to: SseState;
  flowType: SseFlowType;
  isTerminal: boolean;
}

/**
 * State machine for SSE flow
 * Validates transitions and tracks current state
 */
export class SseStateMachine {
  private currentState: SseState = SseState.START;
  private readonly flowType: SseFlowType;

  constructor(flowType: SseFlowType) {
    this.flowType = flowType;
  }

  /**
   * Get current state
   */
  getState(): SseState {
    return this.currentState;
  }

  /**
   * Get flow type
   */
  getFlowType(): SseFlowType {
    return this.flowType;
  }

  /**
   * Transition to next state
   * Throws if transition is invalid
   */
  transition(to: SseState): StateTransition {
    const from = this.currentState;

    if (!this.isValidTransition(from, to)) {
      throw new Error(
        `Invalid SSE state transition: ${from} → ${to} (flow: ${this.flowType})`
      );
    }

    this.currentState = to;

    return {
      from,
      to,
      flowType: this.flowType,
      isTerminal: this.isTerminalState(to)
    };
  }

  /**
   * Check if transition is valid
   */
  private isValidTransition(from: SseState, to: SseState): boolean {
    // Terminal states cannot transition to anything
    if (this.isTerminalState(from)) {
      return false;
    }

    // ERROR can be reached from any non-terminal state
    if (to === SseState.ERROR) {
      return true;
    }

    // DONE can be reached from certain states only
    if (to === SseState.DONE) {
      return from === SseState.MESSAGE_SENT || 
             from === SseState.SUMMARY_SENT ||
             from === SseState.WAITING; // Timeout case
    }

    // Define valid transitions by flow type
    if (this.flowType === 'CLARIFY_STOPPED') {
      const validTransitions: Record<SseState, SseState[]> = {
        [SseState.START]: [SseState.META_SENT],
        [SseState.META_SENT]: [SseState.MESSAGE_SENT],
        [SseState.MESSAGE_SENT]: [SseState.DONE],
        [SseState.NARRATION_SENT]: [],
        [SseState.WAITING]: [],
        [SseState.SUMMARY_SENT]: [],
        [SseState.DONE]: [],
        [SseState.ERROR]: []
      };
      return validTransitions[from]?.includes(to) ?? false;
    }

    if (this.flowType === 'SEARCH') {
      const validTransitions: Record<SseState, SseState[]> = {
        [SseState.START]: [SseState.META_SENT],
        [SseState.META_SENT]: [SseState.NARRATION_SENT],
        [SseState.NARRATION_SENT]: [SseState.WAITING],
        [SseState.WAITING]: [SseState.SUMMARY_SENT, SseState.DONE], // DONE for timeout
        [SseState.SUMMARY_SENT]: [SseState.DONE],
        [SseState.MESSAGE_SENT]: [],
        [SseState.DONE]: [],
        [SseState.ERROR]: []
      };
      return validTransitions[from]?.includes(to) ?? false;
    }

    return false;
  }

  /**
   * Check if state is terminal
   */
  private isTerminalState(state: SseState): boolean {
    return state === SseState.DONE || state === SseState.ERROR;
  }

  /**
   * Check if current state is terminal
   */
  isTerminal(): boolean {
    return this.isTerminalState(this.currentState);
  }
}
