import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";

type AnyRecord = Record<string, any>;
type Where = AnyRecord | undefined;

function normalizePrivateKey(value?: string): string | undefined {
  if (!value) return undefined;
  let key = value.trim();

  // Accept a directly supplied PEM, literal \\n sequences, or an accidentally
  // pasted service-account JSON object. Never log the credential.
  if (key.startsWith("{")) {
    try {
      const parsed = JSON.parse(key) as { private_key?: unknown };
      if (typeof parsed.private_key === "string") key = parsed.private_key;
    } catch {
      // Fall through to the normal PEM validation path.
    }
  }

  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1);
  }

  key = key.replace(/\\\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\\"/g, '"');
  key = key.replace(/\\r/g, "").trim();

  return key || undefined;
}
function firebaseDb(): Firestore {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Firestore is not configured. Add FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY.");
  }
  const app = getApps()[0] ?? initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  return getFirestore(app);
}

const collections = {
  user: "users",
  xAccount: "xAccounts",
  batch: "batches",
  post: "posts",
  postAnalysis: "postAnalyses",
  replyGeneration: "replyGenerations",
  replyAttempt: "replyAttempts",
  publishingJob: "publishingJobs",
  voiceProfile: "voiceProfiles",
  settings: "settings",
  auditLog: "auditLogs",
} as const;

function now() { return new Date(); }

function revive(value: any): any {
  if (value && typeof value.toDate === "function") return value.toDate();
  if (Array.isArray(value)) return value.map(revive);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, revive(v)]));
  return value;
}

function clean(value: any): any {
  if (value === undefined) return undefined;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).map(([k, v]) => [k, clean(v)]));
  return value;
}

function comparable(value: any): any {
  if (value instanceof Date) return value.getTime();
  if (value && typeof value.toDate === "function") return value.toDate().getTime();
  return value;
}

function matches(value: any, condition: any): boolean {
  if (condition && typeof condition === "object" && !(condition instanceof Date)) {
    if ("in" in condition) return condition.in.includes(value);
    if ("notIn" in condition) return !condition.notIn.includes(value);
    if ("not" in condition) return value !== condition.not;
    if ("lt" in condition) return comparable(value) < comparable(condition.lt);
    if ("lte" in condition) return comparable(value) <= comparable(condition.lte);
    if ("gt" in condition) return comparable(value) > comparable(condition.gt);
    if ("gte" in condition) return comparable(value) >= comparable(condition.gte);
  }
  return comparable(value) === comparable(condition);
}

function matchesWhere(data: AnyRecord, where: Where): boolean {
  if (!where) return true;
  if (where.OR && Array.isArray(where.OR) && !where.OR.some((x: Where) => matchesWhere(data, x))) return false;
  if (where.AND && Array.isArray(where.AND) && !where.AND.every((x: Where) => matchesWhere(data, x))) return false;
  for (const [key, condition] of Object.entries(where)) {
    if (key === "OR" || key === "AND") continue;
    if (!matches(data[key], condition)) return false;
  }
  return true;
}

function applySelect(data: AnyRecord, select?: AnyRecord): AnyRecord {
  if (!select) return { ...data };
  const out: AnyRecord = {};
  for (const [key, enabled] of Object.entries(select)) {
    if (enabled === true) out[key] = data[key];
  }
  return out;
}

function applyOrder(rows: AnyRecord[], orderBy: AnyRecord | AnyRecord[] | undefined) {
  const orders = Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : [];
  return [...rows].sort((a, b) => {
    for (const order of orders) {
      const [field, direction] = Object.entries(order)[0] ?? [];
      if (!field) continue;
      const av = comparable(a[field]) ?? 0;
      const bv = comparable(b[field]) ?? 0;
      if (av === bv) continue;
      const n = av > bv ? 1 : -1;
      return direction === "desc" ? -n : n;
    }
    return 0;
  });
}

function incrementValues(data: AnyRecord, current: AnyRecord): AnyRecord {
  const out = { ...data };
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === "object" && "increment" in value) {
      out[key] = Number(current[key] ?? 0) + Number(value.increment ?? 0);
    }
  }
  return out;
}

function defaults(model: keyof typeof collections, data: AnyRecord): AnyRecord {
  const n = now();
  const base = { id: data.id ?? randomUUID(), createdAt: data.createdAt ?? n, updatedAt: data.updatedAt ?? n };
  if (model === "user") return base;
  if (model === "batch") return { ...base, label: null, imported: 0, valid: 0, duplicates: 0, invalid: 0, status: "PROCESSING", ...data };
  if (model === "post") return { ...base, status: "PROCESSING", approvalStatus: "PENDING", repetitionChecked: false, attempts: 0, ...data };
  if (model === "publishingJob") return { ...base, status: "PENDING", attempts: 0, ...data };
  if (model === "voiceProfile") return { ...base, tone: "conversational", personality: "curious, useful, concise", preferredLength: "10-30 words", emojiUsage: "rare", professional: 50, ...data };
  if (model === "settings") return { ...base, qualityThreshold: 80, publishingMode: "review", autoPublish: false, maxRetries: 3, ...data };
  return { ...base, ...data };
}

async function rawRows(model: keyof typeof collections): Promise<AnyRecord[]> {
  const snap = await firebaseDb().collection(collections[model]).get();
  return snap.docs.map((d) => ({ id: d.id, ...revive(d.data()) }));
}

async function findRows(model: keyof typeof collections, where?: Where): Promise<AnyRecord[]> {
  return (await rawRows(model)).filter((row) => matchesWhere(row, where));
}

async function related(row: AnyRecord, model: keyof typeof collections, include?: AnyRecord): Promise<AnyRecord> {
  if (!include) return row;
  const out = { ...row };
  for (const [relation, options] of Object.entries(include)) {
    if (model === "user" && relation === "xAccount") {
      const x = (await findRows("xAccount", { userId: row.id }))[0];
      out.xAccount = x ? applySelect(x, (options as AnyRecord)?.select) : null;
    } else if (model === "user" && relation === "voiceProfile") {
      const v = (await findRows("voiceProfile", { userId: row.id }))[0];
      out.voiceProfile = v ? applySelect(v, (options as AnyRecord)?.select) : null;
    } else if (model === "user" && relation === "settings") {
      const s = (await findRows("settings", { userId: row.id }))[0];
      out.settings = s ? applySelect(s, (options as AnyRecord)?.select) : null;
    } else if (model === "post" && relation === "user") {
      const u = (await findRows("user", { id: row.userId }))[0];
      out.user = u ? await related(u, "user", (options as AnyRecord)?.include) : null;
    } else if (model === "batch" && relation === "posts") {
      let posts = await findRows("post", { batchId: row.id });
      const opts = options as AnyRecord;
      posts = applyOrder(posts, opts?.orderBy);
      if (opts?.take) posts = posts.slice(0, opts.take);
      out.posts = posts.map((p) => applySelect(p, opts?.select));
    } else if (model === "post" && relation === "analysisRecord") {
      const a = (await findRows("postAnalysis", { postId: row.id }))[0];
      out.analysisRecord = a ?? null;
    }
  }
  return out;
}

function modelApi(model: keyof typeof collections) {
  return {
    async findUnique(args: AnyRecord = {}) {
      const rows = await findRows(model, args.where);
      const row = rows[0];
      return row ? related(applySelect(row, args.select), model, args.include) : null;
    },
    async findFirst(args: AnyRecord = {}) {
      let rows = await findRows(model, args.where);
      rows = applyOrder(rows, args.orderBy);
      const row = rows[0];
      return row ? related(applySelect(row, args.select), model, args.include) : null;
    },
    async findMany(args: AnyRecord = {}) {
      let rows = await findRows(model, args.where);
      rows = applyOrder(rows, args.orderBy);
      if (args.skip) rows = rows.slice(args.skip);
      if (args.take !== undefined) rows = rows.slice(0, args.take);
      const out = [];
      for (const row of rows) out.push(await related(applySelect(row, args.select), model, args.include));
      return out;
    },
    async count(args: AnyRecord = {}) {
      return (await findRows(model, args.where)).length;
    },
    async create(args: AnyRecord) {
      let data = { ...args.data };
      if (model === "xAccount" && data.user?.create) {
        const user = await (db.user as any).create({ data: data.user.create });
        data.userId = user.id;
        delete data.user;
      }
      const row = defaults(model, data);
      await firebaseDb().collection(collections[model]).doc(row.id).set(clean(row));
      return row;
    },
    async createMany(args: AnyRecord) {
      const rows = Array.isArray(args.data) ? args.data : [];
      const created: AnyRecord[] = [];
      for (let start = 0; start < rows.length; start += 450) {
        const chunk = rows.slice(start, start + 450);
        const batch = firebaseDb().batch();
        for (const item of chunk) {
          const row = defaults(model, item);
          batch.set(firebaseDb().collection(collections[model]).doc(row.id), clean(row));
          created.push(row);
        }
        await batch.commit();
      }
      return { count: created.length };
    },
    async update(args: AnyRecord) {
      const current = (await findRows(model, args.where))[0];
      if (!current) throw new Error(`Record not found in ${model}.`);
      const data = incrementValues(args.data, current);
      for (const [key, value] of Object.entries(data)) if (value && typeof value === "object" && "increment" in value) data[key] = Number(current[key] ?? 0) + Number(value.increment ?? 0);
      const row = { ...current, ...data, updatedAt: now() };
      await firebaseDb().collection(collections[model]).doc(current.id).set(clean(row));
      return row;
    },
    async updateMany(args: AnyRecord) {
      const rows = await findRows(model, args.where);
      for (const current of rows) {
        const data = incrementValues(args.data, current);
        const row = { ...current, ...data, updatedAt: now() };
        await firebaseDb().collection(collections[model]).doc(current.id).set(clean(row));
      }
      return { count: rows.length };
    },
    async deleteMany(args: AnyRecord = {}) {
      const rows = await findRows(model, args.where);
      for (const row of rows) await firebaseDb().collection(collections[model]).doc(row.id).delete();
      return { count: rows.length };
    },
    async upsert(args: AnyRecord) {
      const existing = (await findRows(model, args.where))[0];
      if (existing) {
        const data = incrementValues(args.update ?? {}, existing);
        const row = { ...existing, ...data, updatedAt: now() };
        await firebaseDb().collection(collections[model]).doc(existing.id).set(clean(row));
        return row;
      }
      return (this as any).create({ data: args.create });
    },
  };
}

const db: any = {};
for (const model of Object.keys(collections) as Array<keyof typeof collections>) db[model] = modelApi(model);
db.$transaction = async (operations: Promise<any>[]) => Promise.all(operations);

export { db };
