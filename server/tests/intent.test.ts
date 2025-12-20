import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectIntent } from '../src/services/intent.js';

/**
 * Intent Detection Tests - Multilingual
 * 
 * Demonstrates that LLM-based intent detection works in ANY language
 * without hardcoded patterns or keyword lists.
 * 
 * These tests require LLM to be configured (OPENAI_API_KEY in .env)
 */

describe('Intent Detection - Multilingual (LLM-based)', () => {
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // HEBREW TESTS
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    it('[Hebrew] "פיצה באשקלון" → find_food', async () => {
        const result = await detectIntent('פיצה באשקלון');
        assert.equal(result.intent, 'find_food');
        assert.ok(result.confidence > 0.7);
        assert.equal(result.source, 'llm');
    });

    it('[Hebrew] "אני רעב" → find_food', async () => {
        const result = await detectIntent('אני רעב');
        assert.equal(result.intent, 'find_food');
        assert.ok(result.confidence > 0.6);
    });

    it('[Hebrew] "שלום" → greeting', async () => {
        const result = await detectIntent('שלום');
        assert.equal(result.intent, 'greeting');
        assert.ok(result.confidence > 0.8);
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ENGLISH TESTS
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    it('[English] "pizza in ashkelon" → find_food', async () => {
        const result = await detectIntent('pizza in ashkelon');
        assert.equal(result.intent, 'find_food');
        assert.ok(result.confidence > 0.7);
    });

    it('[English] "I\'m starving" → find_food', async () => {
        const result = await detectIntent("I'm starving");
        assert.equal(result.intent, 'find_food');
        assert.ok(result.confidence > 0.6);
    });

    it('[English] "hello" → greeting', async () => {
        const result = await detectIntent('hello');
        assert.equal(result.intent, 'greeting');
        assert.ok(result.confidence > 0.8);
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ARABIC TESTS
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    it('[Arabic] "بيتزا في أشكلون" → find_food', async () => {
        const result = await detectIntent('بيتزا في أشكلون');
        assert.equal(result.intent, 'find_food');
        assert.ok(result.confidence > 0.7);
        console.log('  ✅ Arabic intent detection works!');
    });

    it('[Arabic] "أنا جائع" (I\'m hungry) → find_food', async () => {
        const result = await detectIntent('أنا جائع');
        assert.equal(result.intent, 'find_food');
        assert.ok(result.confidence > 0.6);
    });

    it('[Arabic] "مرحبا" (hello) → greeting', async () => {
        const result = await detectIntent('مرحبا');
        assert.equal(result.intent, 'greeting');
        assert.ok(result.confidence > 0.8);
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // RUSSIAN TESTS 🇷🇺
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    it('[Russian] "пицца в Тель-Авиве" (pizza in Tel Aviv) → find_food', async () => {
        const result = await detectIntent('пицца в Тель-Авиве');
        assert.equal(result.intent, 'find_food');
        assert.ok(result.confidence > 0.7);
        console.log('  ✅ Russian intent detection works! 🇷🇺');
    });

    it('[Russian] "я голоден" (I\'m hungry) → find_food', async () => {
        const result = await detectIntent('я голоден');
        assert.equal(result.intent, 'find_food');
        assert.ok(result.confidence > 0.6);
    });

    it('[Russian] "привет" (hello) → greeting', async () => {
        const result = await detectIntent('привет');
        assert.equal(result.intent, 'greeting');
        assert.ok(result.confidence > 0.8);
    });

    it('[Russian] "суши рядом со мной" (sushi near me) → find_food', async () => {
        const result = await detectIntent('суши рядом со мной');
        assert.equal(result.intent, 'find_food');
        assert.ok(result.confidence > 0.7);
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // SPANISH TESTS 🇪🇸
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    it('[Spanish] "pizza en Barcelona" → find_food', async () => {
        const result = await detectIntent('pizza en Barcelona');
        assert.equal(result.intent, 'find_food');
        assert.ok(result.confidence > 0.7);
        console.log('  ✅ Spanish intent detection works! 🇪🇸 ¡Por favor!');
    });

    it('[Spanish] "tengo hambre" (I\'m hungry) → find_food', async () => {
        const result = await detectIntent('tengo hambre');
        assert.equal(result.intent, 'find_food');
        assert.ok(result.confidence > 0.6);
    });

    it('[Spanish] "hola" → greeting', async () => {
        const result = await detectIntent('hola');
        assert.equal(result.intent, 'greeting');
        assert.ok(result.confidence > 0.8);
    });

    it('[Spanish] "restaurante cerca de mí" (restaurant near me) → find_food', async () => {
        const result = await detectIntent('restaurante cerca de mí');
        assert.equal(result.intent, 'find_food');
        assert.ok(result.confidence > 0.7);
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // FRENCH TESTS 🇫🇷 (Bonus!)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    it('[French] "pizza à Paris" → find_food', async () => {
        const result = await detectIntent('pizza à Paris');
        assert.equal(result.intent, 'find_food');
        assert.ok(result.confidence > 0.7);
        console.log('  ✅ French intent detection works! 🇫🇷');
    });

    it('[French] "j\'ai faim" (I\'m hungry) → find_food', async () => {
        const result = await detectIntent("j'ai faim");
        assert.equal(result.intent, 'find_food');
        assert.ok(result.confidence > 0.6);
    });

    it('[French] "bonjour" → greeting', async () => {
        const result = await detectIntent('bonjour');
        assert.equal(result.intent, 'greeting');
        assert.ok(result.confidence > 0.8);
    });

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // EDGE CASES
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    it('[Mixed] "pizza в Tel Aviv" (mixed Russian/English) → find_food', async () => {
        const result = await detectIntent('pizza в Tel Aviv');
        assert.equal(result.intent, 'find_food');
        assert.ok(result.confidence > 0.6);
    });

    it('[Order] "order pizza number 3" → order_food', async () => {
        const result = await detectIntent('order pizza number 3');
        assert.equal(result.intent, 'order_food');
        assert.ok(result.confidence > 0.6);
    });

    it('[Not Food] "how to make pizza at home" → not_food', async () => {
        const result = await detectIntent('how to make pizza at home');
        assert.equal(result.intent, 'not_food');
        assert.ok(result.confidence > 0.6);
    });
});

