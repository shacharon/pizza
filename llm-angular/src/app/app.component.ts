import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChatService } from './chat.service';


@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
<div class="wrap">
<h1>LLM Chat (Angular)</h1>
<div class="box">
<div *ngFor="let m of log()">
<b>{{ m.role === 'user' ? 'You' : 'AI' }}:</b> {{ m.text }}
</div>
</div>
<div class="row">
<input [(ngModel)]="input" placeholder="שאל משהו…" [disabled]="pending()" />
<button (click)="send()" [disabled]="pending()">{{ pending() ? 'Sending…' : 'Send' }}</button>
</div>
<div *ngIf="error()" style="color:#b00; margin-top:8px;">{{ error() }}</div>
</div>
`,
  styles: [`
.wrap { max-width: 700px; margin: 40px auto; font-family: system-ui, sans-serif; }
.box { border: 1px solid #ddd; padding: 16px; border-radius: 8px; min-height: 220px; }
.row { display: flex; gap: 8px; margin-top: 12px; }
input { flex: 1; padding: 8px; }
`]
})
export class AppComponent {
  input = '';
  log = signal<{ role: 'user' | 'assistant'; text: string }[]>([]);
  pending = signal(false);
  error = signal<string | null>(null);
  private controller: AbortController | null = null;
  constructor(private chat: ChatService) { }


  async send() {
    const msg = this.input.trim();
    if (!msg || this.pending()) return;
    this.log.update((l) => [...l, { role: 'user', text: msg }]);
    this.input = '';
    this.pending.set(true);
    this.error.set(null);
    this.controller?.abort();
    this.controller = new AbortController();
    try {
      const reply = await this.chat.ask(msg, this.controller.signal);
      this.log.update((l) => [...l, { role: 'assistant', text: reply }]);
    } catch (e: any) {
      this.error.set(e?.message || 'Request failed');
    } finally {
      this.pending.set(false);
      this.controller = null;
    }
  }
}