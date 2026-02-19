/**
 * Assistant Line Component Tests
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AssistantLineComponent } from './assistant-line.component';
import { WsClientService } from '../../../../core/services/ws-client.service';
import { Subject } from 'rxjs';

describe('AssistantLineComponent', () => {
  let component: AssistantLineComponent;
  let fixture: ComponentFixture<AssistantLineComponent>;
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
      imports: [AssistantLineComponent],
      providers: [
        { provide: WsClientService, useValue: mockWsService }
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
    expect(component.displayMessage()).toBeNull();
  });

  it('should display assistant_progress message', (done) => {
    const msg = {
      type: 'assistant_progress',
      requestId: 'req-123',
      seq: 1,
      message: 'Analyzing query...'
    };

    messagesSubject.next(msg);
    
    // Wait for async queue processing
    setTimeout(() => {
      fixture.detectChanges();
      expect(component.displayMessage()).toBe('Analyzing query...');
      done();
    }, 100);
  });

  it('should replace message on new requestId', (done) => {
    const msg1 = {
      type: 'assistant_progress',
      requestId: 'req-123',
      seq: 1,
      message: 'First search'
    };

    const msg2 = {
      type: 'assistant_progress',
      requestId: 'req-456',
      seq: 1,
      message: 'New search'
    };

    messagesSubject.next(msg1);
    
    setTimeout(() => {
      messagesSubject.next(msg2);
      
      setTimeout(() => {
        fixture.detectChanges();
        expect(component.displayMessage()).toBe('New search');
        done();
      }, 100);
    }, 100);
  });

  it('should clear message when clearMessage is called', (done) => {
    const msg = {
      type: 'assistant_progress',
      requestId: 'req-123',
      seq: 1,
      message: 'Test message'
    };

    messagesSubject.next(msg);
    
    setTimeout(() => {
      fixture.detectChanges();
      expect(component.displayMessage()).toBe('Test message');
      
      component.clearMessage();
      fixture.detectChanges();
      expect(component.displayMessage()).toBeNull();
      done();
    }, 100);
  });

  it('should ignore non-assistant messages', () => {
    const msg = {
      type: 'status',
      requestId: 'req-123',
      status: 'idle'
    };

    messagesSubject.next(msg);
    fixture.detectChanges();

    expect(component.displayMessage()).toBeNull();
  });
});
