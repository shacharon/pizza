import { TestBed } from '@angular/core/testing';
import { ChatPageComponent } from './chat-page.component';
import { ChatService } from '../chat.service';


describe('ChatPageComponent', () => {
    it('should create', async () => {
        await TestBed.configureTestingModule({
            imports: [ChatPageComponent],
            providers: [{ provide: ChatService, useValue: { ask: jest.fn() } }]
        }).compileComponents();
        const fixture = TestBed.createComponent(ChatPageComponent);
        const comp = fixture.componentInstance;
        fixture.detectChanges();
        expect(comp).toBeTruthy();
    });

    it('send() should ignore empty input', async () => {
        const ask = jest.fn();
        await TestBed.configureTestingModule({
            imports: [ChatPageComponent],
            providers: [{ provide: ChatService, useValue: { ask } }]
        }).compileComponents();
        const fixture = TestBed.createComponent(ChatPageComponent);
        const comp = fixture.componentInstance;
        comp.input = '   ';
        await comp.send();
        expect(ask).not.toHaveBeenCalled();
        expect(comp.log().length).toBe(0);
    });

    it('send() should append user and assistant messages on success', async () => {
        const ask = jest.fn().mockResolvedValue('Hello!');
        await TestBed.configureTestingModule({
            imports: [ChatPageComponent],
            providers: [{ provide: ChatService, useValue: { ask } }]
        }).compileComponents();
        const fixture = TestBed.createComponent(ChatPageComponent);
        const comp = fixture.componentInstance;
        comp.input = 'Hi';
        await comp.send();
        const log = comp.log();
        const [msg, signal] = ask.mock.calls[0];
        expect(msg).toBe('Hi');
        expect(signal).toBeDefined();
        expect(log.length).toBe(2);
        expect(log[0]).toEqual({ role: 'user', text: 'Hi' });
        expect(log[1]).toEqual({ role: 'assistant', text: 'Hello!' });
        expect(comp.pending()).toBe(false);
        expect(comp.error()).toBeNull();
    });

    it('send() should set error on failure', async () => {
        const ask = jest.fn().mockRejectedValue(new Error('boom'));
        await TestBed.configureTestingModule({
            imports: [ChatPageComponent],
            providers: [{ provide: ChatService, useValue: { ask } }]
        }).compileComponents();
        const fixture = TestBed.createComponent(ChatPageComponent);
        const comp = fixture.componentInstance;
        comp.input = 'Hi';
        await comp.send();
        expect(comp.error()).toBe('boom');
        expect(comp.pending()).toBe(false);
    });

    it('send() should not send again while a request is pending', async () => {
        const ask = jest
            .fn()
            .mockImplementationOnce(() => new Promise<string>(() => { /* never resolve */ }));

        await TestBed.configureTestingModule({
            imports: [ChatPageComponent],
            providers: [{ provide: ChatService, useValue: { ask } }]
        }).compileComponents();

        const fixture = TestBed.createComponent(ChatPageComponent);
        const comp = fixture.componentInstance;

        comp.input = 'First';
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        comp.send();
        await new Promise((r) => setTimeout(r, 0));

        comp.input = 'Second';
        await comp.send();

        expect(ask).toHaveBeenCalledTimes(1);
    });
});


