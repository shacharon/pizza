import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

const MODELS = [
  'gpt-4o-mini',
  'gpt-4o',
  'gpt-4-turbo',
  'gpt-3.5-turbo',
] as const;

const SAMPLE_TEXTS = [
  'Review this product description for clarity and tone: "Our new widget is the best. Buy it now."',
  'Summarize in one sentence: The quick brown fox jumps over the lazy dog. Repeated ten times.',
  'Score (1-10) these four aspects: grammar, clarity, brevity, tone. Text: "We are pleased to inform you that your application has been received."',
];

const OPENAI_ENDPOINT = 'https://api.openai.com/v1/responses';

async function callOpenAI(
  apiKey: string,
  model: string,
  temperature: number,
  userText: string,
  systemPrompt: string
): Promise<string> {
  const res = await fetch(OPENAI_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature,
      input: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userText },
      ],
    }),
  });

  const raw = await res.text();
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${raw}`);
  return raw;
}

const EVALUATOR_SYSTEM_PROMPT = `You are an evaluator. Respond with ONLY valid JSON, no markdown, no explanation.
Use exactly this schema (all keys required):
{
  "overallScore": number,
  "seriousness": number,
  "emotionalDepth": number,
  "authenticity": number,
  "effort": number,
  "redFlags": string[],
  "summary": string
}
Scores are 1-10. overallScore to one decimal. redFlags is an array of short strings (or empty []). summary is one short sentence.`;

const REQUIRED_KEYS = ['overallScore', 'seriousness', 'emotionalDepth', 'authenticity', 'effort', 'redFlags', 'summary'] as const;

export interface EvalResult {
  overallScore: number;
  seriousness: number;
  emotionalDepth: number;
  authenticity: number;
  effort: number;
  redFlags: string[];
  summary: string;
  rawResponseText: string;
}

function clampScore(n: number): number {
  return Math.min(10, Math.max(1, Number(n)));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function parseAndValidateResponse(rawText: string): EvalResult {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    throw new Error('Response is not valid JSON');
  }

  for (const key of REQUIRED_KEYS) {
    if (!(key in parsed)) {
      throw new Error(`Missing required key: ${key}`);
    }
  }

  const overallScore = round1(clampScore(Number(parsed.overallScore)));
  const seriousness = Math.round(clampScore(Number(parsed.seriousness)));
  const emotionalDepth = Math.round(clampScore(Number(parsed.emotionalDepth)));
  const authenticity = Math.round(clampScore(Number(parsed.authenticity)));
  const effort = Math.round(clampScore(Number(parsed.effort)));
  const redFlags = Array.isArray(parsed.redFlags)
    ? (parsed.redFlags as unknown[]).map((x) => String(x))
    : [];
  const summary = typeof parsed.summary === 'string' ? parsed.summary : String(parsed.summary ?? '');

  return {
    overallScore,
    seriousness,
    emotionalDepth,
    authenticity,
    effort,
    redFlags,
    summary,
    rawResponseText: rawText,
  };
}

@Component({
  selector: 'app-evaluate-poc',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './evaluate-poc.component.html',
  styleUrl: './evaluate-poc.component.scss',
})
export class EvaluatePocComponent {
  userText = '';
  model: string = MODELS[0];
  temperature = 0.7;
  apiKey = '';
  loading = signal(false);
  error = signal<string | null>(null);
  result = signal<EvalResult | null>(null);
  debugOpen = signal(false);

  models = MODELS;
  sampleTexts = SAMPLE_TEXTS;

  canEvaluate = computed(() => {
    return (
      !!this.userText.trim() &&
      !!this.apiKey.trim() &&
      !this.loading()
    );
  });

  setSample(index: number): void {
    this.userText = this.sampleTexts[index] ?? '';
    this.error.set(null);
  }

  toggleDebug(): void {
    this.debugOpen.update((v) => !v);
  }

  async evaluate(): Promise<void> {
    this.error.set(null);
    this.result.set(null);
    this.loading.set(true);

    try {
      const raw = await callOpenAI(
        this.apiKey,
        this.model,
        this.temperature,
        this.userText.trim(),
        EVALUATOR_SYSTEM_PROMPT
      );

      let content = '';
      try {
        const data = JSON.parse(raw) as {
          output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
        };
        const firstOutput = data?.output?.[0];
        const firstContent = firstOutput?.content?.[0];
        if (firstContent && typeof firstContent.text === 'string') {
          content = firstContent.text.trim();
        }
      } catch {
        throw new Error('Invalid JSON in API response body');
      }

      if (!content) {
        throw new Error('Empty response from API');
      }

      const validated = parseAndValidateResponse(content);
      this.result.set(validated);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : String(e));
    } finally {
      this.loading.set(false);
    }
  }
}
