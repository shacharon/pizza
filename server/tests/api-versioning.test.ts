import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';

describe('API Versioning - Regression Tests', () => {
  let app: any;

  beforeEach(() => {
    app = createApp();
  });

  describe('Path exactness - prevent double-prefix bugs', () => {
    it('POST /api/v1/search should return 200 (not /api/v1/search/search)', async () => {
      const response = await request(app)
        .post('/api/v1/search')
        .send({ query: 'pizza' });
      
      // Should work at canonical path
      assert.equal(response.status, 200);
    });

    it('POST /api/v1/search/search should return 404 (double-prefix bug)', async () => {
      const response = await request(app)
        .post('/api/v1/search/search')
        .send({ query: 'pizza' });
      
      // Should NOT work - this would indicate double-prefix bug
      assert.equal(response.status, 404);
    });

    it('GET /api/v1/search/stats should return 200', async () => {
      const response = await request(app)
        .get('/api/v1/search/stats');
      
      assert.equal(response.status, 200);
    });

    it('POST /api/v1/analytics/events should return 200', async () => {
      const response = await request(app)
        .post('/api/v1/analytics/events')
        .send({ event: 'test_event', data: {} });
      
      assert.equal(response.status, 200);
    });

    it('POST /api/v1/analytics/analytics/events should return 404 (double-prefix bug)', async () => {
      const response = await request(app)
        .post('/api/v1/analytics/analytics/events')
        .send({ event: 'test' });
      
      // Should NOT work
      assert.equal(response.status, 404);
    });
  });

  describe('Legacy path compatibility - exact same paths as before', () => {
    it('POST /api/search should return 200 (legacy path)', async () => {
      const response = await request(app)
        .post('/api/search')
        .send({ query: 'pizza' });
      
      assert.equal(response.status, 200);
    });

    it('GET /api/search/stats should return 200 (legacy path)', async () => {
      const response = await request(app)
        .get('/api/search/stats');
      
      assert.equal(response.status, 200);
    });

    it('POST /api/analytics/events should return 200 (legacy path)', async () => {
      const response = await request(app)
        .post('/api/analytics/events')
        .send({ event: 'test_event', data: {} });
      
      assert.equal(response.status, 200);
    });

    it('GET /api/analytics/stats should return 200 (legacy path)', async () => {
      const response = await request(app)
        .get('/api/analytics/stats');
      
      assert.equal(response.status, 200);
    });

    it('POST /api/dialogue should not return 404 (legacy path)', async () => {
      const response = await request(app)
        .post('/api/dialogue')
        .send({ message: 'hello', sessionId: 'test-123' });
      
      // May return 400 for validation, but should not be 404
      assert.ok(response.status !== 404);
    });
  });

  describe('Deprecation headers on legacy routes', () => {
    it('should include Deprecation header on /api/search', async () => {
      const response = await request(app)
        .post('/api/search')
        .send({ query: 'pizza' });
      
      assert.equal(response.headers['deprecation'], 'true');
      assert.ok(response.headers['sunset']);
      assert.ok(response.headers['link']);
    });

    it('should NOT include Deprecation header on /api/v1/search', async () => {
      const response = await request(app)
        .post('/api/v1/search')
        .send({ query: 'pizza' });
      
      assert.equal(response.headers['deprecation'], undefined);
    });
  });

  describe('Response format consistency', () => {
    it('should return identical structure for v1 and legacy search', async () => {
      const payload = { query: 'pizza in tel aviv' };

      const v1Response = await request(app)
        .post('/api/v1/search')
        .send(payload);

      const legacyResponse = await request(app)
        .post('/api/search')
        .send(payload);

      // Should have same response structure (excluding headers)
      assert.deepEqual(
        Object.keys(v1Response.body).sort(),
        Object.keys(legacyResponse.body).sort()
      );
    });
  });

  describe('Health check remains unversioned', () => {
    it('GET /healthz should return 200', async () => {
      const response = await request(app).get('/healthz');
      assert.equal(response.status, 200);
      assert.equal(response.text, 'ok');
    });

    it('GET /api/healthz should return 404', async () => {
      const response = await request(app).get('/api/healthz');
      assert.equal(response.status, 404);
    });

    it('GET /api/v1/healthz should return 404', async () => {
      const response = await request(app).get('/api/v1/healthz');
      assert.equal(response.status, 404);
    });
  });

  describe('Dual-mount verification', () => {
    it('should serve /api/v1/search (canonical)', async () => {
      const response = await request(app)
        .post('/api/v1/search')
        .send({ query: 'pizza' })
        .expect(200);
      
      // Should have proper response structure
      assert.ok(response.body);
    });

    it('should serve /api/search (legacy, backward compatible)', async () => {
      const response = await request(app)
        .post('/api/search')
        .send({ query: 'pizza' })
        .expect(200);
      
      // Should work identically to v1
      assert.ok(response.body);
    });
  });

  describe('All endpoints available under v1', () => {
    it('should serve analytics endpoints under /api/v1', async () => {
      await request(app)
        .post('/api/v1/analytics/events')
        .send({ event: 'test' })
        .expect(200);

      await request(app)
        .get('/api/v1/analytics/stats')
        .expect(200);
    });

    it('should serve dialogue endpoints under /api/v1', async () => {
      await request(app)
        .get('/api/v1/dialogue/stats')
        .expect(200);
    });

    it('should serve legacy chat endpoints under /api/v1', async () => {
      // These still work but are deprecated
      const response = await request(app)
        .post('/api/v1/places/search')
        .send({ text: 'pizza' });
      
      // May return error for validation, but should not be 404
      assert.ok(response.status !== 404);
    });
  });

  describe('Non-existent routes', () => {
    it('should return 404 for unknown v1 routes', async () => {
      await request(app)
        .get('/api/v1/nonexistent')
        .expect(404);
    });

    it('should return 404 for unknown legacy routes', async () => {
      await request(app)
        .get('/api/nonexistent')
        .expect(404);
    });
  });
});
