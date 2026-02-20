import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';
import { provideRouter, RouterOutlet } from '@angular/router';
import { routes } from './app.routes';

describe('AppComponent', () => {
  it('should create', async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent, RouterOutlet],
      providers: [provideRouter(routes)]
    }).compileComponents();
    const fixture = TestBed.createComponent(AppComponent);
    const comp = fixture.componentInstance;
    expect(comp).toBeTruthy();
  });
});


