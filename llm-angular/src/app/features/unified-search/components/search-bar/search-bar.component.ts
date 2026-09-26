import {
  Component,
  input,
  output,
  signal,
  effect,
  computed,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  NgZone,
  inject,
  DestroyRef,
  OnDestroy,
  ViewChild,
  ElementRef,
  afterNextRender,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs/operators';
import { FormsModule } from '@angular/forms';
import { SpeechToTextService } from '../../../../core/services/speech-to-text.service';

const VOICE_TRIGGER_WORDS = ['חפש', 'תחפש', 'תמצא'];
const MIN_AUTO_SUBMIT_LENGTH = 2;

const TEXTAREA_MIN_HEIGHT_PX = 24;
const TEXTAREA_MAX_HEIGHT_PX = 144;

/** Example searches typed into the empty box so people see how to ask. */
const SEARCH_EXAMPLE_PROMPTS = [
  'pizza near me, open now',
  'quiet sushi for two',
  'gluten-free brunch downtown',
  'spicy ramen under $20',
  'kosher burger I can walk to',
] as const;

const TYPEWRITER_TYPE_MS = 48;
const TYPEWRITER_DELETE_MS = 24;
const TYPEWRITER_HOLD_MS = 5000;
const TYPEWRITER_GAP_MS = 400;
const TYPEWRITER_START_DELAY_MS = 280;

type TypewriterPhase = 'typing' | 'holding' | 'deleting';

interface TypewriterState {
  exampleIndex: number;
  charIndex: number;
  phase: TypewriterPhase;
  text: string;
}

/** One typewriter frame: type a letter, hold, delete a letter, then the next example. */
export function stepTypewriter(
  state: TypewriterState,
  examples: readonly string[],
): { state: TypewriterState; delay: number } {
  const example = examples[state.exampleIndex] ?? '';
  if (state.phase === 'holding') {
    return { state: { ...state, phase: 'deleting' }, delay: TYPEWRITER_DELETE_MS };
  }
  if (state.phase === 'deleting') {
    const charIndex = Math.max(0, state.charIndex - 1);
    if (charIndex === 0) {
      return {
        state: {
          exampleIndex: (state.exampleIndex + 1) % examples.length,
          charIndex: 0,
          phase: 'typing',
          text: '',
        },
        delay: TYPEWRITER_GAP_MS,
      };
    }
    return {
      state: { ...state, charIndex, text: example.slice(0, charIndex) },
      delay: TYPEWRITER_DELETE_MS,
    };
  }
  const charIndex = Math.min(example.length, state.charIndex + 1);
  const done = charIndex >= example.length;
  return {
    state: {
      ...state,
      charIndex,
      phase: done ? 'holding' : 'typing',
      text: example.slice(0, charIndex),
    },
    delay: done ? TYPEWRITER_HOLD_MS : TYPEWRITER_TYPE_MS,
  };
}

function stripTriggerFromStart(text: string): string {
  let s = text.trim();
  for (const trigger of VOICE_TRIGGER_WORDS) {
    if (s.startsWith(trigger)) {
      s = s.slice(trigger.length).trim();
      break;
    }
  }
  return s;
}

@Component({
  selector: 'app-search-bar',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './search-bar.component.html',
  styleUrl: './search-bar.component.scss',
})
export class SearchBarComponent implements OnDestroy {
  readonly value = input<string>('');
  /** Static placeholder. Empty means cycle example searches with a typewriter. */
  readonly placeholder = input('');
  readonly disabled = input(false);
  readonly loading = input(false);

  readonly search = output<string>();
  readonly clear = output<void>();
  readonly inputChange = output<string>();

  readonly query = signal('');
  readonly submitted = signal(false);
  readonly typedPlaceholder = signal('');

  @ViewChild('searchInput') searchInputRef: ElementRef<HTMLTextAreaElement> | undefined;

  private readonly cdr = inject(ChangeDetectorRef);
  private readonly ngZone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);
  readonly speech = inject(SpeechToTextService);
  readonly listening = toSignal(this.speech.listening$, { initialValue: false });
  readonly speechStatusMessage = toSignal(this.speech.statusMessage$, { initialValue: null as string | null });

  readonly effectivePlaceholder = computed(() => {
    if (this.listening()) return 'Listening…';
    return this.placeholder();
  });

  /** Example sentence drawn inside the empty box. Native placeholders do not repaint letter by letter. */
  readonly showTypewriterHint = computed(() =>
    !this.listening() && !this.placeholder() && this.query().trim().length === 0
  );

  private autoSubmittedThisSession = false;
  private typewriterTimer: ReturnType<typeof setTimeout> | null = null;
  private typewriter: TypewriterState = {
    exampleIndex: 0,
    charIndex: 0,
    phase: 'typing',
    text: '',
  };
  private pausedByInput = false;

  constructor() {
    let lastParentValue: string | undefined = undefined;
    effect(() => {
      const parentValue = this.value();
      if (parentValue !== lastParentValue) {
        lastParentValue = parentValue;
        this.query.set(parentValue);
        this.submitted.set(false);
        this.cdr.markForCheck();
      }
    });

    this.speech.transcript$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((t) => {
        this.query.set(t.text);
        this.inputChange.emit(t.text);
        if (t.isFinal) {
          const stripped = stripTriggerFromStart(t.text);
          if (
            stripped.length >= MIN_AUTO_SUBMIT_LENGTH &&
            !this.autoSubmittedThisSession
          ) {
            this.search.emit(stripped);
            this.submitted.set(true);
            this.autoSubmittedThisSession = true;
          }
        }
        this.cdr.markForCheck();
        setTimeout(() => this.resizeTextarea(), 0);
      });

    this.speech.listening$
      .pipe(
        filter((l) => !l),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => {
        this.autoSubmittedThisSession = false;
      });

    effect(() => {
      this.query();
      setTimeout(() => this.resizeTextarea(), 0);
    });

    afterNextRender(() => this.resizeTextarea());

    effect(() => {
      this.syncTypewriter(this.query().trim().length > 0 || this.listening() || !!this.placeholder());
    });
  }

  ngOnDestroy(): void {
    this.clearTypewriter();
    this.speech.stop();
  }

  private syncTypewriter(paused: boolean): void {
    if (paused) {
      this.clearTypewriter();
      if (this.query().trim().length > 0) {
        this.pausedByInput = true;
      }
      return;
    }
    if (this.pausedByInput) {
      this.pausedByInput = false;
      this.typewriter = { exampleIndex: this.typewriter.exampleIndex, charIndex: 0, phase: 'typing', text: '' };
      this.typedPlaceholder.set('');
    }
    if (this.typewriterTimer == null) {
      const delay = this.typewriter.charIndex === 0 && this.typewriter.phase === 'typing'
        ? TYPEWRITER_START_DELAY_MS
        : TYPEWRITER_TYPE_MS;
      this.scheduleTypewriter(delay);
    }
  }

  private scheduleTypewriter(ms: number): void {
    this.clearTypewriter();
    this.typewriterTimer = setTimeout(() => {
      this.ngZone.run(() => this.advanceTypewriter());
    }, ms);
  }

  private clearTypewriter(): void {
    if (this.typewriterTimer != null) {
      clearTimeout(this.typewriterTimer);
      this.typewriterTimer = null;
    }
  }

  private advanceTypewriter(): void {
    this.typewriterTimer = null;
    if (this.placeholder() || this.listening() || this.query().trim().length > 0) {
      return;
    }

    const next = stepTypewriter(this.typewriter, SEARCH_EXAMPLE_PROMPTS);
    this.typewriter = next.state;
    this.typedPlaceholder.set(next.state.text);
    this.cdr.markForCheck();
    this.scheduleTypewriter(next.delay);
  }

  resizeTextarea(): void {
    const el = this.searchInputRef?.nativeElement;
    if (!el) return;
    el.style.height = '0';
    const h = Math.min(
      TEXTAREA_MAX_HEIGHT_PX,
      Math.max(TEXTAREA_MIN_HEIGHT_PX, el.scrollHeight)
    );
    el.style.height = `${h}px`;
  }

  /** Called only from mic button click (user gesture). start() must be invoked directly from this path. */
  toggleMic(): void {
    if (this.listening()) {
      this.speech.stop();
    } else {
      if (this.submitted()) {
        this.query.set('');
        this.submitted.set(false);
        this.inputChange.emit('');
      }
      this.speech.start('he-IL', { fromUserGesture: true });
    }
    this.cdr.markForCheck();
  }

  onSearch(): void {
    const q = this.query().trim();
    if (q) {
      this.search.emit(q);
      this.submitted.set(true);
    }
  }

  onKeydown(event: KeyboardEvent, textarea: HTMLTextAreaElement): void {
    if (event.key !== 'Enter') return;
    if (event.shiftKey) {
      return;
    }
    event.preventDefault();
    const q = textarea.value.trim();
    if (q) {
      this.query.set(q);
      this.search.emit(q);
      this.submitted.set(true);
    }
  }

  onSearchFromInput(value: string): void {
    const q = value.trim();
    if (q) {
      this.query.set(q);
      this.search.emit(q);
      this.submitted.set(true);
    }
  }

  onClear(): void {
    this.query.set('');
    this.submitted.set(false);
    this.clear.emit();
    setTimeout(() => this.resizeTextarea(), 0);
  }

  onInput(value: string): void {
    if (this.submitted()) {
      this.submitted.set(false);
      const old = this.query();
      const newContent = value.startsWith(old) ? value.slice(old.length) : value;
      this.query.set(newContent);
      this.inputChange.emit(newContent);
    } else {
      this.query.set(value);
      this.inputChange.emit(value);
    }
    this.cdr.markForCheck();
  }
}
