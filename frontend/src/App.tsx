import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Activity, ArrowDownToLine, ArrowRight, Bell, BookOpen, CalendarDays, Check, ChevronDown,
  CircleDollarSign, ClipboardCheck, GraduationCap, LayoutDashboard, LogOut, Menu, Plus,
  Search, Settings, ShieldCheck, Sparkles, Users, X
} from "lucide-react";
import {
  browserSessionPersistence, onAuthStateChanged, sendPasswordResetEmail, setPersistence,
  signInWithEmailAndPassword, signOut, type User
} from "firebase/auth";
import { api, submitInquiry } from "./api";
import { auth, firebaseConfigured } from "./firebase";

type Resource =
  | "students" | "guardians" | "staff" | "courses" | "classes" | "enrollments"
  | "attendance" | "invoices" | "payments" | "assessments" | "results" | "announcements" | "inquiries";
type RecordRow = Record<string, unknown> & { id: string };
type DashboardData = { counts: Record<string, number>; recentActivity: RecordRow[] };
type Field = { key: string; label: string; type?: string; options?: string[] };

const resources: Record<Resource, { label: string; singular: string; fields: Field[]; columns: string[] }> = {
  students: { label: "Students", singular: "Student", fields: [
    { key: "fullName", label: "Student name" }, { key: "grade", label: "Grade / year" }, { key: "school", label: "School" },
    { key: "phone", label: "Phone", type: "tel" }, { key: "email", label: "Email", type: "email" },
    { key: "guardianId", label: "Guardian ID" }, { key: "address", label: "Address" },
    { key: "status", label: "Status", options: ["active", "inactive", "pending"] }, { key: "notes", label: "Notes" }
  ], columns: ["fullName", "grade", "school", "phone", "status"] },
  guardians: { label: "Guardians", singular: "Guardian", fields: [
    { key: "fullName", label: "Full name" }, { key: "relationship", label: "Relationship" },
    { key: "phone", label: "Phone", type: "tel" }, { key: "email", label: "Email", type: "email" }, { key: "address", label: "Address" }
  ], columns: ["fullName", "relationship", "phone", "email"] },
  staff: { label: "Staff", singular: "Staff member", fields: [
    { key: "fullName", label: "Full name" }, { key: "email", label: "Email", type: "email" },
    { key: "phone", label: "Phone", type: "tel" }, { key: "role", label: "Role", options: ["admin", "manager", "teacher", "accountant", "receptionist"] },
    { key: "subjects", label: "Subjects (comma separated)" }, { key: "status", label: "Status", options: ["active", "inactive"] }
  ], columns: ["fullName", "email", "role", "phone", "status"] },
  courses: { label: "Courses", singular: "Course", fields: [
    { key: "name", label: "Course name" }, { key: "subject", label: "Subject" }, { key: "grade", label: "Grade / year" },
    { key: "description", label: "Description" }, { key: "monthlyFee", label: "Monthly fee (LKR)", type: "number" },
    { key: "teacherId", label: "Teacher ID" }, { key: "status", label: "Status", options: ["active", "inactive"] }
  ], columns: ["name", "subject", "grade", "monthlyFee", "status"] },
  classes: { label: "Class schedule", singular: "Class", fields: [
    { key: "name", label: "Class name" }, { key: "courseId", label: "Course ID" }, { key: "teacherId", label: "Teacher ID" },
    { key: "room", label: "Room" }, { key: "dayOfWeek", label: "Day", options: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] },
    { key: "startTime", label: "Starts (HH:MM)", type: "time" }, { key: "endTime", label: "Ends (HH:MM)", type: "time" },
    { key: "capacity", label: "Capacity", type: "number" }
  ], columns: ["name", "dayOfWeek", "startTime", "endTime", "room"] },
  enrollments: { label: "Enrollments", singular: "Enrollment", fields: [
    { key: "studentId", label: "Student ID" }, { key: "courseId", label: "Course ID" }, { key: "classId", label: "Class ID" },
    { key: "enrolledAt", label: "Enrollment date", type: "date" }, { key: "status", label: "Status", options: ["active", "completed", "withdrawn"] }
  ], columns: ["studentId", "courseId", "classId", "enrolledAt", "status"] },
  attendance: { label: "Attendance", singular: "Attendance record", fields: [
    { key: "classId", label: "Class ID" }, { key: "studentId", label: "Student ID" }, { key: "date", label: "Date", type: "date" },
    { key: "status", label: "Status", options: ["present", "absent", "late", "excused"] }, { key: "note", label: "Note" }
  ], columns: ["date", "studentId", "classId", "status"] },
  invoices: { label: "Invoices", singular: "Invoice", fields: [
    { key: "studentId", label: "Student ID" }, { key: "description", label: "Description" }, { key: "amount", label: "Amount (LKR)", type: "number" },
    { key: "dueDate", label: "Due date", type: "date" }, { key: "month", label: "Billing month" },
    { key: "status", label: "Status", options: ["unpaid", "partial", "paid", "overdue"] }
  ], columns: ["studentId", "description", "amount", "dueDate", "status"] },
  payments: { label: "Payments", singular: "Payment", fields: [
    { key: "invoiceId", label: "Invoice ID" }, { key: "studentId", label: "Student ID" }, { key: "amount", label: "Amount (LKR)", type: "number" },
    { key: "paidAt", label: "Payment date", type: "date" }, { key: "method", label: "Method", options: ["cash", "bank_transfer", "card", "other"] },
    { key: "reference", label: "Reference" }, { key: "note", label: "Note" }
  ], columns: ["studentId", "amount", "paidAt", "method", "reference"] },
  assessments: { label: "Assessments", singular: "Assessment", fields: [
    { key: "courseId", label: "Course ID" }, { key: "title", label: "Assessment title" }, { key: "date", label: "Date", type: "date" },
    { key: "totalMarks", label: "Total marks", type: "number" }, { key: "description", label: "Description" }
  ], columns: ["title", "courseId", "date", "totalMarks"] },
  results: { label: "Results", singular: "Result", fields: [
    { key: "assessmentId", label: "Assessment ID" }, { key: "studentId", label: "Student ID" },
    { key: "marks", label: "Marks", type: "number" }, { key: "comment", label: "Comment" }
  ], columns: ["assessmentId", "studentId", "marks", "comment"] },
  announcements: { label: "Announcements", singular: "Announcement", fields: [
    { key: "title", label: "Title" }, { key: "body", label: "Message" }, { key: "audience", label: "Audience", options: ["all", "students", "guardians", "staff"] },
    { key: "publishedAt", label: "Publish date", type: "date" }, { key: "status", label: "Status", options: ["draft", "published"] }
  ], columns: ["title", "audience", "status", "publishedAt"] },
  inquiries: { label: "Admission inquiries", singular: "Inquiry", fields: [
    { key: "studentName", label: "Student name" }, { key: "guardianName", label: "Guardian name" }, { key: "phone", label: "Phone" },
    { key: "email", label: "Email", type: "email" }, { key: "grade", label: "Grade / year" }, { key: "interestedCourse", label: "Interested course" },
    { key: "message", label: "Message" }, { key: "status", label: "Status", options: ["new", "contacted", "enrolled", "closed"] }
  ], columns: ["studentName", "guardianName", "phone", "interestedCourse", "status"] }
};

type PageKey = "dashboard" | Resource | "reports" | "audit";

const navigation: { heading: string; links: { key: PageKey; label: string; icon: typeof Users }[] }[] = [
  { heading: "Workspace", links: [
    { key: "dashboard", label: "Overview", icon: LayoutDashboard },
    { key: "students", label: "Students", icon: GraduationCap },
    { key: "guardians", label: "Guardians", icon: Users },
    { key: "staff", label: "Staff", icon: Users }
  ] },
  { heading: "Academics", links: [
    { key: "courses", label: "Courses", icon: BookOpen },
    { key: "classes", label: "Class schedule", icon: CalendarDays },
    { key: "enrollments", label: "Enrollments", icon: ClipboardCheck },
    { key: "attendance", label: "Attendance", icon: Check },
    { key: "assessments", label: "Assessments & results", icon: Sparkles }
  ] },
  { heading: "Center operations", links: [
    { key: "invoices", label: "Invoices", icon: CircleDollarSign },
    { key: "payments", label: "Payments", icon: CircleDollarSign },
    { key: "inquiries", label: "Admission inquiries", icon: ArrowRight },
    { key: "announcements", label: "Announcements", icon: Bell },
    { key: "reports", label: "Reports", icon: Activity },
    { key: "audit", label: "Audit history", icon: ShieldCheck }
  ] }
];

const formatMoney = (value: unknown) =>
  new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR", maximumFractionDigits: 0 }).format(Number(value) || 0);

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [page, setPage] = useState<PageKey>(window.location.pathname === "/admissions" ? "inquiries" : "dashboard");
  const [publicPage, setPublicPage] = useState(window.location.pathname === "/admissions");
  useEffect(() => {
    if (!auth) {
      setAuthLoading(false);
      return;
    }
    return onAuthStateChanged(auth, (value) => {
      setUser(value);
      setAuthLoading(false);
    });
  }, []);

  if (publicPage) return <AdmissionsPage onBack={() => { window.history.pushState({}, "", "/"); setPublicPage(false); }} />;
  if (!firebaseConfigured) return <ConfigurationNotice />;
  if (authLoading) return <div className="loading-screen"><div className="loader" />Loading BrightPath…</div>;
  if (!user || !auth) return <LoginPage />;
  return <Workspace user={user} page={page} setPage={setPage} />;
}

function ConfigurationNotice() {
  return <div className="login-shell"><div className="login-card"><Brand /><div className="notice-icon"><Settings /></div>
    <h1>Connect your Firebase project</h1><p>Add your Firebase web app settings to <code>frontend/.env</code>, then restart the frontend.</p>
    <p className="muted small">Keep Firebase Admin credentials only in the backend environment.</p></div></div>;
}

function Brand({ compact = false }: { compact?: boolean }) {
  return <div className={`brand ${compact ? "brand-compact" : ""}`}><div className="brand-mark"><GraduationCap size={21} /></div>
    <div><strong>brightpath</strong><span>LEARNING CENTER</span></div></div>;
}

function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!auth) return;
    setError(""); setMessage(""); setBusy(true);
    try {
      await setPersistence(auth, browserSessionPersistence);
      const credential = await signInWithEmailAndPassword(auth, email, password);
      if (!credential.user.emailVerified) {
        await signOut(auth);
        setError("Verify your email address before signing in. Contact your center administrator if you need help.");
      }
    }
    catch { setError("Sign in failed. Check your email and password or ask your administrator for access."); }
    finally { setBusy(false); }
  }
  async function resetPassword() {
    if (!auth || !email) { setError("Enter your account email first."); return; }
    setError(""); setMessage("");
    try { await sendPasswordResetEmail(auth, email); setMessage("If an account exists for this address, a reset link has been sent."); }
    catch { setError("Could not send a reset email. Check the address and try again."); }
  }
  return <div className="login-shell"><div className="login-card"><Brand />
    <div className="login-copy"><span className="eyebrow">WELCOME BACK</span><h1>Make every lesson<br />count.</h1><p>Sign in to your center workspace.</p></div>
    <form onSubmit={submit} className="login-form">
      <label>Email address<input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@brightpath.lk" /></label>
      <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="Enter your password" /></label>
      {error && <div className="form-error">{error}</div>}{message && <div className="form-success">{message}</div>}
      <button className="button button-primary full-width" disabled={busy}>{busy ? "Signing in…" : "Sign in"} <ArrowRight size={17} /></button>
    </form>
    <button className="text-button reset-link" onClick={resetPassword}>Forgot password?</button>
    <div className="login-foot"><ShieldCheck size={15} /> Secure access for your center team</div>
    <a className="admission-link" href="/admissions">Looking for classes? Submit an admission inquiry <ArrowRight size={14} /></a>
  </div><aside className="login-art"><div className="art-glow" /><div className="art-content"><span className="eyebrow light">A BETTER WAY TO LEARN</span>
    <h2>Inspiring bright futures, one class at a time.</h2><p>Everything your learning center needs, thoughtfully connected.</p>
    <div className="art-note"><span className="note-icon"><Sparkles size={18} /></span><div><strong>Learning that moves forward</strong><small>Students, teachers & families together</small></div></div>
  </div><span className="art-caption">BRIGHTPATH LEARNING CENTER · SRI LANKA</span></aside></div>;
}

function AdmissionsPage({ onBack }: { onBack: () => void }) {
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const values = Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<string, string>;
    try { await submitInquiry(values); setDone(true); }
    catch (err) { setError(err instanceof Error ? err.message : "The form could not be submitted."); }
    finally { setBusy(false); }
  }
  return <div className="admissions-page"><header><Brand /><button className="button button-light" onClick={onBack}>Staff sign in <ArrowRight size={16} /></button></header>
    <main className="admissions-content"><span className="eyebrow">START SOMETHING BRIGHT</span><h1>Find the right class<br />for your future.</h1>
      <p>Tell us a little about your student and our team will be in touch.</p>
      {done ? <div className="success-card"><span className="success-mark"><Check /></span><h2>Thank you for reaching out!</h2><p>Your inquiry has been sent to our admissions team.</p><button className="button button-primary" onClick={onBack}>Back to BrightPath</button></div> :
      <form className="inquiry-form" onSubmit={submit}>
        <div className="form-grid">
          <label>Student name<input name="studentName" required maxLength={500} /></label>
          <label>Parent / guardian name<input name="guardianName" required maxLength={500} /></label>
          <label>Phone number<input name="phone" type="tel" required maxLength={20} placeholder="+94 77 123 4567" /></label>
          <label>Email address<input name="email" type="email" maxLength={254} /></label>
          <label>Grade / year<input name="grade" maxLength={500} /></label>
          <label>Interested course<input name="interestedCourse" maxLength={500} /></label>
          <label className="span-two">Anything else we should know?<textarea name="message" rows={3} maxLength={1000} /></label>
        </div>
        {error && <div className="form-error">{error}</div>}<button className="button button-primary" disabled={busy}>{busy ? "Sending…" : "Send inquiry"} <ArrowRight size={16} /></button>
      </form>}
    </main><footer>BRIGHTPATH LEARNING CENTER <span>·</span> SRI LANKA</footer></div>;
}

function Workspace({ user, page, setPage }: { user: User; page: PageKey; setPage: (page: PageKey) => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [role, setRole] = useState("staff");
  useEffect(() => { user.getIdTokenResult().then((token) => setRole(String(token.claims.role ?? "staff"))); }, [user]);
  const selectedLabel = page === "dashboard" ? "Overview" : page === "reports" ? "Reports" : page === "audit" ? "Audit history" : resources[page].label;
  function navigate(next: PageKey) {
    setPage(next); setMenuOpen(false);
    if (window.location.pathname !== "/") window.history.pushState({}, "", "/");
  }
  return <div className="app-shell">
    <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}><div className="sidebar-brand"><Brand compact /><button className="icon-button mobile-close" onClick={() => setMenuOpen(false)} aria-label="Close menu"><X size={20} /></button></div>
      <div className="center-switch"><span className="center-avatar">B</span><div><strong>BrightPath Center</strong><small>Colombo, Sri Lanka</small></div><ChevronDown size={15} /></div>
      <nav>{navigation.map((group) => <div className="nav-group" key={group.heading}><span className="nav-heading">{group.heading}</span>
        {group.links.map(({ key, label, icon: Icon }) => <button key={key} className={`nav-link ${page === key ? "active" : ""}`} onClick={() => navigate(key)}><Icon size={18} /><span>{label}</span>{key === "inquiries" && <span className="nav-dot" />}</button>)}
      </div>)}</nav>
      <div className="sidebar-bottom"><button className={`nav-link ${page === "audit" ? "active" : ""}`} onClick={() => navigate("audit")}><Settings size={18} /><span>Settings & security</span></button>
        <div className="sidebar-help"><div className="help-spark"><Sparkles size={16} /></div><strong>Here to help</strong><p>Need a hand with your center?</p><button onClick={() => navigate("announcements")}>View announcements <ArrowRight size={13} /></button></div>
      </div>
    </aside>
    {menuOpen && <button className="sidebar-backdrop" onClick={() => setMenuOpen(false)} aria-label="Close navigation" />}
    <main className="main-panel">
      <header className="topbar"><button className="icon-button mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Open menu"><Menu size={21} /></button>
        <div className="breadcrumbs">Workspace <span>/</span> <strong>{selectedLabel}</strong></div>
        <div className="topbar-right"><button className="topbar-date"><CalendarDays size={15} />{new Date().toLocaleDateString("en-LK", { day: "numeric", month: "short", year: "numeric" })}</button>
          <div className="profile-wrap"><button className="profile-button" onClick={() => setProfileOpen((open) => !open)}><span className="profile-avatar">{(user.email?.[0] ?? "B").toUpperCase()}</span><span className="profile-info"><strong>{user.email?.split("@")[0]}</strong><small>{role}</small></span><ChevronDown size={15} /></button>
            {profileOpen && <div className="profile-menu"><span>{user.email}</span><button onClick={() => auth && signOut(auth)}><LogOut size={15} /> Sign out</button></div>}</div>
        </div>
      </header>
      <section className="page-content">{page === "dashboard" ? <Dashboard onNavigate={navigate} /> :
        page === "reports" ? <Reports /> : page === "audit" ? <AuditPage /> : <ResourcePage key={page} resource={page} />}</section>
    </main>
  </div>;
}

function Dashboard({ onNavigate }: { onNavigate: (page: PageKey) => void }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [summary, setSummary] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    Promise.all([api<DashboardData>("/dashboard"), api<Record<string, number>>("/reports/summary")])
      .then(([dashboard, reports]) => { setData(dashboard); setSummary(reports); })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load dashboard."));
  }, []);
  const today = new Date();
  const greeting = today.getHours() < 12 ? "Good morning" : today.getHours() < 17 ? "Good afternoon" : "Good evening";
  const cards = [
    { label: "Active students", value: data?.counts.students ?? "—", meta: "Across all courses", icon: GraduationCap, tone: "purple" },
    { label: "Classes this term", value: data?.counts.classes ?? "—", meta: `${data?.counts.courses ?? 0} active courses`, icon: BookOpen, tone: "blue" },
    { label: "Fees collected", value: summary ? formatMoney(summary.paidTotal) : "—", meta: "Recorded payments", icon: CircleDollarSign, tone: "green" },
    { label: "New inquiries", value: data?.counts.inquiries ?? "—", meta: "Admissions to follow up", icon: Users, tone: "orange" }
  ];
  return <><header className="dashboard-hero">
      <div className="hero-copy">
        <div className="hero-badges"><span className="live-pill"><i />YOUR CENTER, IN FOCUS</span><span className="hero-date">{today.toLocaleDateString("en-LK", { weekday: "long", month: "short", day: "numeric" })}</span></div>
        <h1>{greeting}, welcome back<span className="hero-period">.</span></h1>
        <p>Every bright future starts with a great class. Here’s what’s happening at your center today.</p>
        <div className="hero-footer"><button className="button hero-button" onClick={() => onNavigate("students")}><Plus size={17} /> Add a student <ArrowRight size={15} /></button>
          <span><Sparkles size={14} /> Small steps. Bright futures.</span></div>
      </div>
      <div className="hero-art" aria-hidden="true">
        <div className="hero-orbit orbit-outer" /><div className="hero-orbit orbit-inner" />
        <div className="hero-sun" /><div className="hero-book"><GraduationCap size={43} strokeWidth={1.5} /><span><BookOpen size={17} /></span></div>
        <div className="hero-note note-learning"><span><Sparkles size={13} /></span> Learning together</div>
        <div className="hero-note note-bright"><i /> A bright day to learn</div>
      </div>
    </header>
    {error && <div className="notice-error">{error}</div>}
    <div className="dashboard-section-title"><div><span className="section-kicker">THE BIG PICTURE</span><h2>Your center at a glance</h2></div><span className="section-note">A little progress, every day</span></div>
    <div className="stat-grid">{cards.map(({ label, value, meta, icon: Icon, tone }, index) => <article className={`stat-card stat-card-${index}`} key={label}>
      <div className={`stat-icon ${tone}`}><Icon size={19} /></div><span className="stat-label">{label}</span><strong className="stat-value">{value}</strong><span className="stat-meta">{meta}</span>
    </article>)}</div>
    <div className="dashboard-grid"><section className="panel activity-panel"><div className="panel-heading"><div><h2>Recent activity</h2><p>Latest updates across your center</p></div><button className="quiet-button" onClick={() => onNavigate("audit")}>View history <ArrowRight size={14} /></button></div>
      <div className="activity-list">{data?.recentActivity.length ? data.recentActivity.map((item, index) => <div className="activity-row" key={item.id}>
        <span className={`activity-symbol activity-${index % 4}`}>{item.action === "delete" ? <X size={15} /> : item.action === "update" ? <Activity size={15} /> : <Plus size={15} />}</span>
        <div><strong>{String(item.resource ?? "Record")} {String(item.action ?? "updated")}</strong><small>Record {String(item.recordId ?? "").slice(0, 10)} · {String(item.uid ?? "Team member").slice(0, 12)}</small></div>
        <time>{item.createdAt && typeof item.createdAt === "object" && "seconds" in item.createdAt ? new Date(Number(item.createdAt.seconds) * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Recently"}</time>
      </div>) : <div className="empty-activity"><span><Activity size={19} /></span><strong>Your center activity will appear here</strong><p>Updates to students, classes and payments will show up as they happen.</p></div>}</div>
    </section>
    <section className="panel quick-panel"><div className="panel-heading"><div><h2>Quick actions</h2><p>Keep your center moving</p></div></div>
      <div className="quick-actions">
        <QuickAction icon={GraduationCap} tone="purple" title="Register a student" subtitle="Add a student profile" onClick={() => onNavigate("students")} />
        <QuickAction icon={CalendarDays} tone="blue" title="Take attendance" subtitle="Mark today's class" onClick={() => onNavigate("attendance")} />
        <QuickAction icon={CircleDollarSign} tone="green" title="Record a payment" subtitle="Update fee records" onClick={() => onNavigate("payments")} />
        <QuickAction icon={Users} tone="orange" title="Follow up inquiry" subtitle={`${data?.counts.inquiries ?? 0} admission inquiries`} onClick={() => onNavigate("inquiries")} />
      </div>
    </section></div>
    <section className="panel bottom-banner"><div className="banner-icon"><Sparkles size={20} /></div><div><strong>A brighter way to manage your center</strong><p>Keep your teaching team and families connected, all in one place.</p></div><button className="quiet-button" onClick={() => onNavigate("announcements")}>Explore updates <ArrowRight size={14} /></button></section>
    <div className="page-footnote">BrightPath Learning Center <span>·</span> Colombo, Sri Lanka <span>·</span> All amounts in LKR</div>
  </>;
}

function QuickAction({ icon: Icon, tone, title, subtitle, onClick }: { icon: typeof Users; tone: string; title: string; subtitle: string; onClick: () => void }) {
  return <button className="quick-action" onClick={onClick}><span className={`quick-icon ${tone}`}><Icon size={18} /></span><span><strong>{title}</strong><small>{subtitle}</small></span><ArrowRight className="quick-arrow" size={15} /></button>;
}

function ResourcePage({ resource }: { resource: Resource }) {
  const config = resources[resource];
  const [rows, setRows] = useState<RecordRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<RecordRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  async function refresh() {
    setLoading(true); setError("");
    try { setRows(await api<RecordRow[]>(`/${resource}`)); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not load records."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, [resource]);
  const filtered = useMemo(() => rows.filter((row) => JSON.stringify(row).toLowerCase().includes(search.toLowerCase())), [rows, search]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const values = Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<string, FormDataEntryValue>;
    const payload: Record<string, unknown> = {};
    for (const field of config.fields) {
      const value = values[field.key];
      if (value !== undefined && String(value).trim() !== "") {
        payload[field.key] = field.key === "subjects" ? String(value).split(",").map((subject) => subject.trim()).filter(Boolean) :
          field.type === "number" ? Number(value) : String(value).trim();
      }
    }
    try {
      await api(`/${resource}${editing ? `/${editing.id}` : ""}`, {
        method: editing ? "PATCH" : "POST", body: JSON.stringify(payload)
      });
      setModal(false); setEditing(null); setToast(`${config.singular} ${editing ? "updated" : "added"} successfully.`);
      await refresh(); window.setTimeout(() => setToast(""), 3000);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save this record."); }
    finally { setBusy(false); }
  }
  async function remove(row: RecordRow) {
    if (!window.confirm(`Permanently delete this ${config.singular.toLowerCase()} record?`)) return;
    try { await api(`/${resource}/${row.id}`, { method: "DELETE" }); await refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not delete record."); }
  }
  function displayValue(key: string, value: unknown) {
    if (value == null || value === "") return "—";
    if (["amount", "monthlyFee"].includes(key)) return formatMoney(value);
    if (Array.isArray(value)) return value.join(", ") || "—";
    return String(value);
  }
  return <><div className="page-title-row"><div><span className="eyebrow">CENTER MANAGEMENT</span><h1>{config.label}</h1>
    <p>Manage your center’s {config.label.toLowerCase()} and keep records up to date.</p></div>
    <button className="button button-primary" onClick={() => { setEditing(null); setModal(true); }}><Plus size={17} /> Add {config.singular}</button></div>
    <section className="panel records-panel">
      <div className="records-toolbar"><div><strong>{config.label}</strong><span className="count-pill">{rows.length}</span></div>
        <div className="table-actions"><label className="search-box"><Search size={16} /><input placeholder={`Search ${config.label.toLowerCase()}…`} value={search} onChange={(e) => setSearch(e.target.value)} /></label>
          <button className="icon-button" aria-label="Refresh records" onClick={() => void refresh()}><Activity size={17} /></button></div></div>
      {error && <div className="notice-error inline-error">{error}</div>}
      {toast && <div className="form-success toast"><Check size={15} />{toast}</div>}
      <div className="table-wrap"><table><thead><tr>{config.columns.map((column) => <th key={column}>{column.replace(/([A-Z])/g, " $1")}</th>)}<th className="actions-heading">Actions</th></tr></thead>
        <tbody>{loading ? <tr><td colSpan={config.columns.length + 1}><div className="table-loading"><div className="loader" />Loading records…</div></td></tr> :
          filtered.length ? filtered.map((row) => <tr key={row.id}>{config.columns.map((column) => <td key={column}>{column === "status" ? <span className={`status-pill status-${String(row[column]).toLowerCase()}`}>{String(row[column] ?? "—")}</span> : displayValue(column, row[column])}</td>)}
            <td><div className="row-actions"><button onClick={() => { setEditing(row); setModal(true); }} aria-label="Edit record">Edit</button><button className="delete-action" onClick={() => void remove(row)} aria-label="Delete record">Delete</button></div></td></tr>) :
          <tr><td colSpan={config.columns.length + 1}><div className="table-empty"><span><Search size={20} /></span><strong>{search ? "No matching records" : `No ${config.label.toLowerCase()} yet`}</strong><p>{search ? "Try a different search term." : `Add your first ${config.singular.toLowerCase()} to get started.`}</p></div></td></tr>}
        </tbody></table></div>
      <div className="table-footer">Showing {filtered.length} of {rows.length} records <span>·</span> Up to 100 most recent</div>
    </section>
    {modal && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) { setModal(false); setEditing(null); } }}>
      <section className="edit-modal"><div className="modal-header"><div><span className="eyebrow">{editing ? "UPDATE RECORD" : "NEW RECORD"}</span><h2>{editing ? `Edit ${config.singular}` : `Add ${config.singular}`}</h2></div>
        <button className="icon-button" onClick={() => { setModal(false); setEditing(null); }} aria-label="Close dialog"><X size={20} /></button></div>
        <form onSubmit={save}><div className="form-grid">{config.fields.map((field) => <label key={field.key} className={field.key === "body" || field.key === "address" || field.key === "notes" || field.key === "description" ? "span-two" : ""}>{field.label}
          {field.options ? <select name={field.key} defaultValue={String(editing?.[field.key] ?? field.options[0])}>{field.options.map((option) => <option key={option} value={option}>{option.replace("_", " ")}</option>)}</select> :
            <input name={field.key} type={field.type ?? "text"} defaultValue={Array.isArray(editing?.[field.key]) ? (editing?.[field.key] as string[]).join(", ") : String(editing?.[field.key] ?? "")}
              required={!["grade", "school", "phone", "email", "guardianId", "address", "notes", "teacherId", "description", "room", "classId", "month", "reference", "note", "comment", "publishedAt", "subjects", "message", "grade", "interestedCourse"].includes(field.key)} />}</label>)}</div>
          <div className="modal-footer"><button type="button" className="button button-light" onClick={() => { setModal(false); setEditing(null); }}>Cancel</button><button className="button button-primary" disabled={busy}>{busy ? "Saving…" : editing ? "Save changes" : `Add ${config.singular}`} <ArrowRight size={15} /></button></div>
        </form></section>
    </div>}
  </>;
}

function Reports() {
  const [report, setReport] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { api<Record<string, number>>("/reports/summary").then(setReport).catch((err) => setError(err instanceof Error ? err.message : "Could not load reports.")); }, []);
  const tiles = [
    ["Enrolled students", report?.students ?? "—", "Currently registered students"],
    ["Total invoiced", report ? formatMoney(report.invoiceTotal) : "—", "Across all fee records"],
    ["Payments received", report ? formatMoney(report.paidTotal) : "—", "Cash, transfer and other"],
    ["Fees outstanding", report ? formatMoney(report.outstanding) : "—", "Invoice balance due"],
    ["Attendance rate", report ? `${report.attendanceRate}%` : "—", "Present or late records"]
  ];
  return <><div className="page-title-row"><div><span className="eyebrow">CENTER INSIGHTS</span><h1>Reports</h1><p>A quick look at student, fee and attendance health.</p></div>
    <button className="button button-light" onClick={() => window.print()}><ArrowDownToLine size={16} /> Print report</button></div>
    {error && <div className="notice-error">{error}</div>}<div className="report-grid">{tiles.map(([label, value, detail]) => <article className="report-tile" key={String(label)}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>)}</div>
    <div className="panel report-note"><div className="stat-icon blue"><Activity size={19} /></div><div><h2>Report definitions</h2><p>Outstanding is calculated as total invoice amounts minus recorded payments. Attendance rate counts present and late records over all saved attendance entries. This summary covers all retained records.</p></div></div>
  </>;
}

function AuditPage() {
  const [rows, setRows] = useState<RecordRow[]>([]);
  const [error, setError] = useState("");
  useEffect(() => { api<RecordRow[]>("/audit").then(setRows).catch((err) => setError(err instanceof Error ? err.message : "Could not load audit history.")); }, []);
  return <><div className="page-title-row"><div><span className="eyebrow">ACCESS & ACCOUNTABILITY</span><h1>Audit history</h1><p>Recent changes made by your team.</p></div></div>
    {error && <div className="notice-error">{error}</div>}<section className="panel audit-panel"><div className="panel-heading"><div><h2>Latest record changes</h2><p>Most recent 100 actions</p></div><span className="secure-label"><ShieldCheck size={15} /> Admin & manager only</span></div>
      {rows.length ? <div className="audit-list">{rows.map((row) => <div className="audit-row" key={row.id}><span className={`audit-action action-${String(row.action)}`}>{String(row.action)}</span><strong>{String(row.resource)}</strong><span>Record {String(row.recordId).slice(0, 12)}</span><small>{String(row.uid).slice(0, 14)}</small><time>{row.createdAt && typeof row.createdAt === "object" && "seconds" in row.createdAt ? new Date(Number(row.createdAt.seconds) * 1000).toLocaleString() : "Just now"}</time></div>)}</div> :
        !error && <div className="table-empty"><span><ShieldCheck size={20} /></span><strong>No activity recorded yet</strong><p>Changes made through the API appear here.</p></div>}
    </section></>;
}

export default App;
