import jwt from 'jsonwebtoken';
import request from 'supertest';
import { createApp } from '../src/app';
import { config } from '../src/config/env';
import { closeDatabase, createStaff, resetDatabase, TEST_PASSWORD, type TestStaff } from './helpers';

const app = createApp();

let staff: TestStaff;

beforeEach(async () => {
  await resetDatabase();
  staff = await createStaff('Staff One', 'staff1@example.com');
});

afterAll(closeDatabase);

describe('POST /api/auth/login', () => {
  it('logs in with valid credentials and returns a token and safe user data', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'staff1@example.com', password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token_type).toBe('Bearer');
    expect(typeof res.body.data.token).toBe('string');
    expect(res.body.data.user).toEqual({
      id: staff.user.id,
      name: 'Staff One',
      email: 'staff1@example.com',
      created_at: expect.any(String),
    });
    expect(JSON.stringify(res.body)).not.toContain('password_hash');

    // The token carries only the user id and email.
    const payload = jwt.verify(res.body.data.token, config.jwt.secret) as jwt.JwtPayload;
    expect(payload).toMatchObject({ userId: staff.user.id, email: 'staff1@example.com' });
  });

  it('treats the email case-insensitively and ignores surrounding spaces', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: '  Staff1@EXAMPLE.com ', password: TEST_PASSWORD });

    expect(res.status).toBe(200);
  });

  it('rejects an incorrect password with 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'staff1@example.com', password: 'WrongPassword!' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, message: 'Invalid email or password', errors: [] });
  });

  it('gives an unknown email the same response as a wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: TEST_PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid email or password');
  });

  it('rejects missing or malformed login data with 400 and field errors', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation failed');
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        { field: 'email', message: 'Email must be a valid email address' },
        { field: 'password', message: 'Password is required' },
      ]),
    );
  });
});

describe('Request body handling', () => {
  it('rejects a non-JSON body with 415', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .type('form')
      .send(`email=staff1@example.com&password=${TEST_PASSWORD}`);

    expect(res.status).toBe(415);
    expect(res.body.message).toBe('Content-Type must be application/json');
  });

  it('treats an empty body as missing fields (400), not as an unsupported type', async () => {
    const res = await request(app).post('/api/auth/login');

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation failed');
  });

  it('rejects malformed JSON with 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ');

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Request body contains invalid JSON');
  });
});

describe('Protected route GET /api/auth/me', () => {
  it('returns the authenticated staff member for a valid token', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', staff.auth);

    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({ id: staff.user.id, email: 'staff1@example.com' });
    expect(res.body.data.user).not.toHaveProperty('password_hash');
  });

  it('rejects a request without a token with 401', async () => {
    const res = await request(app).get('/api/auth/me');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/Authentication required/);
  });

  it.each([
    ['a malformed token', 'Bearer not.a.real-token'],
    ['a token signed with a different secret', `Bearer ${jwt.sign({ userId: 1, email: 'staff1@example.com' }, 'a-different-secret-that-is-long-enough')}`],
    ['the wrong authorization scheme', 'Basic dXNlcjpwYXNz'],
  ])('rejects %s with 401', async (_label, header) => {
    const res = await request(app).get('/api/auth/me').set('Authorization', header);

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('rejects a correctly signed token whose payload is not what we issue', async () => {
    const token = jwt.sign({ sub: 'someone' }, config.jwt.secret, { algorithm: 'HS256' });
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid token');
  });

  it('rejects an expired token with 401 "Token has expired"', async () => {
    const expired = jwt.sign(
      { userId: staff.user.id, email: staff.user.email, exp: Math.floor(Date.now() / 1000) - 60 },
      config.jwt.secret,
      { algorithm: 'HS256' },
    );
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${expired}`);

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Token has expired');
  });
});
