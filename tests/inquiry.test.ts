import request from 'supertest';
import { createApp } from '../src/app';
import * as inquiryRepository from '../src/repositories/inquiry.repository';
import type { InquiryRecord } from '../src/types';
import { closeDatabase, createStaff, resetDatabase, type TestStaff } from './helpers';

const app = createApp();

// Staff A creates inquiries; Staff B is "another staff member".
let staffA: TestStaff;
let staffB: TestStaff;

const validInquiry = {
  customer_name: 'John Silva',
  contact_info: '0771234567',
  subject: 'Service Inquiry',
  description: 'Customer wants information about the service.',
};

async function createInquiry(
  staff: TestStaff,
  overrides: Record<string, unknown> = {},
): Promise<InquiryRecord> {
  const res = await request(app)
    .post('/api/inquiries')
    .set('Authorization', staff.auth)
    .send({ ...validInquiry, ...overrides });
  expect(res.status).toBe(201);
  return res.body.data.inquiry as InquiryRecord;
}

const setStatus = (staff: TestStaff, id: number, status: string) =>
  request(app).patch(`/api/inquiries/${id}/status`).set('Authorization', staff.auth).send({ status });

beforeEach(async () => {
  await resetDatabase();
  staffA = await createStaff('Staff One', 'staff1@example.com');
  staffB = await createStaff('Staff Two', 'staff2@example.com');
});

afterAll(closeDatabase);

describe('Authentication on inquiry endpoints', () => {
  it.each([
    ['GET', '/api/inquiries'],
    ['POST', '/api/inquiries'],
    ['GET', '/api/inquiries/1'],
    ['PUT', '/api/inquiries/1'],
    ['PATCH', '/api/inquiries/1/status'],
  ])('%s %s requires a token', async (method, url) => {
    const res = await request(app)[method.toLowerCase() as 'get'](url);
    expect(res.status).toBe(401);
  });
});

describe('POST /api/inquiries (create)', () => {
  it('creates a valid inquiry with status New, visibility Public and the creator from the JWT', async () => {
    const res = await request(app)
      .post('/api/inquiries')
      .set('Authorization', staffA.auth)
      .send(validInquiry);

    expect(res.status).toBe(201);
    expect(res.body.message).toBe('Inquiry created successfully');
    expect(res.body.data.inquiry).toMatchObject({
      ...validInquiry,
      status: 'New',
      visibility: 'Public',
      created_by: staffA.user.id,
    });
  });

  it('rejects an inquiry with missing required information', async () => {
    const res = await request(app)
      .post('/api/inquiries')
      .set('Authorization', staffA.auth)
      .send({ customer_name: '   ', contact_info: 'not a phone or email' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation failed');
    const fields = res.body.errors.map((e: { field: string }) => e.field);
    expect(fields).toEqual(
      expect.arrayContaining(['customer_name', 'contact_info', 'subject', 'description']),
    );
    expect(res.body.errors).toContainEqual({
      field: 'contact_info',
      message: 'Contact info must be a valid email address or phone number',
    });
  });

  it('refuses client-supplied created_by and status instead of trusting them', async () => {
    const res = await request(app)
      .post('/api/inquiries')
      .set('Authorization', staffA.auth)
      .send({ ...validInquiry, created_by: staffB.user.id, status: 'Resolved' });

    expect(res.status).toBe(400);
    expect(res.body.errors[0].message).toMatch(/Unknown field\(s\): created_by, status/);
  });
});

describe('Public / Private visibility', () => {
  it('lets any staff member retrieve Public inquiries', async () => {
    const publicInquiry = await createInquiry(staffA);

    const list = await request(app).get('/api/inquiries').set('Authorization', staffB.auth);
    expect(list.status).toBe(200);
    expect(list.body.data.inquiries.map((i: InquiryRecord) => i.id)).toContain(publicInquiry.id);

    const single = await request(app)
      .get(`/api/inquiries/${publicInquiry.id}`)
      .set('Authorization', staffB.auth);
    expect(single.status).toBe(200);
    expect(single.body.data.inquiry.id).toBe(publicInquiry.id);
  });

  it("prevents another staff member from viewing a Private inquiry, even by direct URL (Situation 3)", async () => {
    const privateInquiry = await createInquiry(staffA, { visibility: 'Private', subject: 'Confidential' });

    // Not in B's dashboard list, not even when filtering or searching for it.
    for (const query of ['', '?visibility=Private', '?search=Confidential']) {
      const list = await request(app).get(`/api/inquiries${query}`).set('Authorization', staffB.auth);
      expect(list.body.data.inquiries).toHaveLength(0);
      expect(list.body.data.pagination.total).toBe(0);
    }

    // Typing the id into the URL: 404, indistinguishable from an id that does not exist.
    const direct = await request(app)
      .get(`/api/inquiries/${privateInquiry.id}`)
      .set('Authorization', staffB.auth);
    const missing = await request(app).get('/api/inquiries/999999').set('Authorization', staffB.auth);

    expect(direct.status).toBe(404);
    expect(direct.body).toEqual(missing.body);
    expect(JSON.stringify(direct.body)).not.toContain('Confidential');
  });

  it('allows the creator to view their own Private inquiry', async () => {
    const privateInquiry = await createInquiry(staffA, { visibility: 'Private' });

    const single = await request(app)
      .get(`/api/inquiries/${privateInquiry.id}`)
      .set('Authorization', staffA.auth);
    expect(single.status).toBe(200);
    expect(single.body.data.inquiry).toMatchObject({ id: privateInquiry.id, visibility: 'Private' });

    const list = await request(app).get('/api/inquiries').set('Authorization', staffA.auth);
    expect(list.body.data.inquiries.map((i: InquiryRecord) => i.id)).toContain(privateInquiry.id);
  });
});

describe('PUT /api/inquiries/:id (update)', () => {
  const edits = {
    customer_name: 'John Silva',
    contact_info: 'john@example.com',
    subject: 'Updated subject',
    description: 'Updated description.',
  };

  it('allows any staff member to update a Public inquiry and moves updated_at forward', async () => {
    const inquiry = await createInquiry(staffA);

    const res = await request(app)
      .put(`/api/inquiries/${inquiry.id}`)
      .set('Authorization', staffB.auth)
      .send(edits);

    expect(res.status).toBe(200);
    expect(res.body.data.inquiry).toMatchObject({ ...edits, created_by: staffA.user.id });
    expect(new Date(res.body.data.inquiry.updated_at).getTime()).toBeGreaterThan(
      new Date(inquiry.updated_at).getTime(),
    );
  });

  it("prevents updating another user's Private inquiry and leaves it unchanged", async () => {
    const privateInquiry = await createInquiry(staffA, { visibility: 'Private' });

    const update = await request(app)
      .put(`/api/inquiries/${privateInquiry.id}`)
      .set('Authorization', staffB.auth)
      .send(edits);
    expect(update.status).toBe(404);

    const status = await setStatus(staffB, privateInquiry.id, 'In Progress');
    expect(status.status).toBe(404);

    const reloaded = await request(app)
      .get(`/api/inquiries/${privateInquiry.id}`)
      .set('Authorization', staffA.auth);
    expect(reloaded.body.data.inquiry).toMatchObject({ subject: validInquiry.subject, status: 'New' });
  });

  it('does not allow changing status, visibility or created_by through PUT', async () => {
    const inquiry = await createInquiry(staffA);

    for (const extra of [{ status: 'Resolved' }, { visibility: 'Private' }, { created_by: staffB.user.id }]) {
      const res = await request(app)
        .put(`/api/inquiries/${inquiry.id}`)
        .set('Authorization', staffA.auth)
        .send({ ...edits, ...extra });
      expect(res.status).toBe(400);
    }
  });

  it('returns 409 when expected_updated_at is stale (another tab saved first)', async () => {
    const inquiry = await createInquiry(staffA);

    // Tab 1 saves using the version it loaded.
    const first = await request(app)
      .put(`/api/inquiries/${inquiry.id}`)
      .set('Authorization', staffA.auth)
      .send({ ...edits, expected_updated_at: inquiry.updated_at });
    expect(first.status).toBe(200);

    // Tab 2 still holds the old version and tries to save.
    const stale = await request(app)
      .put(`/api/inquiries/${inquiry.id}`)
      .set('Authorization', staffA.auth)
      .send({ ...edits, subject: 'From stale tab', expected_updated_at: inquiry.updated_at });
    expect(stale.status).toBe(409);
    expect(stale.body.message).toMatch(/changed by someone else/);
  });
});

describe('PATCH /api/inquiries/:id/status (status transitions)', () => {
  it('allows New -> In Progress -> Resolved -> In Progress (reopen)', async () => {
    const inquiry = await createInquiry(staffA);

    for (const status of ['In Progress', 'Resolved', 'In Progress']) {
      const res = await setStatus(staffB, inquiry.id, status);
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Inquiry status updated successfully');
      expect(res.body.data.inquiry.status).toBe(status);
    }
  });

  it('allows keeping the current status without a change', async () => {
    const inquiry = await createInquiry(staffA);

    const res = await setStatus(staffA, inquiry.id, 'New');
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Inquiry status unchanged');
    expect(res.body.data.inquiry.updated_at).toBe(inquiry.updated_at);
  });

  it.each([
    [[], 'Resolved', 'New'],
    [['In Progress'], 'New', 'In Progress'],
    [['In Progress', 'Resolved'], 'New', 'Resolved'],
  ])('rejects invalid transitions (after %j, -> %s)', async (steps, target, current) => {
    const inquiry = await createInquiry(staffA);
    for (const step of steps) {
      expect((await setStatus(staffA, inquiry.id, step)).status).toBe(200);
    }

    const res = await setStatus(staffA, inquiry.id, target);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid status transition');
    expect(res.body.errors).toEqual([
      { field: 'status', message: `Cannot change status from '${current}' to '${target}'` },
    ]);
  });

  it('rejects a status that does not exist', async () => {
    const inquiry = await createInquiry(staffA);

    const res = await setStatus(staffA, inquiry.id, 'Closed');
    expect(res.status).toBe(400);
    expect(res.body.errors[0].field).toBe('status');
  });

  it('returns 409 instead of overwriting when the status changed between read and write', async () => {
    const inquiry = await createInquiry(staffA);
    // Another request moves it to In Progress...
    expect((await setStatus(staffB, inquiry.id, 'In Progress')).status).toBe(200);

    // ...but this request read it just before that happened (simulated stale read: status 'New').
    jest.spyOn(inquiryRepository, 'findAccessibleById').mockResolvedValueOnce({
      ...inquiry,
      created_at: new Date(inquiry.created_at),
      updated_at: new Date(inquiry.updated_at),
      status: 'New',
    });

    const res = await setStatus(staffA, inquiry.id, 'In Progress');
    expect(res.status).toBe(409);

    // The database still holds the other request's change.
    const reloaded = await request(app).get(`/api/inquiries/${inquiry.id}`).set('Authorization', staffA.auth);
    expect(reloaded.body.data.inquiry.status).toBe('In Progress');
  });
});

describe('Invalid and unknown inquiry IDs', () => {
  it.each(['abc', '0', '-5', '1.5', '1e3', '99999999999999999999'])(
    'rejects id "%s" with 400',
    async (badId) => {
      const res = await request(app).get(`/api/inquiries/${badId}`).set('Authorization', staffA.auth);
      expect(res.status).toBe(400);
      expect(res.body.errors).toEqual([{ field: 'id', message: 'Inquiry ID must be a positive integer' }]);
    },
  );

  it('rejects an invalid id on update and status endpoints too', async () => {
    const put = await request(app)
      .put('/api/inquiries/abc')
      .set('Authorization', staffA.auth)
      .send(validInquiry);
    const patch = await setStatus(staffA, Number.NaN, 'Resolved');

    expect(put.status).toBe(400);
    expect(patch.status).toBe(400);
  });

  it('returns 404 for a well-formed id that does not exist', async () => {
    const res = await request(app).get('/api/inquiries/424242').set('Authorization', staffA.auth);
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Inquiry not found');
  });
});

describe('GET /api/inquiries (search, filters, pagination)', () => {
  beforeEach(async () => {
    // Created oldest -> newest.
    await createInquiry(staffA, { customer_name: 'Amal Perera', subject: 'Billing question' });
    await createInquiry(staffA, { customer_name: 'Kamal Silva', subject: 'Asking for 50% off' });
    const third = await createInquiry(staffB, { customer_name: 'Nimal Fernando', subject: 'Delivery delay' });
    await setStatus(staffB, third.id, 'In Progress');
  });

  it('returns newest first with pagination metadata', async () => {
    const res = await request(app).get('/api/inquiries?page=1&limit=2').set('Authorization', staffA.auth);

    expect(res.status).toBe(200);
    expect(res.body.data.inquiries.map((i: InquiryRecord) => i.customer_name)).toEqual([
      'Nimal Fernando',
      'Kamal Silva',
    ]);
    expect(res.body.data.pagination).toEqual({ page: 1, limit: 2, total: 3, total_pages: 2 });

    const page2 = await request(app).get('/api/inquiries?page=2&limit=2').set('Authorization', staffA.auth);
    expect(page2.body.data.inquiries.map((i: InquiryRecord) => i.customer_name)).toEqual(['Amal Perera']);
  });

  it('searches customer name and subject case-insensitively', async () => {
    const byName = await request(app).get('/api/inquiries?search=kamal').set('Authorization', staffA.auth);
    expect(byName.body.data.inquiries.map((i: InquiryRecord) => i.customer_name)).toEqual(['Kamal Silva']);

    const bySubject = await request(app).get('/api/inquiries?search=DELIVERY').set('Authorization', staffA.auth);
    expect(bySubject.body.data.inquiries.map((i: InquiryRecord) => i.customer_name)).toEqual(['Nimal Fernando']);
  });

  it('treats % in a search literally and SQL-like input as plain text', async () => {
    const percent = await request(app)
      .get(`/api/inquiries?search=${encodeURIComponent('50%')}`)
      .set('Authorization', staffA.auth);
    expect(percent.body.data.inquiries).toHaveLength(1);

    const injection = await request(app)
      .get(`/api/inquiries?search=${encodeURIComponent("' OR 1=1 --")}`)
      .set('Authorization', staffA.auth);
    expect(injection.status).toBe(200);
    expect(injection.body.data.pagination.total).toBe(0);
  });

  it('filters by status', async () => {
    const res = await request(app).get('/api/inquiries?status=In%20Progress').set('Authorization', staffA.auth);
    expect(res.body.data.inquiries.map((i: InquiryRecord) => i.customer_name)).toEqual(['Nimal Fernando']);
  });

  it.each(['page=0', 'limit=101', 'limit=abc', 'status=Closed', 'visibility=Hidden'])(
    'rejects invalid query "%s" with 400',
    async (query) => {
      const res = await request(app).get(`/api/inquiries?${query}`).set('Authorization', staffA.auth);
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Validation failed');
    },
  );
});
