import { TestBed } from '@angular/core/testing';
import { GuardrailsComponent } from './guardrails.component';

describe('GuardrailsComponent', () => {
    it('should create', async () => {
        await TestBed.configureTestingModule({
            imports: [GuardrailsComponent]
        }).compileComponents();
        const fixture = TestBed.createComponent(GuardrailsComponent);
        const comp = fixture.componentInstance;
        fixture.detectChanges();
        expect(comp).toBeTruthy();
    });
});


