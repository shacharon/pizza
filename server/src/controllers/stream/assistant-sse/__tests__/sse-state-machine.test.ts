/**
 * Unit tests for sse-state-machine
 * Tests state transitions and validates no illegal transitions are allowed
 */

import { describe, it, expect } from 'vitest';
import { SseStateMachine, SseState } from '../sse-state-machine.js';

describe('SseStateMachine', () => {
  describe('CLARIFY_STOPPED flow', () => {
    it('should follow valid transition path: START → META → MESSAGE → DONE', () => {
      const machine = new SseStateMachine('CLARIFY_STOPPED');

      expect(machine.getState()).toBe(SseState.START);
      expect(machine.getFlowType()).toBe('CLARIFY_STOPPED');

      // START → META_SENT
      let transition = machine.transition(SseState.META_SENT);
      expect(transition.from).toBe(SseState.START);
      expect(transition.to).toBe(SseState.META_SENT);
      expect(transition.isTerminal).toBe(false);

      // META_SENT → MESSAGE_SENT
      transition = machine.transition(SseState.MESSAGE_SENT);
      expect(transition.from).toBe(SseState.META_SENT);
      expect(transition.to).toBe(SseState.MESSAGE_SENT);
      expect(transition.isTerminal).toBe(false);

      // MESSAGE_SENT → DONE
      transition = machine.transition(SseState.DONE);
      expect(transition.from).toBe(SseState.MESSAGE_SENT);
      expect(transition.to).toBe(SseState.DONE);
      expect(transition.isTerminal).toBe(true);
      expect(machine.isTerminal()).toBe(true);
    });

    it('should reject invalid transition: START → NARRATION_SENT', () => {
      const machine = new SseStateMachine('CLARIFY_STOPPED');

      expect(() => machine.transition(SseState.NARRATION_SENT)).toThrow(
        /Invalid SSE state transition.*CLARIFY_STOPPED/
      );
    });

    it('should reject invalid transition: META_SENT → WAITING', () => {
      const machine = new SseStateMachine('CLARIFY_STOPPED');
      machine.transition(SseState.META_SENT);

      expect(() => machine.transition(SseState.WAITING)).toThrow(/Invalid SSE state transition/);
    });

    it('should reject invalid transition: MESSAGE_SENT → SUMMARY_SENT', () => {
      const machine = new SseStateMachine('CLARIFY_STOPPED');
      machine.transition(SseState.META_SENT);
      machine.transition(SseState.MESSAGE_SENT);

      expect(() => machine.transition(SseState.SUMMARY_SENT)).toThrow(/Invalid SSE state transition/);
    });
  });

  describe('SEARCH flow', () => {
    it('should follow valid transition path: START → META → NARRATION → WAITING → SUMMARY → DONE', () => {
      const machine = new SseStateMachine('SEARCH');

      expect(machine.getState()).toBe(SseState.START);
      expect(machine.getFlowType()).toBe('SEARCH');

      // START → META_SENT
      machine.transition(SseState.META_SENT);
      expect(machine.getState()).toBe(SseState.META_SENT);

      // META_SENT → NARRATION_SENT
      machine.transition(SseState.NARRATION_SENT);
      expect(machine.getState()).toBe(SseState.NARRATION_SENT);

      // NARRATION_SENT → WAITING
      machine.transition(SseState.WAITING);
      expect(machine.getState()).toBe(SseState.WAITING);

      // WAITING → SUMMARY_SENT
      machine.transition(SseState.SUMMARY_SENT);
      expect(machine.getState()).toBe(SseState.SUMMARY_SENT);

      // SUMMARY_SENT → DONE
      machine.transition(SseState.DONE);
      expect(machine.getState()).toBe(SseState.DONE);
      expect(machine.isTerminal()).toBe(true);
    });

    it('should allow timeout path: START → META → NARRATION → WAITING → DONE', () => {
      const machine = new SseStateMachine('SEARCH');

      machine.transition(SseState.META_SENT);
      machine.transition(SseState.NARRATION_SENT);
      machine.transition(SseState.WAITING);
      
      // WAITING → DONE (timeout case, no summary)
      const transition = machine.transition(SseState.DONE);
      expect(transition.from).toBe(SseState.WAITING);
      expect(transition.to).toBe(SseState.DONE);
      expect(transition.isTerminal).toBe(true);
    });

    it('should reject invalid transition: START → MESSAGE_SENT', () => {
      const machine = new SseStateMachine('SEARCH');

      expect(() => machine.transition(SseState.MESSAGE_SENT)).toThrow(/Invalid SSE state transition/);
    });

    it('should reject invalid transition: META_SENT → MESSAGE_SENT', () => {
      const machine = new SseStateMachine('SEARCH');
      machine.transition(SseState.META_SENT);

      expect(() => machine.transition(SseState.MESSAGE_SENT)).toThrow(/Invalid SSE state transition/);
    });

    it('should reject invalid transition: NARRATION_SENT → DONE', () => {
      const machine = new SseStateMachine('SEARCH');
      machine.transition(SseState.META_SENT);
      machine.transition(SseState.NARRATION_SENT);

      expect(() => machine.transition(SseState.DONE)).toThrow(/Invalid SSE state transition/);
    });

    it('should reject invalid transition: WAITING → MESSAGE_SENT', () => {
      const machine = new SseStateMachine('SEARCH');
      machine.transition(SseState.META_SENT);
      machine.transition(SseState.NARRATION_SENT);
      machine.transition(SseState.WAITING);

      expect(() => machine.transition(SseState.MESSAGE_SENT)).toThrow(/Invalid SSE state transition/);
    });
  });

  describe('ERROR transitions', () => {
    it('should allow ERROR from any state in CLARIFY_STOPPED flow', () => {
      const machine = new SseStateMachine('CLARIFY_STOPPED');

      // From START
      let errorMachine = new SseStateMachine('CLARIFY_STOPPED');
      expect(() => errorMachine.transition(SseState.ERROR)).not.toThrow();

      // From META_SENT
      errorMachine = new SseStateMachine('CLARIFY_STOPPED');
      errorMachine.transition(SseState.META_SENT);
      expect(() => errorMachine.transition(SseState.ERROR)).not.toThrow();

      // From MESSAGE_SENT
      errorMachine = new SseStateMachine('CLARIFY_STOPPED');
      errorMachine.transition(SseState.META_SENT);
      errorMachine.transition(SseState.MESSAGE_SENT);
      expect(() => errorMachine.transition(SseState.ERROR)).not.toThrow();
    });

    it('should allow ERROR from any state in SEARCH flow', () => {
      // From WAITING
      const errorMachine = new SseStateMachine('SEARCH');
      errorMachine.transition(SseState.META_SENT);
      errorMachine.transition(SseState.NARRATION_SENT);
      errorMachine.transition(SseState.WAITING);
      expect(() => errorMachine.transition(SseState.ERROR)).not.toThrow();
    });

    it('should mark ERROR as terminal state', () => {
      const machine = new SseStateMachine('SEARCH');
      machine.transition(SseState.ERROR);

      expect(machine.isTerminal()).toBe(true);
    });
  });

  describe('Terminal states', () => {
    it('should identify DONE as terminal', () => {
      const machine = new SseStateMachine('CLARIFY_STOPPED');
      machine.transition(SseState.META_SENT);
      machine.transition(SseState.MESSAGE_SENT);
      machine.transition(SseState.DONE);

      expect(machine.isTerminal()).toBe(true);
    });

    it('should identify ERROR as terminal', () => {
      const machine = new SseStateMachine('SEARCH');
      machine.transition(SseState.ERROR);

      expect(machine.isTerminal()).toBe(true);
    });

    it('should not allow transition from DONE', () => {
      const machine = new SseStateMachine('SEARCH');
      machine.transition(SseState.META_SENT);
      machine.transition(SseState.NARRATION_SENT);
      machine.transition(SseState.WAITING);
      machine.transition(SseState.DONE);

      expect(() => machine.transition(SseState.ERROR)).toThrow(/Invalid SSE state transition/);
    });

    it('should not allow transition from ERROR', () => {
      const machine = new SseStateMachine('SEARCH');
      machine.transition(SseState.ERROR);

      expect(() => machine.transition(SseState.DONE)).toThrow(/Invalid SSE state transition/);
    });
  });

  describe('State query methods', () => {
    it('should track current state correctly', () => {
      const machine = new SseStateMachine('SEARCH');

      expect(machine.getState()).toBe(SseState.START);

      machine.transition(SseState.META_SENT);
      expect(machine.getState()).toBe(SseState.META_SENT);

      machine.transition(SseState.NARRATION_SENT);
      expect(machine.getState()).toBe(SseState.NARRATION_SENT);
    });

    it('should preserve flow type throughout lifecycle', () => {
      const machine = new SseStateMachine('CLARIFY_STOPPED');

      expect(machine.getFlowType()).toBe('CLARIFY_STOPPED');

      machine.transition(SseState.META_SENT);
      expect(machine.getFlowType()).toBe('CLARIFY_STOPPED');

      machine.transition(SseState.MESSAGE_SENT);
      expect(machine.getFlowType()).toBe('CLARIFY_STOPPED');
    });
  });
});
