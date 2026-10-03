/**
 * Integration tests — a real NestJS app, driven over real HTTP with supertest.
 *
 * External dependencies (Postgres, Redis, the Python services) are replaced with
 * in-memory fakes, but everything in between is the real thing: the global
 * ValidationPipe, the JWT guard and strategy, real bcrypt hashing, real routing.
 * That is the layer the per-service unit tests cannot reach.
 */

// Must be set before the module graph is built: JwtStrategy validates this at
// construction and refuses to start without it.
process.env.JWT_SECRET = 'integration-test-secret-at-least-32-chars-long';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as request from 'supertest';

import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { LeadsController } from '../src/leads/leads.controller';
import { LeadsService } from '../src/leads/leads.service';
import { AiService } from '../src/ai/ai.service';
import { User } from '../src/database/entities/user.entity';
import { Subscription } from '../src/database/entities/subscription.entity';
import { Lead } from '../src/database/entities/lead.entity';

/** Minimal in-memory stand-in for a TypeORM repository. */
function createFakeRepo<T extends { id?: string }>(seed: T[] = []) {
  let rows: any[] = [...seed];
  let nextId = 1;

  const matches = (row: any, where: any) =>
    Object.entries(where || {}).every(([k, v]) => row[k] === v);

  return {
    _rows: () => rows,
    _reset: (next: T[] = []) => { rows = [...next]; nextId = 1; },

    create: jest.fn((data: any) => ({ ...data })),
    save: jest.fn(async (entity: any) => {
      const row = { ...entity, id: entity.id ?? `id-${nextId++}` };
      const i = rows.findIndex(r => r.id === row.id);
      if (i >= 0) rows[i] = row; else rows.push(row);
      return row;
    }),
    findOne: jest.fn(async ({ where }: any) => rows.find(r => matches(r, where)) ?? null),
    find: jest.fn(async ({ where }: any = {}) => rows.filter(r => matches(r, where))),
    update: jest.fn(async (criteria: any, patch: any) => {
      const where = typeof criteria === 'string' ? { id: criteria } : criteria;
      const hits = rows.filter(r => matches(r, where));
      hits.forEach(r => Object.assign(r, patch));
      return { affected: hits.length };
    }),
    delete: jest.fn(async (criteria: any) => {
      const where = typeof criteria === 'string' ? { id: criteria } : criteria;
      const before = rows.length;
      rows = rows.filter(r => !matches(r, where));
      return { affected: before - rows.length };
    }),
    increment: jest.fn(),
    createQueryBuilder: jest.fn(() => {
      const conditions: any[] = [];
      const qb: any = {
        where: (_s: string, params: any) => { conditions.push(params); return qb; },
        andWhere: (_s: string, params: any) => { conditions.push(params); return qb; },
        orderBy: () => qb,
        limit: () => qb,
        getMany: async () =>
          rows.filter(r =>
            conditions.every(c =>
              Object.entries(c).every(([k, v]) =>
                k === 'ids' ? (v as string[]).includes(r.id) : r[k] === v,
              ),
            ),
          ),
      };
      return qb;
    }),
  };
}

const mockAiService = {
  scrapeLeads: jest.fn().mockResolvedValue([]),
  scoreLead: jest.fn().mockResolvedValue(50),
};

describe('API integration', () => {
  let app: INestApplication;
  let userRepo: ReturnType<typeof createFakeRepo>;
  let subRepo: ReturnType<typeof createFakeRepo>;
  let leadRepo: ReturnType<typeof createFakeRepo>;
  // @types/supertest v6 returns TestAgent, not SuperTest - infer it.
  let http: () => ReturnType<typeof request>;

  beforeAll(async () => {
    userRepo = createFakeRepo();
    subRepo = createFakeRepo();
    leadRepo = createFakeRepo();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        PassportModule,
        JwtModule.register({
          secret: process.env.JWT_SECRET,
          signOptions: { expiresIn: '1h' },
        }),
      ],
      controllers: [AuthController, LeadsController],
      providers: [
        AuthService,
        JwtStrategy,
        LeadsService,
        { provide: AiService, useValue: mockAiService },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(Subscription), useValue: subRepo },
        { provide: getRepositoryToken(Lead), useValue: leadRepo },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Mirror main.ts so the tests exercise the real request pipeline.
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    app.setGlobalPrefix('api');
    await app.init();

    http = () => request(app.getHttpServer());
  });

  afterAll(async () => {
    await app?.close();
  });

  const registerUser = async (email: string) => {
    const res = await http()
      .post('/api/auth/register')
      .send({ email, password: 'correct-horse', businessName: 'Biz' })
      .expect(201);
    return res.body.token as string;
  };

  // ─── auth ──────────────────────────────────────────────────────────────────

  describe('POST /api/auth/register', () => {
    it('creates a user and returns a signed token', async () => {
      const res = await http()
        .post('/api/auth/register')
        .send({ email: 'new@test.com', password: 'secret123', businessName: 'Acme' })
        .expect(201);

      expect(typeof res.body.token).toBe('string');
      expect(res.body.user.email).toBe('new@test.com');
      // The password must never come back over the wire, hashed or otherwise.
      expect(JSON.stringify(res.body)).not.toContain('secret123');
      expect(res.body.user.passwordHash).toBeUndefined();
    });

    it('stores the password as a bcrypt hash, not plaintext', async () => {
      await http()
        .post('/api/auth/register')
        .send({ email: 'hash@test.com', password: 'plaintext1', businessName: 'H' })
        .expect(201);

      const stored = userRepo._rows().find((u: any) => u.email === 'hash@test.com');
      expect(stored.passwordHash).toMatch(/^\$2[aby]\$/);
      expect(stored.passwordHash).not.toBe('plaintext1');
    });

    it('rejects a duplicate email with 409', async () => {
      await http()
        .post('/api/auth/register')
        .send({ email: 'dup@test.com', password: 'pw12345678', businessName: 'D' })
        .expect(201);

      await http()
        .post('/api/auth/register')
        .send({ email: 'dup@test.com', password: 'pw12345678', businessName: 'D' })
        .expect(409);
    });
  });

  describe('POST /api/auth/login', () => {
    it('returns a token for correct credentials', async () => {
      await registerUser('login@test.com');

      const res = await http()
        .post('/api/auth/login')
        .send({ email: 'login@test.com', password: 'correct-horse' })
        .expect(201);

      expect(typeof res.body.token).toBe('string');
    });

    it('rejects a wrong password with 401', async () => {
      await registerUser('wrongpw@test.com');

      await http()
        .post('/api/auth/login')
        .send({ email: 'wrongpw@test.com', password: 'not-it' })
        .expect(401);
    });

    it('returns the same 401 for an unknown email (no user enumeration)', async () => {
      const res = await http()
        .post('/api/auth/login')
        .send({ email: 'ghost@test.com', password: 'whatever' })
        .expect(401);

      expect(res.body.message).toBe('Invalid credentials');
    });
  });

  // ─── JWT guard ─────────────────────────────────────────────────────────────

  describe('JwtAuthGuard', () => {
    it('rejects a request with no Authorization header', async () => {
      await http().get('/api/auth/me').expect(401);
    });

    it('rejects a malformed token', async () => {
      await http().get('/api/auth/me').set('Authorization', 'Bearer not.a.jwt').expect(401);
    });

    it('rejects a token signed with the wrong secret', async () => {
      const { JwtService } = await import('@nestjs/jwt');
      const forged = new JwtService({ secret: 'a-different-secret-entirely-abcdef' })
        .sign({ sub: 'attacker', email: 'attacker@test.com' });

      await http().get('/api/auth/me').set('Authorization', `Bearer ${forged}`).expect(401);
    });

    it('accepts a valid token and returns the profile', async () => {
      const token = await registerUser('me@test.com');

      const res = await http()
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.email).toBe('me@test.com');
    });
  });

  // ─── tenant isolation, over real HTTP ──────────────────────────────────────
  // These cover the IDOR fix: single-lead routes are scoped by owner, so one
  // tenant cannot read, mutate or delete another tenant's lead by guessing a id.

  describe('lead ownership', () => {
    let aliceToken: string;
    let bobToken: string;
    let aliceLeadId: string;

    beforeAll(async () => {
      aliceToken = await registerUser('alice@test.com');
      bobToken = await registerUser('bob@test.com');

      const alice = userRepo._rows().find((u: any) => u.email === 'alice@test.com');
      const saved = await leadRepo.save({
        userId: alice.id, firstName: 'Private', lastName: 'Lead',
        email: 'private@lead.com', status: 'new', score: 90,
      });
      aliceLeadId = saved.id;
    });

    it('lets the owner read their own lead', async () => {
      const res = await http()
        .get(`/api/leads/${aliceLeadId}`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .expect(200);

      expect(res.body.firstName).toBe('Private');
    });

    it("404s when another tenant reads it, leaking nothing", async () => {
      const res = await http()
        .get(`/api/leads/${aliceLeadId}`)
        .set('Authorization', `Bearer ${bobToken}`)
        .expect(404);

      expect(JSON.stringify(res.body)).not.toContain('private@lead.com');
    });

    it('404s and changes nothing when another tenant updates it', async () => {
      await http()
        .put(`/api/leads/${aliceLeadId}`)
        .set('Authorization', `Bearer ${bobToken}`)
        .send({ status: 'converted' })
        .expect(404);

      const row = leadRepo._rows().find((l: any) => l.id === aliceLeadId);
      expect(row.status).toBe('new');
    });

    it('404s and keeps the row when another tenant deletes it', async () => {
      await http()
        .delete(`/api/leads/${aliceLeadId}`)
        .set('Authorization', `Bearer ${bobToken}`)
        .expect(404);

      expect(leadRepo._rows().some((l: any) => l.id === aliceLeadId)).toBe(true);
    });

    it('only lists the requesting tenant’s own leads', async () => {
      const res = await http()
        .get('/api/leads')
        .set('Authorization', `Bearer ${bobToken}`)
        .expect(200);

      expect(res.body.every((l: any) => l.firstName !== 'Private')).toBe(true);
    });

    it('ignores an attempt to reassign a lead to another user via the body', async () => {
      const bob = userRepo._rows().find((u: any) => u.email === 'bob@test.com');

      await http()
        .put(`/api/leads/${aliceLeadId}`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ status: 'contacted', userId: bob.id })
        .expect(200);

      const row = leadRepo._rows().find((l: any) => l.id === aliceLeadId);
      expect(row.status).toBe('contacted');
      expect(row.userId).not.toBe(bob.id);
    });

    it('lets the owner delete their own lead', async () => {
      await http()
        .delete(`/api/leads/${aliceLeadId}`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .expect(200);

      expect(leadRepo._rows().some((l: any) => l.id === aliceLeadId)).toBe(false);
    });
  });

  // ─── protected routes ──────────────────────────────────────────────────────

  describe('route protection', () => {
    it.each([
      ['get', '/api/leads'],
      ['post', '/api/leads/scrape'],
      ['post', '/api/leads/import'],
    ])('%s %s requires authentication', async (method, path) => {
      await (http() as any)[method](path).send({}).expect(401);
    });
  });
});
