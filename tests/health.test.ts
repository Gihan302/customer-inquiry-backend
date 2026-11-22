import request from 'supertest';
import { createApp } from '../src/app';

describe('GET /api/health', () => {
  it('returns 200 with the standard success envelope', async () => {
    const res = await request(createApp()).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, message: 'API is running', data: {} });
  });
});
