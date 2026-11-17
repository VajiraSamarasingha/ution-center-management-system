import "dotenv/config";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { AggregateField, FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { allowRoles, requireAuth, type Role } from "./auth.js";
import { db } from "./firebase.js";
import { inquirySchema, resourceNames, validateResource, type Resource } from "./validation.js";

const app = express();
const port = Number(process.env.PORT ?? 4000);
const origins = (process.env.CORS_ORIGIN ?? "").split(",").map((origin) => origin.trim()).filter(Boolean);

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || origins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error("Origin is not allowed by CORS."));
  },
  methods: ["GET", "POST", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json({ limit: "32kb", strict: true }));

const publicLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: "draft-7", legacyHeaders: false });
const apiLimiter = rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: "draft-7", legacyHeaders: false });
app.use("/api", apiLimiter);
app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

const permissions: Record<Resource, { read: Role[]; write: Role[]; remove: Role[] }> = {
  students: { read: ["admin", "manager", "teacher", "receptionist"], write: ["admin", "manager", "receptionist"], remove: ["admin"] },
  guardians: { read: ["admin", "manager", "teacher", "receptionist"], write: ["admin", "manager", "receptionist"], remove: ["admin"] },
  staff: { read: ["admin", "manager"], write: ["admin", "manager"], remove: ["admin"] },
  courses: { read: ["admin", "manager", "teacher", "receptionist"], write: ["admin", "manager"], remove: ["admin"] },
  classes: { read: ["admin", "manager", "teacher", "receptionist"], write: ["admin", "manager"], remove: ["admin"] },
  enrollments: { read: ["admin", "manager", "teacher", "receptionist"], write: ["admin", "manager", "receptionist"], remove: ["admin"] },
  attendance: { read: ["admin", "manager", "teacher"], write: ["admin", "manager", "teacher"], remove: ["admin"] },
  invoices: { read: ["admin", "manager", "accountant", "receptionist"], write: ["admin", "manager", "accountant"], remove: ["admin"] },
  payments: { read: ["admin", "manager", "accountant"], write: ["admin", "manager", "accountant"], remove: ["admin"] },
  assessments: { read: ["admin", "manager", "teacher"], write: ["admin", "manager", "teacher"], remove: ["admin"] },
  results: { read: ["admin", "manager", "teacher"], write: ["admin", "manager", "teacher"], remove: ["admin"] },
  announcements: { read: ["admin", "manager", "teacher", "receptionist"], write: ["admin", "manager"], remove: ["admin"] },
  inquiries: { read: ["admin", "manager", "receptionist"], write: ["admin", "manager", "receptionist"], remove: ["admin"] }
};

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

app.post("/api/public/enrollments", publicLimiter, async (req, res, next) => {
  try {
    const inquiry = inquirySchema.parse(req.body);
    const doc = await db.collection("inquiries").add({
      ...inquiry, status: "new", createdAt: FieldValue.serverTimestamp()
    });
    res.status(201).json({ id: doc.id, message: "Thank you. The center will contact you soon." });
  } catch (error) {
    next(error);
  }
});

app.get("/api/dashboard", requireAuth, async (req, res, next) => {
  try {
    const role = req.user!.role;
    const allowed = permissions.students.read.includes(role);
    if (!allowed) {
      res.status(403).json({ error: "You do not have permission to view this dashboard." });
      return;
    }
    const counts = await Promise.all(["students", "staff", "courses", "classes", "invoices", "inquiries"].map(async (name) => {
      const snap = await db.collection(name).count().get();
      return [name, snap.data().count] as const;
    }));
    const recent = await db.collection("auditLogs").orderBy("createdAt", "desc").limit(6).get();
    res.json({
      counts: Object.fromEntries(counts),
      recentActivity: recent.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/reports/summary", requireAuth, async (req, res, next) => {
  if (!["admin", "manager", "accountant"].includes(req.user!.role)) {
    res.status(403).json({ error: "You do not have permission to view reports." });
    return;
  }
  try {
    const [students, invoices, payments, totalAttendance, presentAttendance] = await Promise.all([
      db.collection("students").count().get(),
      db.collection("invoices").aggregate({ total: AggregateField.sum("amount") }).get(),
      db.collection("payments").aggregate({ total: AggregateField.sum("amount") }).get(),
      db.collection("attendance").count().get(),
      db.collection("attendance").where("status", "in", ["present", "late"]).count().get()
    ]);
    const invoiceTotal = Number(invoices.data().total ?? 0);
    const paidTotal = Number(payments.data().total ?? 0);
    res.json({
      students: students.data().count,
      invoiceTotal,
      paidTotal,
      outstanding: Math.max(invoiceTotal - paidTotal, 0),
      attendanceRate: totalAttendance.data().count
        ? Math.round((presentAttendance.data().count / totalAttendance.data().count) * 100)
        : 0
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/audit", requireAuth, allowRoles("admin", "manager"), async (_req, res, next) => {
  try {
    const snapshot = await db.collection("auditLogs").orderBy("createdAt", "desc").limit(100).get();
    res.json(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
  } catch (error) {
    next(error);
  }
});

for (const resource of resourceNames) {
  const collection = db.collection(resource);
  const policy = permissions[resource];

  app.get(`/api/${resource}`, requireAuth, allowRoles(...policy.read), async (req, res, next) => {
    try {
      const limit = z.coerce.number().int().min(1).max(100).catch(50).parse(req.query.limit);
      const snapshot = await collection.orderBy("createdAt", "desc").limit(limit).get();
      res.json(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    } catch (error) {
      next(error);
    }
  });

  if (resource !== "payments") app.post(`/api/${resource}`, requireAuth, allowRoles(...policy.write), async (req, res, next) => {
    try {
      const data = validateResource(resource, req.body);
      const doc = collection.doc();
      const audit = db.collection("auditLogs").doc();
      const record = {
        ...data,
        ...(resource === "invoices" ? {
          paidAmount: 0,
          status: new Date(String(data.dueDate)) < new Date() ? "overdue" : "unpaid"
        } : {}),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      };
      await db.runTransaction(async (transaction) => {
        transaction.create(doc, record);
        transaction.create(audit, {
          uid: req.user!.uid, action: "create", resource, recordId: doc.id,
          createdAt: FieldValue.serverTimestamp()
        });
      });
      res.status(201).json({ id: doc.id, ...record });
    } catch (error) {
      next(error);
    }
  });

  if (resource !== "payments") app.patch(`/api/${resource}/:id`, requireAuth, allowRoles(...policy.write), async (req, res, next) => {
    try {
      const data = validateResource(resource, req.body);
      const doc = collection.doc(req.params.id);
      const audit = db.collection("auditLogs").doc();
      const savedData = { ...data };
      await db.runTransaction(async (transaction) => {
        const existing = await transaction.get(doc);
        if (!existing.exists) throw new HttpError(404, "The requested record was not found.");
        if (resource === "invoices") {
          const paid = Number(existing.get("paidAmount") ?? 0);
          const amount = Number(data.amount);
          if (amount < paid) throw new HttpError(400, "Invoice total cannot be lower than its recorded payments.");
          savedData.status = paid >= amount ? "paid" : paid > 0 ? "partial" :
            new Date(String(data.dueDate)) < new Date() ? "overdue" : "unpaid";
        }
        transaction.update(doc, { ...savedData, updatedAt: FieldValue.serverTimestamp() });
        transaction.create(audit, {
          uid: req.user!.uid, action: "update", resource, recordId: req.params.id,
          createdAt: FieldValue.serverTimestamp()
        });
      });
      res.json({ id: req.params.id, ...savedData });
    } catch (error) {
      next(error);
    }
  });

  if (resource !== "payments") app.delete(`/api/${resource}/:id`, requireAuth, allowRoles(...policy.remove), async (req, res, next) => {
    try {
      const doc = collection.doc(req.params.id);
      const audit = db.collection("auditLogs").doc();
      await db.runTransaction(async (transaction) => {
        const existing = await transaction.get(doc);
        if (!existing.exists) throw new HttpError(404, "The requested record was not found.");
        if (resource === "invoices" && Number(existing.get("paidAmount") ?? 0) > 0) {
          throw new HttpError(409, "Invoices with recorded payments cannot be deleted.");
        }
        transaction.delete(doc);
        transaction.create(audit, {
          uid: req.user!.uid, action: "delete", resource, recordId: req.params.id,
          createdAt: FieldValue.serverTimestamp()
        });
      });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });
}

app.post("/api/payments", requireAuth, allowRoles(...permissions.payments.write), async (req, res, next) => {
  try {
    const data = validateResource("payments", req.body);
    const payment = db.collection("payments").doc();
    const invoice = db.collection("invoices").doc(String(data.invoiceId));
    const auditPayment = db.collection("auditLogs").doc();
    const auditInvoice = db.collection("auditLogs").doc();
    await db.runTransaction(async (transaction) => {
      const invoiceSnapshot = await transaction.get(invoice);
      if (!invoiceSnapshot.exists) throw new HttpError(404, "The selected invoice was not found.");
      const total = Number(invoiceSnapshot.get("amount") ?? 0);
      const paid = Number(invoiceSnapshot.get("paidAmount") ?? 0);
      if (Number(data.amount) > total - paid) {
        throw new HttpError(400, "Payment exceeds the invoice balance.");
      }
      const nextPaid = paid + Number(data.amount);
      transaction.create(payment, {
        ...data, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
      });
      transaction.update(invoice, {
        paidAmount: nextPaid, status: nextPaid >= total ? "paid" : "partial",
        updatedAt: FieldValue.serverTimestamp()
      });
      transaction.create(auditPayment, {
        uid: req.user!.uid, action: "create", resource: "payments", recordId: payment.id,
        createdAt: FieldValue.serverTimestamp()
      });
      transaction.create(auditInvoice, {
        uid: req.user!.uid, action: "update", resource: "invoices", recordId: invoice.id,
        createdAt: FieldValue.serverTimestamp()
      });
    });
    res.status(201).json({ id: payment.id, ...data });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/payments/:id", requireAuth, allowRoles(...permissions.payments.write), async (req, res, next) => {
  try {
    const data = validateResource("payments", req.body);
    const payment = db.collection("payments").doc(req.params.id);
    const nextInvoice = db.collection("invoices").doc(String(data.invoiceId));
    const audit = db.collection("auditLogs").doc();
    const auditOldInvoice = db.collection("auditLogs").doc();
    const auditNewInvoice = db.collection("auditLogs").doc();
    await db.runTransaction(async (transaction) => {
      const existing = await transaction.get(payment);
      if (!existing.exists) throw new HttpError(404, "The requested payment was not found.");
      const prior = existing.data()!;
      const priorInvoice = db.collection("invoices").doc(String(prior.invoiceId));
      const invoiceIds = [...new Set([priorInvoice.id, nextInvoice.id])];
      const snapshots = await Promise.all(invoiceIds.map((id) => transaction.get(db.collection("invoices").doc(id))));
      const invoices = new Map(snapshots.map((snapshot) => [snapshot.id, snapshot]));
      if (snapshots.some((snapshot) => !snapshot.exists)) throw new HttpError(404, "An invoice linked to this payment was not found.");
      const paidByInvoice = new Map(invoiceIds.map((id) => [
        id, Number(invoices.get(id)!.get("paidAmount") ?? 0) - (id === priorInvoice.id ? Number(prior.amount) : 0)
      ]));
      const newBalance = Number(invoices.get(nextInvoice.id)!.get("amount") ?? 0) - (paidByInvoice.get(nextInvoice.id) ?? 0);
      if (Number(data.amount) > newBalance) throw new HttpError(400, "Payment exceeds the invoice balance.");
      paidByInvoice.set(nextInvoice.id, (paidByInvoice.get(nextInvoice.id) ?? 0) + Number(data.amount));
      transaction.update(payment, { ...data, updatedAt: FieldValue.serverTimestamp() });
      for (const id of invoiceIds) {
        const invoiceSnapshot = invoices.get(id)!;
        const paid = paidByInvoice.get(id)!;
        const total = Number(invoiceSnapshot.get("amount") ?? 0);
        transaction.update(db.collection("invoices").doc(id), {
          paidAmount: paid, status: paid >= total ? "paid" : paid > 0 ? "partial" : "unpaid",
          updatedAt: FieldValue.serverTimestamp()
        });
      }
      transaction.create(audit, {
        uid: req.user!.uid, action: "update", resource: "payments", recordId: payment.id,
        createdAt: FieldValue.serverTimestamp()
      });
      transaction.create(auditOldInvoice, {
        uid: req.user!.uid, action: "update", resource: "invoices", recordId: priorInvoice.id,
        createdAt: FieldValue.serverTimestamp()
      });
      if (nextInvoice.id !== priorInvoice.id) {
        transaction.create(auditNewInvoice, {
          uid: req.user!.uid, action: "update", resource: "invoices", recordId: nextInvoice.id,
          createdAt: FieldValue.serverTimestamp()
        });
      }
    });
    res.json({ id: payment.id, ...data });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/payments/:id", requireAuth, allowRoles(...permissions.payments.remove), async (req, res, next) => {
  try {
    const payment = db.collection("payments").doc(req.params.id);
    const auditPayment = db.collection("auditLogs").doc();
    const auditInvoice = db.collection("auditLogs").doc();
    await db.runTransaction(async (transaction) => {
      const existing = await transaction.get(payment);
      if (!existing.exists) throw new HttpError(404, "The requested payment was not found.");
      const data = existing.data()!;
      const invoice = db.collection("invoices").doc(String(data.invoiceId));
      const invoiceSnapshot = await transaction.get(invoice);
      if (!invoiceSnapshot.exists) throw new HttpError(404, "The invoice linked to this payment was not found.");
      const paid = Math.max(Number(invoiceSnapshot.get("paidAmount") ?? 0) - Number(data.amount), 0);
      const total = Number(invoiceSnapshot.get("amount") ?? 0);
      transaction.delete(payment);
      transaction.update(invoice, {
        paidAmount: paid, status: paid >= total ? "paid" : paid > 0 ? "partial" : "unpaid",
        updatedAt: FieldValue.serverTimestamp()
      });
      transaction.create(auditPayment, {
        uid: req.user!.uid, action: "delete", resource: "payments", recordId: payment.id,
        createdAt: FieldValue.serverTimestamp()
      });
      transaction.create(auditInvoice, {
        uid: req.user!.uid, action: "update", resource: "invoices", recordId: invoice.id,
        createdAt: FieldValue.serverTimestamp()
      });
    });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: "Please check the submitted information.", details: error.issues.map((issue) => ({
      field: issue.path.join("."), message: issue.message
    })) });
    return;
  }
  console.error("API request failed:", error);
  res.status(500).json({ error: "The request could not be completed." });
});

app.listen(port, () => {
  console.log(`BrightPath API listening on port ${port}`);
});
