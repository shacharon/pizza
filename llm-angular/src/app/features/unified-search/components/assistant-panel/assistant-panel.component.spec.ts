/**
 * Assistant Panel Component Tests
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AssistantPanelComponent } from './assistant-panel.component';
import { WsClientService } from '../../../../core/services/ws-client.service';
import { Subject } from 'rxjs';

describe('AssistantPanelComponent', () => {
  let component: AssistantPanelComponent;
  let fixture: ComponentFixture<AssistantPanelComponent>;
  let mockWsService: Partial<WsClientService>;
  let messagesSubject: Subject<any>;

  beforeEach(async () => {
    messagesSubject = new Subject();
    
    mockWsService = {
      messages$: messagesSubject.asObservable(),
      connect: jest.fn(),
      connectionStatus: jest.fn() as any
    };

    await TestBed.configureTestingModule({
      imports: [AssistantPanelComponent],
      providers: [
        { provide: WsClientService, useValue: mockWsService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(AssistantPanelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should start with empty messages', () => {
    expect(component.messages().length).toBe(0);
  });

  it('should add assistant_progress message', () => {
    const msg = {
      type: 'assistant_progress',
      requestId: 'req-123',
      seq: 1,
      message: 'Analyzing query...'
    };

    messagesSubject.next(msg);
    fixture.detectChanges();

    const visible = component.messages();
    expect(visible.length).toBe(1);
    expect(visible[0].message).toBe('Analyzing query...');
  });

  it('should add assistant_suggestion message', () => {
    const msg = {
      type: 'assistant_suggestion',
      requestId: 'req-123',
      seq: 1,
      message: 'Try searching near you'
    };

    messagesSubject.next(msg);
    fixture.detectChanges();

    expect(component.messages().length).toBe(1);
    expect(component.messages()[0].type).toBe('assistant_suggestion');
  });

  it('should ignore duplicate messages', () => {
    const msg = {
      type: 'assistant_progress',
      requestId: 'req-123',
      seq: 1,
      message: 'Test message'
    };

    messagesSubject.next(msg);
    messagesSubject.next(msg); // Duplicate
    fixture.detectChanges();

    expect(component.messages().length).toBe(1);
  });

  it('should clear messages on new requestId', () => {
    const msg1 = {
      type: 'assistant_progress',
      requestId: 'req-123',
      seq: 1,
      message: 'First message'
    };

    const msg2 = {
      type: 'assistant_progress',
      requestId: 'req-456',
      seq: 1,
      message: 'New search message'
    };

    messagesSubject.next(msg1);
    fixture.detectChanges();
    expect(component.messages().length).toBe(1);

    messagesSubject.next(msg2);
    fixture.detectChanges();
    expect(component.messages().length).toBe(1);
    expect(component.messages()[0].message).toBe('New search message');
  });

  it('should sort messages by seq and show last 3', () => {
    const messages = [
      { type: 'assistant_progress' as const, requestId: 'req-123', seq: 1, message: 'First' },
      { type: 'assistant_progress' as const, requestId: 'req-123', seq: 2, message: 'Second' },
      { type: 'assistant_progress' as const, requestId: 'req-123', seq: 3, message: 'Third' },
      { type: 'assistant_progress' as const, requestId: 'req-123', seq: 4, message: 'Fourth' },
      { type: 'assistant_progress' as const, requestId: 'req-123', seq: 5, message: 'Fifth' }
    ];

    messages.forEach(msg => messagesSubject.next(msg));
    fixture.detectChanges();

    const visible = component.messages();
    expect(visible.length).toBe(3);
    expect(visible[0].message).toBe('Third');
    expect(visible[1].message).toBe('Fourth');
    expect(visible[2].message).toBe('Fifth');
  });

  it('should clear messages when clearMessages() is called', () => {
    const msg = {
      type: 'assistant_progress',
      requestId: 'req-123',
      seq: 1,
      message: 'Test message'
    };

    messagesSubject.next(msg);
    fixture.detectChanges();
    expect(component.messages().length).toBe(1);

    component.clearMessages();
    fixture.detectChanges();
    expect(component.messages().length).toBe(0);
  });

  it('should ignore non-assistant messages', () => {
    const msg = {
      type: 'status',
      requestId: 'req-123',
      status: 'idle'
    };

    messagesSubject.next(msg);
    fixture.detectChanges();

    expect(component.messages().length).toBe(0);
  });

  it('should return correct icon for message type', () => {
    expect(component.getIcon('assistant_progress')).toBe('🔄');
    expect(component.getIcon('assistant_suggestion')).toBe('💡');
    expect(component.getIcon('unknown')).toBe('📝');
  });
});
