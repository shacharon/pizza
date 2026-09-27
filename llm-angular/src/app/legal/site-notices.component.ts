import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ENDPOINTS } from '../shared/api/api.config';

type Notice = 'privacy' | 'terms' | 'feedback';

const SEEN_KEY = 'g2e-notices-seen';

@Component({
  selector: 'app-site-notices',
  standalone: true,
  template: `
    @if (notice(); as current) {
      <div class="scrim" (click)="onScrim(current)">
        @if (current === 'privacy') {
          <section class="sheet" role="dialog" aria-modal="true" aria-labelledby="privacy-title" (click)="$event.stopPropagation()">
            <h2 id="privacy-title">Privacy</h2>
            <p>We use the words you type, and your location if you allow it, to find food nearby.</p>
            <p>An AI reads those words and turns them into a place search. Maps then return the restaurants. We do not sell your searches.</p>
            <p>Location is for the search. You can turn it off in the browser.</p>
            <button type="button" class="plain-btn" (click)="nextFrom('privacy')">Continue</button>
          </section>
        } @else if (current === 'terms') {
          <section class="sheet" role="dialog" aria-modal="true" aria-labelledby="terms-title" (click)="$event.stopPropagation()">
            <h2 id="terms-title">Terms</h2>
            <p>going2eat is a search tool. An AI reads your sentence, and it can misunderstand you. The list is a suggestion, not a promise that a place is open, kosher, or a good match.</p>
            <p>Check the place yourself before you go. Hours, prices, and menus can be wrong.</p>
            <button type="button" class="plain-btn" (click)="nextFrom('terms')">Continue</button>
          </section>
        } @else {
          <section class="sheet sheet-rich" role="dialog" aria-modal="true" aria-labelledby="feedback-title" (click)="$event.stopPropagation()">
            @if (!thanks()) {
              <img class="mark" src="going2eat-logo.png" alt="" />
              <h2 id="feedback-title">How does this feel?</h2>
              <p class="lede">The search, the list, the whole site.</p>
              <div class="choices">
                <button type="button" class="choice" [class.on]="mood() === 'like'" (click)="mood.set('like')">I like it</button>
                <button type="button" class="choice" [class.on]="mood() === 'work'" (click)="mood.set('work')">Needs work</button>
              </div>
              <label class="note-label" for="site-note">One thing to change</label>
              <textarea id="site-note" rows="3" [value]="note()" (input)="note.set($any($event.target).value)" placeholder="Optional"></textarea>
              <button type="button" class="send" [disabled]="!mood() || sending()" (click)="send()">Send</button>
              @if (sendError()) {
                <p class="lede">Couldn't send that. Try again.</p>
              }
            } @else {
              <div class="thanks">
                <img class="mark" src="going2eat-logo.png" alt="" />
                <h2>Thanks</h2>
                <p class="lede">That helps.</p>
                <button type="button" class="send" (click)="close()">Done</button>
              </div>
            }
          </section>
        }
      </div>
    }
  `,
  styles: `
    .scrim {
      position: fixed;
      inset: 0;
      z-index: 80;
      display: grid;
      place-items: center;
      padding: 1.25rem;
      background: rgba(17, 24, 39, 0.45);
    }
    .sheet {
      width: min(100%, 26rem);
      margin: 0;
      padding: 1.35rem 1.35rem 1.2rem;
      border-radius: 16px;
      background: #fff;
      color: #111827;
      box-shadow: 0 18px 50px rgba(17, 24, 39, 0.18);
    }
    h2 {
      margin: 0 0 0.75rem;
      font-size: 1.35rem;
      letter-spacing: -0.03em;
    }
    p {
      margin: 0 0 0.7rem;
      line-height: 1.5;
      color: #374151;
    }
    .plain-btn, .send {
      margin-top: 0.4rem;
      width: 100%;
      min-height: 2.75rem;
      border: 0;
      border-radius: 999px;
      background: #111827;
      color: #fff;
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }
    .send:disabled {
      opacity: 0.4;
      cursor: default;
    }
    .sheet-rich {
      width: min(100%, 28rem);
      padding: 1.6rem 1.4rem 1.3rem;
      border-radius: 28px;
      background:
        radial-gradient(120% 80% at 50% -10%, #ffe8d6 0%, rgba(255, 232, 214, 0) 55%),
        #fff;
      text-align: center;
    }
    .mark {
      width: 92px;
      height: auto;
      margin: 0 auto 0.35rem;
    }
    .lede {
      color: #6b7280;
    }
    .choices {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.6rem;
      margin: 0.9rem 0 0.85rem;
    }
    .choice {
      min-height: 3.25rem;
      border: 1px solid #e5e7eb;
      border-radius: 16px;
      background: #fff;
      color: #111827;
      font: inherit;
      font-weight: 650;
      cursor: pointer;
    }
    .choice.on {
      border-color: #f26522;
      background: #fff4ec;
      color: #c2410c;
    }
    .note-label {
      display: block;
      margin-bottom: 0.35rem;
      text-align: start;
      font-size: 0.85rem;
      color: #6b7280;
    }
    textarea {
      width: 100%;
      box-sizing: border-box;
      border: 1px solid #e5e7eb;
      border-radius: 14px;
      padding: 0.7rem 0.8rem;
      font: inherit;
      resize: vertical;
    }
    .sheet-rich .send {
      margin-top: 0.85rem;
      background: #f26522;
    }
    .thanks h2 { margin-top: 0.2rem; }
  `,
})
export class SiteNoticesComponent {
  private readonly http = inject(HttpClient);
  readonly notice = signal<Notice | null>(null);
  readonly mood = signal<'like' | 'work' | null>(null);
  readonly note = signal('');
  readonly thanks = signal(false);
  readonly sending = signal(false);
  readonly sendError = signal(false);
  private fromFooter = false;

  open(which: Notice): void {
    this.fromFooter = true;
    this.thanks.set(false);
    this.sendError.set(false);
    this.notice.set(which);
  }

  nextFrom(which: Notice): void {
    if (this.fromFooter) {
      this.finish();
      return;
    }
    if (which === 'privacy') {
      this.notice.set('terms');
      return;
    }
    this.finish();
  }

  onScrim(current: Notice): void {
    if (current === 'feedback') this.finish();
  }

  send(): void {
    const mood = this.mood();
    if (!mood || this.sending()) return;
    this.sending.set(true);
    this.sendError.set(false);
    this.http.post(ENDPOINTS.FEEDBACK, { mood, note: this.note().trim() }).subscribe({
      next: () => {
        this.sending.set(false);
        this.thanks.set(true);
      },
      error: () => {
        this.sending.set(false);
        this.sendError.set(true);
      },
    });
  }

  close(): void {
    this.finish();
  }

  private finish(): void {
    this.notice.set(null);
    this.fromFooter = false;
    localStorage.setItem(SEEN_KEY, '1');
  }
}
