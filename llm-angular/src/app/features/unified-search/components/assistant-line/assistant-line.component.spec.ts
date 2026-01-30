/**
 * Assistant Line Component Tests (REFACTORED)
 * Tests presentational component with mocked dependencies
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AssistantLineComponent } from './assistant-line.component';
import { WsClientService } from '../../../../core/services/ws-client.service';
import { WsStatusFsmService } from '../../../../core/services/ws-status-fsm.service';
import { SearchFacade } from '../../../../facades/search.facade';

describe('AssistantLineComponent', () => {
  let component: AssistantLineComponent;
  let fixture: ComponentFixture<AssistantLineComponent>;
  let mockWsClient: Partial<WsClientService>;
  let mockWsStatusFsm: Partial<WsStatusFsmService>;
  let mockSearchFacade: Partial<SearchFacade>;

  beforeEach(async () => {
    // Mock WsClientService
    mockWsClient = {
      connectionStatus: signal('disconnected' as any)
    };

    // Mock WsStatusFsmService
    mockWsStatusFsm = {
      wsStatusMessage: signal(null),
      processStatusChange: jest.fn(),
      clearMessage: jest.fn()
    };

    // Mock SearchFacade
    mockSearchFacade = {
      assistantLineMessages: signal([]),
      requestId: signal(undefined)
    };

    await TestBed.configureTestingModule({
      imports: [AssistantLineComponent],
      providers: [
        { provide: WsClientService, useValue: mockWsClient },
        { provide: WsStatusFsmService, useValue: mockWsStatusFsm },
        { provide: SearchFacade, useValue: mockSearchFacade }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(AssistantLineComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should start with no message', () => {
    expect(component.finalMessage()).toBeNull();
  });

  it('should display line message from facade', () => {
    // Update mock facade to return a line message
    (mockSearchFacade.assistantLineMessages as any).set([
      {
        id: 'msg-1',
        type: 'PROGRESS',
        message: 'Analyzing query...',
        requestId: 'req-123',
        timestamp: Date.now()
      }
    ]);
    (mockSearchFacade.requestId as any).set('req-123');

    fixture.detectChanges();
    expect(component.finalMessage()).toBe('Analyzing query...');
  });

  it('should filter messages by active requestId', () => {
    // Add message for req-123
    (mockSearchFacade.assistantLineMessages as any).set([
      {
        id: 'msg-1',
        type: 'PROGRESS',
        message: 'Old search',
        requestId: 'req-123',
        timestamp: Date.now()
      },
      {
        id: 'msg-2',
        type: 'PROGRESS',
        message: 'New search',
        requestId: 'req-456',
        timestamp: Date.now() + 1
      }
    ]);
    (mockSearchFacade.requestId as any).set('req-456');

    fixture.detectChanges();
    expect(component.finalMessage()).toBe('New search');
  });

  it('should delegate clearMessage to FSM service', () => {
    component.clearMessage();
    expect(mockWsStatusFsm.clearMessage).toHaveBeenCalled();
  });

  it('should prioritize line message over WS status', () => {
    // Set both line message and WS status
    (mockSearchFacade.assistantLineMessages as any).set([
      {
        id: 'msg-1',
        type: 'PROGRESS',
        message: 'Line message',
        requestId: 'req-123',
        timestamp: Date.now()
      }
    ]);
    (mockWsStatusFsm.wsStatusMessage as any).set({
      type: 'ws_status',
      message: 'WS status message',
      status: 'connecting'
    });

    fixture.detectChanges();
    // Line message should take priority
    expect(component.finalMessage()).toBe('Line message');
  });

  it('should show WS status when no line messages', () => {
    // Only WS status, no line messages
    (mockWsStatusFsm.wsStatusMessage as any).set({
      type: 'ws_status',
      message: 'Connecting...',
      status: 'connecting'
    });

    fixture.detectChanges();
    expect(component.finalMessage()).toBe('Connecting...');
  });
});
