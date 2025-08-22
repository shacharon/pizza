import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialNode, reduce } from '../src/agent/reducer.js';
import { AgentState } from '../src/agent/states.js';

describe('agent reducer', () => {
    it('COLLECTING + INTENT_OTHER -> REFUSAL', () => {
        let node = createInitialNode('hello');
        node = reduce(node, { type: 'USER_MESSAGE', text: 'hello' });
        node = reduce(node, { type: 'INTENT_OTHER' });
        assert.equal(node.state, AgentState.REFUSAL);
        assert.ok(node.reply && node.reply.length > 0);
    });

    it('COLLECTING + INTENT_OK (no city) asks for city', () => {
        let node = createInitialNode('order pizza');
        node = reduce(node, { type: 'USER_MESSAGE', text: 'order pizza' });
        node = reduce(node, { type: 'INTENT_OK' });
        assert.equal(node.state, AgentState.COLLECTING);
        assert.ok(node.reply?.includes('עיר'));
    });

    it('COLLECTING + INTENT_OK (has city, missing minor) -> PARTIAL_RESULTS', () => {
        let node = createInitialNode('pizza tel aviv');
        node = reduce(node, { type: 'USER_MESSAGE', text: 'pizza tel aviv' });
        node = reduce(node, { type: 'CLARIFIED', patch: { city: 'tel aviv', type: 'pizza' } as any });
        assert.equal(node.state, AgentState.PARTIAL_RESULTS);
        assert.ok(node.reply?.length);
    });

    it('PARTIAL_RESULTS + CLARIFIED (coreKnown) -> SEARCHING', () => {
        let node = createInitialNode('pizza');
        node = reduce(node, { type: 'USER_MESSAGE', text: 'pizza' });
        node = reduce(node, { type: 'CLARIFIED', patch: { city: 'tel aviv' } as any });
        // now minor still missing, in PARTIAL_RESULTS
        node = reduce(node, { type: 'CLARIFIED', patch: { type: 'pizza', maxPrice: 60 } as any });
        assert.equal(node.state, AgentState.SEARCHING);
    });

    it('SEARCHING + SEARCH_OK with vendors -> RESULTS', () => {
        let node = createInitialNode('pizza tel aviv');
        node = reduce(node, { type: 'CLARIFIED', patch: { city: 'tel aviv', type: 'pizza' } as any });
        node = reduce(node, { type: 'SEARCH_START' });
        node = reduce(node, { type: 'SEARCH_OK', results: { vendors: [{ id: 'v1', name: 'p1', distanceMinutes: 10 } as any], items: [], query: { raw: 'x' } as any } });
        assert.equal(node.state, AgentState.RESULTS);
    });

    it('SEARCHING + SEARCH_OK with 0 vendors -> NO_RESULTS', () => {
        let node = createInitialNode('pizza tel aviv');
        node = reduce(node, { type: 'CLARIFIED', patch: { city: 'tel aviv', type: 'pizza' } as any });
        node = reduce(node, { type: 'SEARCH_START' });
        node = reduce(node, { type: 'SEARCH_OK', results: { vendors: [], items: [], query: { raw: 'x' } as any } });
        assert.equal(node.state, AgentState.NO_RESULTS);
    });
});


// Add chain test for RESULTS -> QUOTING -> CONFIRM -> ORDERING -> DONE
import { describe as describe2, it as it2 } from 'node:test';

describe2('agent reducer ordering flow', () => {
    it2('RESULTS + SELECT_VENDOR -> QUOTING -> CONFIRM -> ORDERING -> DONE', () => {
        let node = createInitialNode('pizza tel aviv');
        node = reduce(node, { type: 'CLARIFIED', patch: { city: 'tel aviv', type: 'pizza' } as any });
        node = reduce(node, { type: 'SEARCH_START' });
        node = reduce(node, { type: 'SEARCH_OK', results: { vendors: [{ id: 'v1', name: 'p1', distanceMinutes: 10 } as any], items: [], query: { raw: 'x' } as any } });
        assert.equal(node.state, AgentState.RESULTS);

        node = reduce(node, { type: 'SELECT_VENDOR', vendorId: 'v1' });
        assert.equal(node.state, AgentState.QUOTING);

        node = reduce(node, { type: 'QUOTE_READY' });
        assert.equal(node.state, AgentState.CONFIRM);

        node = reduce(node, { type: 'CONFIRM' });
        assert.equal(node.state, AgentState.ORDERING);

        node = reduce(node, { type: 'ORDER_OK' });
        assert.equal(node.state, AgentState.DONE);
    });
});


