import { TestBed } from '@angular/core/testing';
import { ChatPageComponent } from './chat-page.component';
import { provideHttpClient } from '@angular/common/http';

describe('ChatPageComponent', () => {
    it('should create', async () => {
        await TestBed.configureTestingModule({
            imports: [ChatPageComponent],
            providers: [provideHttpClient()]
        }).compileComponents();
        const fixture = TestBed.createComponent(ChatPageComponent);
        const comp = fixture.componentInstance;
        expect(comp).toBeTruthy();
    });
});


