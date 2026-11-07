import { useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowUpRight, Bell, BookOpen, CalendarDays, CheckCircle2, ChevronDown,
  CircleHelp, Clock3, GraduationCap, LayoutDashboard, LogOut, Menu, MessageSquare,
  PlayCircle, Plus, Search, Settings, ShieldCheck, Sparkles, Users, Wallet, X
} from 'lucide-react';
import { isSupabaseConfigured, supabase } from './lib/supabase';

const demoCourses = [
  { id:'demo-1', title:'Foundation Science', description:'Build strong concepts in physics, chemistry and biology.', price:1499, level:'Class 8–10', lessons_count:18, accent:'blue' },
  { id:'demo-2', title:'Physics Masterclass', description:'Understand the laws of nature with visual lessons.', price:1999, level:'Class 11–12', lessons_count:24, accent:'violet' },
  { id:'demo-3', title:'Chemistry Essentials', description:'From atomic structure to reactions and numericals.', price:1799, level:'Class 11–12', lessons_count:16, accent:'gold' }
];
const nav = [
  { id:'overview', label:'Overview', icon:LayoutDashboard },
  { id:'courses', label:'My courses', icon:BookOpen },
  { id:'schedule', label:'Schedule', icon:CalendarDays },
  { id:'people', label:'People', icon:Users },
  { id:'payments', label:'Payments', icon:Wallet }
];
const money = value => new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(Number(value||0));

export default function App() {
  const [session,setSession] = useState(null);
  const [profile,setProfile] = useState(null);
  const [courses,setCourses] = useState(demoCourses);
  const [page,setPage] = useState('overview');
  const [loading,setLoading] = useState(isSupabaseConfigured);
  const [authMode,setAuthMode] = useState('signin');
  const [email,setEmail] = useState('');
  const [password,setPassword] = useState('');
  const [authError,setAuthError] = useState('');
  const [notice,setNotice] = useState('');
  const [showCourse,setShowCourse] = useState(false);
  const [showLesson,setShowLesson] = useState(false);
  const [showPerson,setShowPerson] = useState(false);
  const [selectedCourse,setSelectedCourse] = useState(null);
  const [lessons,setLessons] = useState([]);
  const [courseForm,setCourseForm] = useState({title:'',description:'',price:'',level:'Class 9–10'});
  const [lessonForm,setLessonForm] = useState({title:'',video_url:'',duration:''});
  const [personForm,setPersonForm] = useState({email:'',password:'',full_name:'',role:'teacher'});
  const [mobileNav,setMobileNav] = useState(false);
  const role = profile?.role || 'admin';
  const isAdmin = role === 'admin';
  const canTeach = isAdmin || role === 'teacher';
  const initials = (profile?.full_name || session?.user?.email || 'SK').slice(0,2).toUpperCase();

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase.auth.getSession().then(({data}) => { setSession(data.session); if (!data.session) setLoading(false); });
    const {data:{subscription}} = supabase.auth.onAuthStateChange((_event,next) => setSession(next));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let active = true;
    async function loadProfileAndCourses() {
      if (!session?.user) { setProfile(null); setLoading(false); return; }
      setLoading(true);
      const {data:person,error:profileError} = await supabase.from('profiles').select('id,full_name,role,approved').eq('id',session.user.id).maybeSingle();
      if (!active) return;
      if (profileError || !person?.approved) {
        await supabase.auth.signOut();
        setAuthError('This account is not approved yet. Please contact the SK Science administrator.');
        setLoading(false); return;
      }
      setProfile(person);
      const {data,error} = await supabase.from('courses').select('*').order('created_at',{ascending:false});
      if (active && !error && data) setCourses(data);
      setLoading(false);
    }
    if (session) loadProfileAndCourses();
    return () => { active = false; };
  }, [session]);

  const pageTitle = nav.find(item=>item.id===page)?.label || 'Overview';
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  }, []);

  async function signIn(event) {
    event.preventDefault(); setAuthError('');
    if (!supabase) { setAuthError('Connect the new Supabase project to enable sign in.'); return; }
    setLoading(true);
    const {error} = await supabase.auth.signInWithPassword({email,password});
    if (error) setAuthError(error.message);
    setLoading(false);
  }
  async function signOut() { if (supabase) await supabase.auth.signOut(); setSession(null); setProfile(null); }

  async function saveCourse(event) {
    event.preventDefault();
    if (!supabase || !session) { setNotice('Connect Supabase and sign in to save courses.'); return; }
    const payload = {...courseForm,price:Number(courseForm.price||0),created_by:session.user.id};
    const {data,error} = await supabase.from('courses').insert(payload).select().single();
    if (error) { setNotice(error.message); return; }
    setCourses([data,...courses]); setShowCourse(false); setCourseForm({title:'',description:'',price:'',level:'Class 9–10'}); setNotice('Course created successfully.');
  }
  async function openCourse(course) {
    setSelectedCourse(course); setPage('courses');
    if (!supabase || String(course.id).startsWith('demo')) { setLessons([]); return; }
    const {data,error} = await supabase.from('lessons').select('*').eq('course_id',course.id).order('sort_order');
    if (error) setNotice(error.message); else setLessons(data||[]);
  }
  async function saveLesson(event) {
    event.preventDefault();
    if (!supabase || !session || !selectedCourse) { setNotice('Connect Supabase and select a saved course first.'); return; }
    const {data,error} = await supabase.from('lessons').insert({...lessonForm,course_id:selectedCourse.id,created_by:session.user.id,sort_order:lessons.length+1}).select().single();
    if (error) { setNotice(error.message); return; }
    setLessons([...lessons,data]); setShowLesson(false); setLessonForm({title:'',video_url:'',duration:''}); setNotice('Video lesson added.');
  }
  async function createPerson(event) {
    event.preventDefault();
    if (!supabase) return setNotice('Connect Supabase before creating accounts.');
    const {data:{session:current}} = await supabase.auth.getSession();
    const {data,error} = await supabase.functions.invoke('admin-create-user',{body:personForm,headers:{Authorization:'Bearer '+current.access_token}});
    if (error || data?.error) { setNotice(error?.message || data.error); return; }
    setShowPerson(false); setPersonForm({email:'',password:'',full_name:'',role:'teacher'}); setNotice('Approved account created. Share credentials securely with the new user.');
  }

  if (!session && isSupabaseConfigured) return <div className="auth-screen"><div className="auth-card"><Brand/><span className="eyebrow">YOUR LEARNING JOURNEY STARTS HERE</span><h1>Welcome back.</h1><p>Sign in to your SK Science workspace.</p><form onSubmit={signIn} className="form-stack"><label>Email address<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" required/></label><label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Enter your password" required/></label>{authError&&<div className="alert">{authError}</div>}<button className="primary-btn wide" disabled={loading}>{loading?'Signing in…':'Sign in to dashboard'} <ArrowUpRight size={17}/></button></form><div className="auth-foot">Access is limited to approved SK Science accounts.</div></div></div>;

  return <div className="app-shell">
    <aside className={'sidebar '+(mobileNav?'sidebar-open':'')}><div className="side-top"><Brand/><button className="icon-btn mobile-close" onClick={()=>setMobileNav(false)}><X/></button></div>
      <div className="workspace-label">WORKSPACE</div><nav className="nav-list">{nav.filter(item=>item.id!=='people'||isAdmin).map(item=><button key={item.id} className={'nav-item '+(page===item.id?'active':'')} onClick={()=>{setPage(item.id);setSelectedCourse(null);setMobileNav(false)}}><item.icon size={18}/><span>{item.label}</span>{item.id==='courses'&&<span className="nav-count">{courses.length}</span>}</button>)}</nav>
      <div className="side-spacer"/>
      <div className="upgrade-card"><div className="upgrade-icon"><Sparkles size={17}/></div><strong>Make learning limitless</strong><p>Keep every class, lesson and learner in one place.</p><button onClick={()=>setPage('courses')}>Explore courses <ArrowUpRight size={14}/></button></div>
      <button className="nav-item side-help" onClick={()=>setNotice('For account or course support, contact your SK Science administrator.')}><CircleHelp size={18}/> Help & support</button>
      <div className="side-user"><div className="avatar">{initials}</div><div className="user-meta"><strong>{profile?.full_name || (session?.user?.email ? session.user.email.split('@')[0] : 'SK Science Admin')}</strong><span>{role} account</span></div><button className="icon-btn" title="Sign out" onClick={signOut}><LogOut size={17}/></button></div>
    </aside>
    <main className="main-area"><header className="topbar"><div className="top-left"><button className="icon-btn mobile-menu" onClick={()=>setMobileNav(true)}><Menu/></button><div className="breadcrumb">Workspace <span>/</span> <strong>{pageTitle}</strong></div></div><div className="top-actions"><div className="search-box"><Search size={16}/><input placeholder="Search anything..." onKeyDown={e=>e.key==='Enter'&&setPage('courses')}/><kbd>⌘ K</kbd></div><button className="icon-btn notification" onClick={()=>setNotice('You are all caught up.')}><Bell size={18}/><i/></button><div className="avatar small">{initials}</div></div></header>
      <div className="content-wrap">
        {!isSupabaseConfigured&&<div className="demo-banner"><Activity size={16}/><span><strong>Preview mode</strong> — connect your new Supabase project to activate secure login, database and account management.</span></div>}
        {notice&&<div className="notice"><CheckCircle2 size={16}/>{notice}<button onClick={()=>setNotice('')}><X size={15}/></button></div>}
        {loading&&<div className="loading-line">Loading your workspace…</div>}
        {page==='overview'&&<><section className="welcome-row"><div><span className="eyebrow">{greeting.toUpperCase()}</span><h1>Welcome to your <em>learning space.</em></h1><p>Here’s what’s happening across SK Science today.</p></div><button className="primary-btn" onClick={()=>{setPage('courses');setShowCourse(true)}}><Plus size={17}/> Create a course</button></section>
          <section className="stats-grid"><Stat icon={BookOpen} label="Total courses" value={courses.length} change="Ready to learn" tone="blue"/><Stat icon={Users} label="Active learners" value="—" change="Connect your data" tone="purple"/><Stat icon={PlayCircle} label="Video lessons" value={courses.reduce((n,c)=>n+Number(c.lessons_count||0),0)||'—'} change="Across your courses" tone="orange"/><Stat icon={Wallet} label="Course revenue" value="—" change="Payments setup pending" tone="green"/></section>
          <section className="section-heading"><div><span className="eyebrow">YOUR CLASSROOM</span><h2>Continue building great courses</h2></div><button className="text-btn" onClick={()=>setPage('courses')}>View all courses <ArrowUpRight size={15}/></button></section>
          <div className="course-grid">{courses.slice(0,3).map((course,i)=><CourseCard key={course.id} course={course} index={i} onOpen={openCourse}/>)}</div>
          <section className="bottom-grid"><div className="panel schedule-panel"><div className="panel-head"><div><span className="eyebrow">UP NEXT</span><h3>Upcoming schedule</h3></div><button className="text-btn" onClick={()=>setPage('schedule')}>Full schedule <ArrowUpRight size={14}/></button></div><div className="empty-state"><div className="empty-icon"><CalendarDays/></div><strong>Your schedule will appear here</strong><p>Plan live classes and keep every learner on track.</p><button className="outline-btn" onClick={()=>setPage('schedule')}>Open schedule</button></div></div><div className="panel insight-panel"><div className="panel-head"><div><span className="eyebrow">QUICK TIP</span><h3>Small steps, big progress</h3></div><Sparkles size={18} className="tip-spark"/></div><div className="tip-art"><div className="tip-orbit orbit-one"/><div className="tip-orbit orbit-two"/><GraduationCap size={48}/></div><strong>Make every lesson count.</strong><p>Add short video lessons, clear learning goals and practice material to each course.</p></div></section>
        </>}
        {page==='courses'&&<><section className="page-heading"><div><span className="eyebrow">COURSE LIBRARY</span><h1>{selectedCourse?selectedCourse.title:'Your courses'}</h1><p>{selectedCourse?'Manage the course content and video lessons.':'Create, organize and share your science courses.'}</p></div><div className="heading-actions">{selectedCourse&&<button className="outline-btn" onClick={()=>setSelectedCourse(null)}>← All courses</button>}{canTeach&&!selectedCourse&&<button className="primary-btn" onClick={()=>setShowCourse(true)}><Plus size={17}/> New course</button>}{canTeach&&selectedCourse&&<button className="primary-btn" onClick={()=>setShowLesson(true)}><Plus size={17}/> Add video lesson</button>}</div></section>
          {selectedCourse?<><div className="course-detail-card"><div className="detail-cover"><PlayCircle size={42}/><span>{selectedCourse.level||'Science course'}</span></div><div className="detail-copy"><span className="eyebrow">COURSE OVERVIEW</span><h2>{selectedCourse.title}</h2><p>{selectedCourse.description}</p><strong>{money(selectedCourse.price)}</strong></div></div><div className="section-heading"><div><span className="eyebrow">LEARNING CONTENT</span><h2>Video lessons</h2></div><span className="muted">{lessons.length} lessons</span></div>{lessons.length?<div className="lesson-list">{lessons.map((lesson,i)=><div className="lesson-row" key={lesson.id}><div className="lesson-number">{String(i+1).padStart(2,'0')}</div><div className="lesson-play"><PlayCircle size={19}/></div><div className="lesson-copy"><strong>{lesson.title}</strong><span>{lesson.duration||'Video lesson'}</span></div><a className="text-btn" href={lesson.video_url} target="_blank" rel="noreferrer">Watch <ArrowUpRight size={14}/></a></div>)}</div>:<Empty title="No lessons added yet" text="Add your first video lesson to start building this course." action={canTeach?<button className="outline-btn" onClick={()=>setShowLesson(true)}>Add a video lesson</button>:null}/>}</>:<div className="course-grid full-grid">{courses.map((course,i)=><CourseCard key={course.id} course={course} index={i} onOpen={openCourse}/>)}</div>}
        </>}
        {page==='schedule'&&<><section className="page-heading"><div><span className="eyebrow">CLASS PLANNER</span><h1>Schedule</h1><p>Keep live sessions and learning milestones organized.</p></div></section><div className="panel large-empty"><Empty title="Your class calendar is ready" text="The calendar will show sessions after the class schedule module is connected." action={<button className="outline-btn" onClick={()=>setNotice('Live class scheduling is the next module to configure.')}>Plan a class</button>}/></div></>}
        {page==='people'&&<><section className="page-heading"><div><span className="eyebrow">TEAM & ACCESS</span><h1>People</h1><p>Manage approved teachers and team access.</p></div><button className="primary-btn" onClick={()=>setShowPerson(true)}><Plus size={17}/> Add a person</button></section><div className="panel people-panel"><div className="panel-head"><div><h3>Workspace access</h3><p>Only administrator-approved accounts can sign in.</p></div><ShieldCheck className="secure-icon"/></div><div className="role-row"><div className="role-icon admin-role"><ShieldCheck/></div><div><strong>Administrator</strong><span>Full access to courses, people and settings</span></div><span className="role-pill">Admin</span></div><div className="role-row"><div className="role-icon teacher-role"><GraduationCap/></div><div><strong>Teacher</strong><span>Create courses and manage video lessons</span></div><span className="role-pill">Teacher</span></div><div className="role-row"><div className="role-icon student-role"><BookOpen/></div><div><strong>Student</strong><span>Access enrolled learning content</span></div><span className="role-pill">Student</span></div></div></>}
        {page==='payments'&&<><section className="page-heading"><div><span className="eyebrow">BILLING & ENROLLMENT</span><h1>Payments</h1><p>Course pricing is ready; payment collection is not yet activated.</p></div></section><div className="panel large-empty"><div className="payment-mark"><Wallet size={28}/></div><h2>Payment gateway setup comes next</h2><p>Razorpay test mode should be configured first. Live payments must wait for verified server-side order creation, signature checks and webhook handling.</p><button className="outline-btn" onClick={()=>setNotice('No live payment requests are being processed.')}>Got it</button></div></>}
      </div>
    </main>
    {showCourse&&<Modal title="Create a course" close={()=>setShowCourse(false)}><form className="form-stack" onSubmit={saveCourse}><label>Course name<input required value={courseForm.title} onChange={e=>setCourseForm({...courseForm,title:e.target.value})} placeholder="e.g. Physics Masterclass"/></label><label>Description<textarea required value={courseForm.description} onChange={e=>setCourseForm({...courseForm,description:e.target.value})} placeholder="What will students learn?"/></label><div className="two-fields"><label>Price (INR)<input type="number" min="0" value={courseForm.price} onChange={e=>setCourseForm({...courseForm,price:e.target.value})} placeholder="1499"/></label><label>Level<select value={courseForm.level} onChange={e=>setCourseForm({...courseForm,level:e.target.value})}><option>Class 8–10</option><option>Class 11–12</option><option>Foundation</option><option>Competitive exam</option></select></label></div><button className="primary-btn wide">Save course</button></form></Modal>}
    {showLesson&&<Modal title="Add a video lesson" close={()=>setShowLesson(false)}><form className="form-stack" onSubmit={saveLesson}><label>Lesson title<input required value={lessonForm.title} onChange={e=>setLessonForm({...lessonForm,title:e.target.value})} placeholder="e.g. Newton's laws of motion"/></label><label>Video URL<input type="url" required value={lessonForm.video_url} onChange={e=>setLessonForm({...lessonForm,video_url:e.target.value})} placeholder="https://…"/></label><label>Duration<input value={lessonForm.duration} onChange={e=>setLessonForm({...lessonForm,duration:e.target.value})} placeholder="e.g. 18 min"/></label><button className="primary-btn wide">Add lesson</button></form></Modal>}
    {showPerson&&<Modal title="Create an approved account" close={()=>setShowPerson(false)}><form className="form-stack" onSubmit={createPerson}><label>Full name<input required value={personForm.full_name} onChange={e=>setPersonForm({...personForm,full_name:e.target.value})} placeholder="Teacher name"/></label><label>Email address<input type="email" required value={personForm.email} onChange={e=>setPersonForm({...personForm,email:e.target.value})} placeholder="teacher@example.com"/></label><label>Temporary password<input type="password" minLength="8" required value={personForm.password} onChange={e=>setPersonForm({...personForm,password:e.target.value})} placeholder="At least 8 characters"/></label><label>Role<select value={personForm.role} onChange={e=>setPersonForm({...personForm,role:e.target.value})}><option value="teacher">Teacher</option><option value="student">Student</option></select></label><p className="form-note">Account creation uses a protected server function. Passwords are not stored in this website's database.</p><button className="primary-btn wide">Create approved account</button></form></Modal>}
  </div>;
}

function Brand(){return <div className="brand"><div className="brand-mark"><span>S</span><i/></div><div><strong>SK SCIENCE</strong><small>LEARN BEYOND LIMITS</small></div></div>}
function Stat({icon:Icon,label,value,change,tone}){return <div className="stat-card"><div className={'stat-icon '+tone}><Icon size={19}/></div><span>{label}</span><strong>{value}</strong><small>{change}</small></div>}
function CourseCard({course,index,onOpen}){const tones=['blue','violet','gold'];return <button className="course-card" onClick={()=>onOpen(course)}><div className={'course-art '+tones[index%3]}><div className="art-orbit"/><span>{course.level||'SCIENCE'}</span><BookOpen size={37}/></div><div className="course-info"><div className="course-meta"><span>{course.level||'SCIENCE'}</span><span>{course.lessons_count||0} lessons</span></div><h3>{course.title}</h3><p>{course.description}</p><div className="course-bottom"><strong>{money(course.price)}</strong><span>View course <ArrowUpRight size={14}/></span></div></div></button>}
function Modal({title,close,children}){return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&close()}><div className="modal"><div className="modal-head"><h2>{title}</h2><button className="icon-btn" onClick={close}><X/></button></div>{children}</div></div>}
function Empty({title,text,action}){return <div className="empty-state"><div className="empty-icon"><BookOpen/></div><strong>{title}</strong><p>{text}</p>{action}</div>}
