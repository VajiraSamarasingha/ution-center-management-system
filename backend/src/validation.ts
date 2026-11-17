import { z } from "zod";

const text = z.string().trim().min(1).max(500);
const optionalText = z.string().trim().max(1000).optional();
const email = z.string().trim().email().max(254);
const date = z.string().trim().max(40);
const money = z.number().finite().min(0).max(100000000);
const phone = z.string().trim().min(7).max(20).regex(/^[+\d ()-]+$/);

const fields = {
  students: z.object({
    fullName: text, dateOfBirth: date.optional(), grade: optionalText, school: optionalText,
    phone: phone.optional(), email: email.optional(), guardianId: optionalText, address: optionalText,
    status: z.enum(["active", "inactive", "pending"]).default("active"), notes: optionalText
  }).strict(),
  guardians: z.object({
    fullName: text, relationship: text, phone, email: email.optional(), address: optionalText
  }).strict(),
  staff: z.object({
    fullName: text, email, phone: phone.optional(),
    role: z.enum(["admin", "manager", "teacher", "accountant", "receptionist"]),
    subjects: z.array(text).max(30).default([]), status: z.enum(["active", "inactive"]).default("active")
  }).strict(),
  courses: z.object({
    name: text, subject: text, grade: optionalText, description: optionalText, monthlyFee: money,
    teacherId: optionalText, status: z.enum(["active", "inactive"]).default("active")
  }).strict(),
  classes: z.object({
    name: text, courseId: text, teacherId: optionalText, room: optionalText,
    dayOfWeek: z.enum(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]),
    startTime: text, endTime: text, capacity: z.number().int().min(1).max(1000).default(40)
  }).strict(),
  enrollments: z.object({
    studentId: text, courseId: text, classId: optionalText, enrolledAt: date,
    status: z.enum(["active", "completed", "withdrawn"]).default("active")
  }).strict(),
  attendance: z.object({
    classId: text, studentId: text, date, status: z.enum(["present", "absent", "late", "excused"]),
    note: optionalText
  }).strict(),
  invoices: z.object({
    studentId: text, description: text, amount: money, dueDate: date,
    status: z.enum(["unpaid", "partial", "paid", "overdue"]).default("unpaid"),
    month: optionalText
  }).strict(),
  payments: z.object({
    invoiceId: text, studentId: text, amount: z.number().finite().positive().max(100000000), paidAt: date,
    method: z.enum(["cash", "bank_transfer", "card", "other"]), reference: optionalText, note: optionalText
  }).strict(),
  assessments: z.object({
    courseId: text, title: text, date, totalMarks: z.number().finite().positive().max(100000),
    description: optionalText
  }).strict(),
  results: z.object({
    assessmentId: text, studentId: text, marks: z.number().finite().min(0).max(100000), comment: optionalText
  }).strict(),
  announcements: z.object({
    title: text, body: z.string().trim().min(1).max(5000), audience: z.enum(["all", "students", "guardians", "staff"]),
    publishedAt: date.optional(), status: z.enum(["draft", "published"]).default("draft")
  }).strict(),
  inquiries: z.object({
    studentName: text, guardianName: text, phone, email: email.optional(), grade: optionalText,
    interestedCourse: optionalText, message: optionalText,
    status: z.enum(["new", "contacted", "enrolled", "closed"]).default("new")
  }).strict()
};

export type Resource = keyof typeof fields;
export const resourceNames = Object.keys(fields) as Resource[];

export function validateResource(resource: Resource, value: unknown) {
  return fields[resource].parse(value) as Record<string, unknown>;
}

export const inquirySchema = z.object({
  studentName: text, guardianName: text, phone, email: email.optional(),
  grade: optionalText, interestedCourse: optionalText, message: optionalText
}).strict();
