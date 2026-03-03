import {
  Component,
  input,
  output,
  signal,
  effect,
  computed,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
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
  readonly placeholder = input('Tell me what you want to eat…');
  readonly disabled = input(false);
  readonly loading = input(false);

  readonly search = output<string>();
  readonly clear = output<void>();
  readonly inputChange = output<string>();

  readonly query = signal('');
  readonly submitted = signal(false);

  @ViewChild('searchInput') searchInputRef: ElementRef<HTMLTextAreaElement> | undefined;

  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  readonly speech = inject(SpeechToTextService);
  readonly listening = toSignal(this.speech.listening$, { initialValue: false });

  readonly effectivePlaceholder = computed(() =>
    this.listening() ? 'Listening…' : this.placeholder()
  );

  private autoSubmittedThisSession = false;

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
  }

  ngOnDestroy(): void {
    this.speech.stop();
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

  toggleMic(): void {
    if (this.listening()) {
      this.speech.stop();
    } else {
      if (this.submitted()) {
        this.query.set('');
        this.submitted.set(false);
        this.inputChange.emit('');
      }
      this.speech.start('he-IL');
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
