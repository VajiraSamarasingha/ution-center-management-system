# BrightPath Tuition Center

A single-center tuition management app with a React/TypeScript frontend and a separate Express/TypeScript API. Firebase Authentication handles sign-in; Firestore stores center data. The initial payment workflow records cash/bank payments manually in LKR.

## Features

- Role-aware staff sign-in (administrator, manager, teacher, accountant, receptionist) and password recovery
- Student and guardian records, staff directory, subjects/courses, class schedules, and enrollments
- Attendance, assessments and results, invoices, and payment records
- Dashboard summaries, operational reports, audit history, and public admission inquiries
- Responsive admin interface, API validation, Firebase ID-token verification, rate limiting, and deny-by-default Firestore rules

## Requirements

- Node.js 22+
- A Firebase project with Authentication (Email/Password) and Cloud Firestore enabled
- A Firebase Admin service account available to the backend using Application Default Credentials or `GOOGLE_APPLICATION_CREDENTIALS`

## Configure

1. Copy `frontend/.env.example` to `frontend/.env` and fill in the Firebase Web App settings.
2. Copy `backend/.env.example` to `backend/.env`, set the Firebase project ID and an exact allowed frontend origin.
3. Configure `GOOGLE_APPLICATION_CREDENTIALS` outside the repository to point at the Firebase service-account JSON. Never put this file in source control or expose Admin credentials to the frontend.
4. Publish `firestore.rules` to the Firebase project. The frontend does not access Firestore directly; all application data is accessed through the authenticated API.
5. Create and verify the first Firebase Authentication user in the Firebase console, then grant the initial administrator claim:

   ```powershell
   npm install
   npm run set-admin -w backend -- admin@example.com
   ```

   Run this command in an environment with the backend Firebase Admin credentials configured. Only trusted operators should have access to this command.
6. Create and verify additional staff accounts through Firebase Authentication, then assign each role with the trusted CLI, for example `npm run set-role -w backend -- teacher@example.com teacher`. Never let a user assign their own role.
7. Install dependencies and start both apps:

   ```powershell
   npm install
   npm run dev
   ```

   Frontend: `http://localhost:5173`; API: `http://localhost:4000`.

## Roles

User role claims are assigned by a trusted operator using Firebase Admin SDK (see `backend/scripts/set-role.ts`). The API rejects unauthenticated and unverified-email requests and checks role permissions on every protected route. `inquiries` submitted by the public form are visible to administrators, managers, and receptionists.

## Production checklist

- Use HTTPS, exact production `CORS_ORIGIN`, and a managed secret store for Admin credentials and `SESSION_SECRET`.
- Restrict service-account IAM permissions to the required Firebase project; rotate credentials and audit administrator access.
- Configure Firebase Authentication email verification, password policy, MFA for administrators, account recovery, and alerting in Firebase Console.
- Set up Firestore backups, retention, monitoring, and a tested restore procedure.
- Review local privacy/data-retention obligations before entering real student or guardian data. Do not treat this starter as a compliance certification or security guarantee.

## API

Protected resources live under `/api/{students,guardians,staff,courses,classes,enrollments,attendance,invoices,payments,assessments,results,announcements}` and support list/create/update/delete. Send the Firebase ID token as `Authorization: Bearer <token>`. Public enrollment inquiries use `POST /api/public/enrollments`. Health check: `GET /api/health`.
