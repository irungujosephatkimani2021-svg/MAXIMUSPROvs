const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "data", "db.json");

app.use(express.json({limit:"2mb"}));
app.use(express.urlencoded({extended:true}));
app.use(session({
  secret: process.env.SESSION_SECRET || "change-this-maximuspro-secret",
  resave:false,
  saveUninitialized:false,
  cookie:{httpOnly:true,sameSite:"lax",secure:false,maxAge:8*60*60*1000}
}));
app.use(express.static(path.join(__dirname,"public")));

function load(){
  if(!fs.existsSync(DATA_FILE)) return seed();
  return JSON.parse(fs.readFileSync(DATA_FILE,"utf8"));
}
function save(db){
  fs.writeFileSync(DATA_FILE, JSON.stringify(db,null,2));
}
function id(prefix){ return prefix+"_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,8); }

function seed(){
  const school1=id("sch"), school2=id("sch");
  const db={
    schools:[
      {id:school1,name:"MAXIMUS Academy",motto:"Knowledge and Excellence",phone:"0700000001",email:"admin@maximus.ac.ke",status:"active"},
      {id:school2,name:"Example Secondary School",motto:"Education for Life",phone:"0700000002",email:"admin@example.ac.ke",status:"active"}
    ],
    users:[], classes:[], students:[], exams:[], marks:[], notifications:[]
  };
  db.users.push(
    {id:id("usr"),username:"superadmin",password:bcrypt.hashSync("Maximus123!",10),name:"Super Administrator",role:"SUPER_ADMIN",schoolId:null},
    {id:id("usr"),username:"admin1",password:bcrypt.hashSync("School123!",10),name:"School Administrator",role:"SCHOOL_ADMIN",schoolId:school1},
    {id:id("usr"),username:"admin2",password:bcrypt.hashSync("School123!",10),name:"School Administrator",role:"SCHOOL_ADMIN",schoolId:school2}
  );
  for(const [s, n] of [[school1,"MAXIMUS Academy"],[school2,"Example Secondary School"]]){
    ["Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6","Grade 7","Grade 8","Grade 9"].forEach((g,i)=>{
      db.classes.push({id:id("cls"),schoolId:s,name:g,stream:"A"});
    });
  }
  save(db); return db;
}

let db=load();

function currentUser(req){ return req.session.user ? db.users.find(u=>u.id===req.session.user.id) : null; }
function auth(req,res,next){
  const u=currentUser(req);
  if(!u) return res.status(401).json({error:"Authentication required"});
  if(u.schoolId && !db.schools.some(s=>s.id===u.schoolId && s.status==="active"))
    return res.status(403).json({error:"School is locked or unavailable"});
  req.user=u; next();
}
function requireRole(...roles){
  return (req,res,next)=>{
    if(!roles.includes(req.user.role)) return res.status(403).json({error:"Insufficient permission"});
    next();
  };
}
/* TENANT GUARD:
   Never trust schoolId supplied by a school user. Resolve it from req.user.
   Super Admin may explicitly select a school. */
function tenantId(req){
  if(req.user.role==="SUPER_ADMIN"){
    const requested=req.params.schoolId || req.body.schoolId || req.query.schoolId;
    return requested || null;
  }
  return req.user.schoolId;
}
function schoolOwned(req, record){
  return req.user.role==="SUPER_ADMIN" || record.schoolId===req.user.schoolId;
}

app.get("/api/me",auth,(req,res)=>res.json({
  user:{id:req.user.id,username:req.user.username,name:req.user.name,role:req.user.role,schoolId:req.user.schoolId},
  school:req.user.schoolId ? db.schools.find(s=>s.id===req.user.schoolId) : null
}));

app.post("/api/login",(req,res)=>{
  const {username,password}=req.body;
  const u=db.users.find(x=>x.username===username);
  if(!u || !bcrypt.compareSync(password||"",u.password)) return res.status(401).json({error:"Invalid username or password"});
  if(u.schoolId){
    const s=db.schools.find(x=>x.id===u.schoolId);
    if(!s || s.status!=="active") return res.status(403).json({error:"School is locked"});
  }
  req.session.user={id:u.id};
  res.json({ok:true});
});
app.post("/api/logout",(req,res)=>req.session.destroy(()=>res.json({ok:true})));

app.get("/api/dashboard",auth,(req,res)=>{
  const sid=tenantId(req);
  const schools=req.user.role==="SUPER_ADMIN"?db.schools:db.schools.filter(s=>s.id===sid);
  const scoped=(arr)=>req.user.role==="SUPER_ADMIN" && !sid ? arr : arr.filter(x=>x.schoolId===sid);
  res.json({
    schools:schools.length,
    teachers:scoped(db.users).filter(u=>["TEACHER","SCHOOL_ADMIN","DOS","HOI"].includes(u.role)).length,
    learners:scoped(db.students).length,
    classes:scoped(db.classes).length,
    exams:scoped(db.exams).length,
    marks:scoped(db.marks).length,
    notifications:scoped(db.notifications).slice(-10).reverse()
  });
});

/* SCHOOLS: Super Admin only */
app.get("/api/schools",auth,requireRole("SUPER_ADMIN"),(req,res)=>res.json(db.schools));
app.post("/api/schools",auth,requireRole("SUPER_ADMIN"),(req,res)=>{
  const s={id:id("sch"),name:req.body.name?.trim(),motto:req.body.motto||"",phone:req.body.phone||"",email:req.body.email||"",status:"active"};
  if(!s.name) return res.status(400).json({error:"School name is required"});
  db.schools.push(s); save(db); res.json(s);
});
app.patch("/api/schools/:id",auth,requireRole("SUPER_ADMIN"),(req,res)=>{
  const s=db.schools.find(x=>x.id===req.params.id); if(!s) return res.status(404).json({error:"School not found"});
  Object.assign(s,{name:req.body.name??s.name,motto:req.body.motto??s.motto,phone:req.body.phone??s.phone,email:req.body.email??s.email,status:req.body.status??s.status});
  save(db); res.json(s);
});


// ---- MAXIMUSPRO ACADEMIC ENGINE ----
const DEFAULT_LEVELS=[{code:'BE2',points:1,min:0,max:12},{code:'BE1',points:2,min:12.01,max:25},{code:'AE2',points:3,min:25.01,max:37},{code:'AE1',points:4,min:37.01,max:50},{code:'ME2',points:5,min:50.01,max:62},{code:'ME1',points:6,min:62.01,max:75},{code:'EE2',points:7,min:75.01,max:87},{code:'EE1',points:8,min:87.01,max:100}];
function levelFor(exam,p){const r=(exam.gradingRules||DEFAULT_LEVELS).find(x=>p>=+x.min&&p<=+x.max);return r||DEFAULT_LEVELS[DEFAULT_LEVELS.length-1]}
app.get('/api/grading-levels',auth,(req,res)=>res.json(DEFAULT_LEVELS));
app.post('/api/exams/:id/lock',auth,requireRole('SUPER_ADMIN','SCHOOL_ADMIN','DOS'),(req,res)=>{const e=db.exams.find(x=>x.id===req.params.id);if(!e||!schoolOwned(req,e))return res.status(404).json({error:'Exam not found'});e.locked=!!req.body.locked;save(db);res.json(e)});
app.put('/api/exams/:id/grading',auth,requireRole('SUPER_ADMIN','SCHOOL_ADMIN','DOS'),(req,res)=>{const e=db.exams.find(x=>x.id===req.params.id);if(!e||!schoolOwned(req,e))return res.status(404).json({error:'Exam not found'});if(e.locked)return res.status(409).json({error:'Unlock exam first'});const r=req.body.rules;if(!Array.isArray(r)||!r.length)return res.status(400).json({error:'Rules required'});r.sort((a,b)=>+a.min-+b.min);for(let i=0;i<r.length;i++){if(+r[i].min<0||+r[i].max>100||+r[i].min>+r[i].max||(i&&+r[i].min<=+r[i-1].max))return res.status(400).json({error:'Invalid or overlapping grading range'})}e.gradingRules=r;save(db);res.json(e)});
app.get('/api/exams/:id/merit',auth,(req,res)=>{const e=db.exams.find(x=>x.id===req.params.id);if(!e||!schoolOwned(req,e))return res.status(404).json({error:'Exam not found'});const st=db.students.filter(x=>x.schoolId===e.schoolId),ms=db.marks.filter(x=>x.schoolId===e.schoolId&&x.examId===e.id);const rows=st.map(s=>{const a=ms.filter(m=>m.studentId===s.id);const avg=a.length?a.reduce((q,m)=>q+m.percent,0)/a.length:0;const pts=a.reduce((q,m)=>q+(m.points||levelFor(e,m.percent).points),0);return {admissionNo:s.admissionNo,name:s.name,classId:s.classId,stream:s.stream||'',entry:a.length,totalMarks:a.reduce((q,m)=>q+m.percent,0),average:+avg.toFixed(2),totalPoints:pts,averagePoints:a.length?+(pts/a.length).toFixed(2):0,performanceLevel:a.length?levelFor(e,avg).code:''}}).filter(x=>x.entry).sort((a,b)=>b.average-a.average);rows.forEach((x,i)=>x.position=i+1);res.json({exam:e,rows})});
app.get('/api/exams/:id/grade-distribution',auth,(req,res)=>{const e=db.exams.find(x=>x.id===req.params.id);if(!e||!schoolOwned(req,e))return res.status(404).json({error:'Exam not found'});const d={};db.marks.filter(m=>m.schoolId===e.schoolId&&m.examId===e.id).forEach(m=>{const k=m.performanceLevel||levelFor(e,m.percent).code;d[k]=(d[k]||0)+1});res.json({exam:e,distribution:d})});

/* Generic tenant-safe resources */
function resourceRoutes(name, roles, validate=()=>null){
  app.get("/api/"+name,auth,(req,res)=>{
    const sid=tenantId(req);
    let rows=db[name];
    if(req.user.role!=="SUPER_ADMIN" || sid) rows=rows.filter(x=>x.schoolId===sid);
    res.json(rows);
  });
  app.post("/api/"+name,auth,requireRole(...roles),(req,res)=>{
    const err=validate(req.body); if(err) return res.status(400).json({error:err});
    const sid=req.user.role==="SUPER_ADMIN" ? req.body.schoolId : req.user.schoolId;
    if(!sid || !db.schools.some(s=>s.id===sid)) return res.status(400).json({error:"Valid school context required"});
    const row={...req.body,id:id(name.slice(0,3)),schoolId:sid};
    delete row.password;
    db[name].push(row); save(db); res.json(row);
  });
  app.put("/api/"+name+"/:id",auth,requireRole(...roles),(req,res)=>{
    const row=db[name].find(x=>x.id===req.params.id);
    if(!row || !schoolOwned(req,row)) return res.status(404).json({error:"Record not found"});
    const protectedSchool=row.schoolId;
    Object.assign(row,req.body); row.id=req.params.id; row.schoolId=protectedSchool;
    save(db); res.json(row);
  });
  app.delete("/api/"+name+"/:id",auth,requireRole(...roles),(req,res)=>{
    const idx=db[name].findIndex(x=>x.id===req.params.id && schoolOwned(req,x));
    if(idx<0) return res.status(404).json({error:"Record not found"});
    db[name].splice(idx,1); save(db); res.json({ok:true});
  });
}
resourceRoutes("classes",["SUPER_ADMIN","SCHOOL_ADMIN","DOS"], b=>!b.name?"Class name required":null);
resourceRoutes("students",["SUPER_ADMIN","SCHOOL_ADMIN","DOS"], b=>!b.admissionNo||!b.name?"Admission number and name required":null);
resourceRoutes("exams",["SUPER_ADMIN","SCHOOL_ADMIN","DOS"], b=>!b.name?"Exam name required":null);
resourceRoutes("notifications",["SUPER_ADMIN","SCHOOL_ADMIN","DOS","HOI","DEPUTY_HOI"], b=>!b.head||!b.body?"Head and body required":null);

/* Teachers/users without exposing password hashes */
app.get("/api/teachers",auth,(req,res)=>{
  const sid=tenantId(req);
  const rows=db.users.filter(u=>["TEACHER","SCHOOL_ADMIN","DOS","HOI","DEPUTY_HOI","SENIOR_TEACHER","HOD","LIBRARIAN","LAB_TECH","ICT_TEACHER","ACCOUNTANT","GAMES_MASTER","SUPPORT_STAFF"].includes(u.role))
    .filter(u=>req.user.role==="SUPER_ADMIN"&&!sid ? true : u.schoolId===sid)
    .map(({password,...u})=>u);
  res.json(rows);
});
app.post("/api/teachers",auth,requireRole("SUPER_ADMIN","SCHOOL_ADMIN","DOS"),(req,res)=>{
  const sid=req.user.role==="SUPER_ADMIN"?req.body.schoolId:req.user.schoolId;
  if(!sid) return res.status(400).json({error:"School context required"});
  const username=req.body.username || `${String(req.body.name||"user").toLowerCase().replace(/[^a-z0-9]+/g,".")}@${sid.slice(-6)}`;
  if(db.users.some(u=>u.username===username)) return res.status(409).json({error:"Username already exists"});
  const u={id:id("usr"),username,name:req.body.name||"",role:req.body.role||"TEACHER",schoolId:sid,password:bcrypt.hashSync(req.body.password||"ChangeMe123!",10)};
  db.users.push(u); save(db); const {password,...safe}=u; res.json(safe);
});

/* Marks: strong tenant checks and score validation */
app.get("/api/marks",auth,(req,res)=>{
  const sid=tenantId(req);
  let rows=db.marks.filter(m=>req.user.role==="SUPER_ADMIN"&&!sid ? true : m.schoolId===sid);
  for(const k of ["classId","examId","studentId","learningArea"]) if(req.query[k]) rows=rows.filter(r=>String(r[k])===String(req.query[k]));
  res.json(rows);
});
app.post("/api/marks",auth,requireRole("SUPER_ADMIN","SCHOOL_ADMIN","DOS","TEACHER"),(req,res)=>{
  const sid=req.user.role==="SUPER_ADMIN"?req.body.schoolId:req.user.schoolId;
  const student=db.students.find(s=>s.id===req.body.studentId);
  if(!student || student.schoolId!==sid) return res.status(400).json({error:"Student is outside the current school"});
  const exam=db.exams.find(e=>e.id===req.body.examId);
  if(!exam || exam.schoolId!==sid) return res.status(400).json({error:"Exam is outside the current school"});
  const raw=Number(req.body.rawScore), max=Number(req.body.maximum);
  if(!Number.isFinite(raw)||!Number.isFinite(max)||max<=0||raw<0||raw>max) return res.status(400).json({error:"Invalid score or maximum"});
  const percent=Math.round(raw/max*10000)/100;
  const lev=levelFor(exam,percent);
  const row={id:id("mrk"),schoolId:sid,studentId:student.id,examId:exam.id,classId:student.classId,learningArea:req.body.learningArea||"",rawScore:raw,maximum:max,percent,performanceLevel:lev.code,points:lev.points,missed:!!req.body.missed,createdBy:req.user.id};
  db.marks.push(row); save(db); res.json(row);
});

/* Simple analysis endpoint */
app.get("/api/analysis/:examId",auth,(req,res)=>{
  const exam=db.exams.find(e=>e.id===req.params.examId);
  if(!exam || !schoolOwned(req,exam)) return res.status(404).json({error:"Exam not found"});
  const students=db.students.filter(s=>s.schoolId===exam.schoolId);
  const marks=db.marks.filter(m=>m.schoolId===exam.schoolId && m.examId===exam.id);
  const byStudent=students.map(s=>{
    const ms=marks.filter(m=>m.studentId===s.id);
    const avg=ms.length?ms.reduce((a,b)=>a+b.percent,0)/ms.length:0;
    return {admissionNo:s.admissionNo,name:s.name,classId:s.classId,entries:ms.length,average:Math.round(avg*100)/100};
  }).filter(x=>x.entries).sort((a,b)=>b.average-a.average);
  res.json({exam,learners:byStudent,mean:byStudent.length?Math.round(byStudent.reduce((a,b)=>a+b.average,0)/byStudent.length*100)/100:0});
});


/* ================= MAXIMUSPRO ADMINISTRATION / FINANCE / OPERATIONS ================= */
function safeTenant(req, row){ return row && (req.user.role==="SUPER_ADMIN" || row.schoolId===req.user.schoolId); }
function scoped(req, arr, sid){
  const target=sid || tenantId(req);
  return (req.user.role==="SUPER_ADMIN" && !target) ? arr : arr.filter(x=>x.schoolId===target);
}
function crud(name, roles, required=[]){
  if(!db[name]) db[name]=[];
  app.get("/api/"+name,auth,(req,res)=>res.json(scoped(req,db[name])));
  app.post("/api/"+name,auth,requireRole(...roles),(req,res)=>{
    const sid=req.user.role==="SUPER_ADMIN"?req.body.schoolId:req.user.schoolId;
    if(!sid || !db.schools.some(x=>x.id===sid)) return res.status(400).json({error:"Valid school context required"});
    for(const k of required) if(req.body[k]===undefined||String(req.body[k]).trim()==="") return res.status(400).json({error:k+" is required"});
    const row={...req.body,id:id(name.slice(0,3)),schoolId:sid,createdAt:new Date().toISOString()};
    db[name].push(row);save(db);res.json(row);
  });
  app.put("/api/"+name+"/:id",auth,requireRole(...roles),(req,res)=>{
    const row=db[name].find(x=>x.id===req.params.id);
    if(!row||!safeTenant(req,row)) return res.status(404).json({error:"Record not found"});
    const sid=row.schoolId;Object.assign(row,req.body);row.id=req.params.id;row.schoolId=sid;save(db);res.json(row);
  });
}
crud("fees",["SUPER_ADMIN","SCHOOL_ADMIN","ACCOUNTANT"],["studentId","amount"]);
crud("expenses",["SUPER_ADMIN","SCHOOL_ADMIN","ACCOUNTANT"],["description","amount"]);
crud("attendance",["SUPER_ADMIN","SCHOOL_ADMIN","DOS","TEACHER"],["studentId","date","status"]);
crud("timetables",["SUPER_ADMIN","SCHOOL_ADMIN","DOS","HOI"],["classId","day","startTime","endTime"]);
crud("libraryBooks",["SUPER_ADMIN","SCHOOL_ADMIN","LIBRARIAN"],["title"]);
crud("libraryLoans",["SUPER_ADMIN","SCHOOL_ADMIN","LIBRARIAN"],["bookId","studentId"]);
crud("laboratoryItems",["SUPER_ADMIN","SCHOOL_ADMIN","LAB_TECH"],["name"]);
crud("ictAssets",["SUPER_ADMIN","SCHOOL_ADMIN","ICT_TEACHER"],["name"]);
crud("games",["SUPER_ADMIN","SCHOOL_ADMIN","GAMES_MASTER"],["name"]);

app.get("/api/finance/summary",auth,(req,res)=>{
  const sid=tenantId(req), fees=scoped(req,db.fees||[],sid), expenses=scoped(req,db.expenses||[],sid);
  const invoiced=fees.reduce((a,x)=>a+Number(x.amount||0),0);
  const paid=fees.filter(x=>x.status==="paid").reduce((a,x)=>a+Number(x.amount||0),0);
  const outstanding=invoiced-paid;
  res.json({invoiced,paid,outstanding,expenses:expenses.reduce((a,x)=>a+Number(x.amount||0),0)});
});

app.post("/api/fees/:id/pay",auth,requireRole("SUPER_ADMIN","SCHOOL_ADMIN","ACCOUNTANT"),(req,res)=>{
  const f=db.fees.find(x=>x.id===req.params.id);
  if(!f||!safeTenant(req,f)) return res.status(404).json({error:"Fee record not found"});
  const amount=Number(req.body.amount);
  if(!Number.isFinite(amount)||amount<=0) return res.status(400).json({error:"Invalid payment amount"});
  const previous=Number(f.paid||0), total=Number(f.amount||0);
  f.paid=previous+amount;f.status=f.paid>=total?"paid":"partial";f.paymentRef=req.body.paymentRef||id("pay");
  f.paidAt=new Date().toISOString();save(db);
  res.json({ok:true,fee:f,receipt:{receiptNo:"RCP-"+Date.now(),amount,paymentRef:f.paymentRef}});
});

app.get("/api/fees/student/:studentId",auth,(req,res)=>{
  const student=db.students.find(x=>x.id===req.params.studentId);
  if(!student||!safeTenant(req,student)) return res.status(404).json({error:"Learner not found"});
  res.json((db.fees||[]).filter(x=>x.schoolId===student.schoolId&&x.studentId===student.id));
});

app.get("/api/attendance/summary/:studentId",auth,(req,res)=>{
  const st=db.students.find(x=>x.id===req.params.studentId);
  if(!st||!safeTenant(req,st)) return res.status(404).json({error:"Learner not found"});
  const rows=(db.attendance||[]).filter(x=>x.schoolId===st.schoolId&&x.studentId===st.id);
  const total=rows.length,present=rows.filter(x=>String(x.status).toLowerCase()==="present").length;
  res.json({total,present,absent:total-present,attendanceRate:total?Math.round(present/total*10000)/100:0});
});

app.get("/api/operations/summary",auth,(req,res)=>{
  const sid=tenantId(req);
  const count=n=>scoped(req,db[n]||[],sid).length;
  res.json({attendance:count("attendance"),timetables:count("timetables"),libraryBooks:count("libraryBooks"),
    libraryLoans:count("libraryLoans"),laboratoryItems:count("laboratoryItems"),ictAssets:count("ictAssets"),games:count("games")});
});


/* ================= V5: PEOPLE / COMMUNICATION / AUDIT / PERMISSIONS ================= */
function v5Crud(name, roles, required=[]){
  if(!db[name]) db[name]=[];
  app.get("/api/"+name,auth,(req,res)=>res.json(scoped(req,db[name])));
  app.post("/api/"+name,auth,requireRole(...roles),(req,res)=>{
    const sid=req.user.role==="SUPER_ADMIN"?req.body.schoolId:req.user.schoolId;
    if(!sid || !db.schools.some(x=>x.id===sid)) return res.status(400).json({error:"Valid school context required"});
    for(const k of required) if(req.body[k]===undefined||String(req.body[k]).trim()==="") return res.status(400).json({error:k+" is required"});
    const row={...req.body,id:id(name.slice(0,3)),schoolId:sid,createdAt:new Date().toISOString()};
    db[name].push(row); save(db); audit(req,"CREATE",name,row.id); res.json(row);
  });
}
v5Crud("guardians",["SUPER_ADMIN","SCHOOL_ADMIN","DOS","HOI"],["name","phone"]);
v5Crud("staff",["SUPER_ADMIN","SCHOOL_ADMIN"],["name","role"]);
v5Crud("messages",["SUPER_ADMIN","SCHOOL_ADMIN","DOS","HOI","TEACHER"],["title","body"]);
v5Crud("schoolSettings",["SUPER_ADMIN","SCHOOL_ADMIN"],["key","value"]);

if(!db.auditLogs) db.auditLogs=[];
function audit(req,action,module,recordId){
  db.auditLogs.push({id:id("aud"),schoolId:req.user.role==="SUPER_ADMIN"?(req.body&&req.body.schoolId)||null:req.user.schoolId,
    userId:req.user.id,action,module,recordId:recordId||"",at:new Date().toISOString()});
  save(db);
}
app.get("/api/audit",auth,requireRole("SUPER_ADMIN","SCHOOL_ADMIN"),(req,res)=>res.json(scoped(req,db.auditLogs||[])));

app.get("/api/permissions",auth,(req,res)=>{
  const role=req.user.role;
  const permissions={
    SUPER_ADMIN:["*"],
    SCHOOL_ADMIN:["school","users","students","teachers","classes","exams","marks","reports","fees","attendance","timetable","library","resources","notifications","guardians","staff","settings","audit"],
    DOS:["students","teachers","classes","exams","marks","reports","attendance","timetable","notifications","guardians"],
    HOI:["students","teachers","classes","reports","attendance","notifications"],
    HOD:["students","classes","marks","reports"],
    TEACHER:["students","classes","marks","attendance","reports"],
    ACCOUNTANT:["fees","expenses","reports"],
    LIBRARIAN:["library"],
    ICT_TEACHER:["ict"],
    LAB_TECH:["laboratory"],
    GAMES_MASTER:["games"]
  };
  res.json({role,permissions:permissions[role]||[]});
});

app.post("/api/messages/:id/read",auth,(req,res)=>{
  const m=db.messages.find(x=>x.id===req.params.id);
  if(!m||!safeTenant(req,m)) return res.status(404).json({error:"Message not found"});
  m.readBy=m.readBy||[]; if(!m.readBy.includes(req.user.id))m.readBy.push(req.user.id);save(db);res.json(m);
});

app.get("/api/school/profile",auth,(req,res)=>{
  const sid=tenantId(req), school=db.schools.find(x=>x.id===sid);
  if(!school)return res.status(404).json({error:"School not found"});
  const settings=(db.schoolSettings||[]).filter(x=>x.schoolId===sid);
  res.json({school,settings});
});

app.get("/api/security/tenant-check",auth,(req,res)=>{
  const sid=tenantId(req);
  const collections=["students","teachers","classes","exams","marks","fees","expenses","attendance","timetables","guardians","staff","messages","libraryBooks","laboratoryItems","ictAssets","games"];
  const counts={};
  for(const n of collections) counts[n]=scoped(req,db[n]||[],sid).length;
  res.json({schoolId:sid,counts});
});


/* ================= V6: ACCOUNT LIFECYCLE / PROVISIONING / BACKUPS ================= */
if(!db.backups) db.backups=[];
if(!db.passwordHistory) db.passwordHistory=[];

function hashPassword(p){ return require("crypto").createHash("sha256").update(String(p)).digest("hex"); }

app.get("/api/users",auth,requireRole("SUPER_ADMIN","SCHOOL_ADMIN"),(req,res)=>{
  const sid=tenantId(req);
  const rows=(db.users||[]).filter(u=>req.user.role==="SUPER_ADMIN" ? true : u.schoolId===sid)
    .map(u=>({id:u.id,username:u.username,name:u.name,role:u.role,schoolId:u.schoolId,status:u.status||"ACTIVE"}));
  res.json(rows);
});

app.post("/api/users",auth,requireRole("SUPER_ADMIN","SCHOOL_ADMIN"),(req,res)=>{
  const sid=req.user.role==="SUPER_ADMIN"?req.body.schoolId:req.user.schoolId;
  const allowed=["SCHOOL_ADMIN","DOS","HOI","DEPUTY_HOI","HOD","TEACHER","ACCOUNTANT","LIBRARIAN","ICT_TEACHER","LAB_TECH","GAMES_MASTER"];
  if(!sid || !db.schools.some(x=>x.id===sid)) return res.status(400).json({error:"Valid school context required"});
  if(!req.body.username||!req.body.name||!req.body.password||!allowed.includes(req.body.role)) return res.status(400).json({error:"name, username, password and valid role are required"});
  if(db.users.some(u=>u.username===req.body.username)) return res.status(409).json({error:"Username already exists"});
  const u={id:id("usr"),schoolId:sid,username:req.body.username,name:req.body.name,role:req.body.role,
    password:hashPassword(req.body.password),status:"ACTIVE",createdAt:new Date().toISOString()};
  db.users.push(u);save(db);audit(req,"CREATE","users",u.id);
  res.json({id:u.id,schoolId:sid,username:u.username,name:u.name,role:u.role,status:u.status});
});

app.post("/api/users/:id/status",auth,requireRole("SUPER_ADMIN","SCHOOL_ADMIN"),(req,res)=>{
  const u=db.users.find(x=>x.id===req.params.id);
  if(!u || !safeTenant(req,u)) return res.status(404).json({error:"User not found"});
  if(u.id===req.user.id && req.body.status==="DISABLED") return res.status(400).json({error:"You cannot disable your own account"});
  if(!["ACTIVE","DISABLED"].includes(req.body.status)) return res.status(400).json({error:"Invalid status"});
  u.status=req.body.status;save(db);audit(req,"STATUS_CHANGE","users",u.id);res.json({ok:true,status:u.status});
});

app.post("/api/users/:id/password",auth,requireRole("SUPER_ADMIN","SCHOOL_ADMIN"),(req,res)=>{
  const u=db.users.find(x=>x.id===req.params.id);
  if(!u || !safeTenant(req,u)) return res.status(404).json({error:"User not found"});
  if(!req.body.password || String(req.body.password).length<8) return res.status(400).json({error:"Password must be at least 8 characters"});
  db.passwordHistory.push({id:id("pwd"),userId:u.id,changedBy:req.user.id,at:new Date().toISOString()});
  u.password=hashPassword(req.body.password);u.mustChangePassword=false;save(db);audit(req,"PASSWORD_CHANGE","users",u.id);res.json({ok:true});
});

app.post("/api/my-password",auth,(req,res)=>{
  if(!req.body.password || String(req.body.password).length<8) return res.status(400).json({error:"Password must be at least 8 characters"});
  const u=db.users.find(x=>x.id===req.user.id);
  if(!u)return res.status(404).json({error:"User not found"});
  u.password=hashPassword(req.body.password);u.mustChangePassword=false;save(db);audit(req,"PASSWORD_CHANGE","users",u.id);res.json({ok:true});
});

app.post("/api/schools/:id/provision",auth,requireRole("SUPER_ADMIN"),(req,res)=>{
  const school=db.schools.find(x=>x.id===req.params.id);
  if(!school)return res.status(404).json({error:"School not found"});
  const username=req.body.username || ("admin_"+school.id);
  if(db.users.some(u=>u.username===username))return res.status(409).json({error:"Username already exists"});
  const password=req.body.password || "ChangeMe123!";
  const u={id:id("usr"),schoolId:school.id,username,name:req.body.name||school.name+" Admin",
    role:"SCHOOL_ADMIN",password:hashPassword(password),status:"ACTIVE",mustChangePassword:true,createdAt:new Date().toISOString()};
  db.users.push(u);save(db);audit(req,"PROVISION","school",school.id);
  res.json({schoolId:school.id,username,password,mustChangePassword:true});
});

app.post("/api/schools/:id/status",auth,requireRole("SUPER_ADMIN"),(req,res)=>{
  const school=db.schools.find(x=>x.id===req.params.id);
  if(!school)return res.status(404).json({error:"School not found"});
  if(!["ACTIVE","SUSPENDED","ARCHIVED"].includes(req.body.status))return res.status(400).json({error:"Invalid school status"});
  school.status=req.body.status;save(db);audit(req,"SCHOOL_STATUS","school",school.id);res.json(school);
});

app.get("/api/backup/export",auth,requireRole("SUPER_ADMIN","SCHOOL_ADMIN"),(req,res)=>{
  const sid=tenantId(req);
  const data={exportedAt:new Date().toISOString(),schoolId:sid,school:db.schools.find(x=>x.id===sid),
    students:scoped(req,db.students||[],sid),teachers:scoped(req,db.teachers||[],sid),classes:scoped(req,db.classes||[],sid),
    exams:scoped(req,db.exams||[],sid),marks:scoped(req,db.marks||[],sid),fees:scoped(req,db.fees||[],sid),
    expenses:scoped(req,db.expenses||[],sid),attendance:scoped(req,db.attendance||[],sid),
    timetables:scoped(req,db.timetables||[],sid),guardians:scoped(req,db.guardians||[],sid),
    staff:scoped(req,db.staff||[],sid),messages:scoped(req,db.messages||[],sid)};
  res.setHeader("Content-Disposition","attachment; filename=MAXIMUSPRO-"+sid+"-backup.json");
  res.json(data);
});

app.get("/api/system/health",auth,(req,res)=>{
  res.json({status:"ok",app:"MAXIMUSPRO",time:new Date().toISOString(),schoolId:tenantId(req),
    collections:Object.fromEntries(Object.keys(db).map(k=>[k,Array.isArray(db[k])?db[k].length:typeof db[k]]))});
});


/* ================= V7: REPORT EXPORTS ================= */
function csvEscape(v){ const x=String(v??""); return `"${x.replace(/"/g,'""')}"`; }
app.get("/api/exams/:id/merit.csv",auth,(req,res)=>{
  const exam=db.exams.find(e=>e.id===req.params.id);
  if(!exam||!schoolOwned(req,exam))return res.status(404).send("Not found");
  const students=db.students.filter(x=>x.schoolId===exam.schoolId);
  const marks=db.marks.filter(x=>x.schoolId===exam.schoolId&&x.examId===exam.id);
  const rows=students.map(st=>{
    const ms=marks.filter(m=>m.studentId===st.id);
    if(!ms.length)return null;
    const avg=ms.reduce((a,m)=>a+Number(m.percent||0),0)/ms.length;
    const points=ms.reduce((a,m)=>a+Number(m.points||0),0);
    return {admissionNo:st.admissionNo,name:st.name,entry:ms.length,average:avg.toFixed(2),points,level:levelFor(exam,avg).code};
  }).filter(Boolean).sort((a,b)=>b.average-a.average);
  const out=["Position,Admission No,Name,Entries,Average %,Points,Level"];
  rows.forEach((r,i)=>out.push([i+1,r.admissionNo,r.name,r.entry,r.average,r.points,r.level].map(csvEscape).join(",")));
  res.setHeader("Content-Type","text/csv; charset=utf-8");
  res.setHeader("Content-Disposition",`attachment; filename="${exam.name.replace(/[^a-z0-9_-]+/gi,"_")}-merit.csv"`);
  res.send(out.join("\n"));
});

app.get("/api/finance.csv",auth,requireRole("SUPER_ADMIN","SCHOOL_ADMIN","ACCOUNTANT"),(req,res)=>{
  const rows=scoped(req,db.fees||[],tenantId(req));
  const out=["Student ID,Description,Amount,Paid,Balance,Status"];
  rows.forEach(r=>out.push([r.studentId,r.description,r.amount,r.paid||0,Math.max(0,Number(r.amount||0)-Number(r.paid||0)),r.status||"unpaid"].map(csvEscape).join(",")));
  res.setHeader("Content-Type","text/csv; charset=utf-8");
  res.setHeader("Content-Disposition","attachment; filename="+"MAXIMUSPRO-fees.csv");
  res.send(out.join("\n"));
});

app.get("*",(req,res)=>{
  res.sendFile(path.join(__dirname,"public","index.html"));
});

app.listen(PORT,()=>console.log(`MAXIMUSPRO running on port ${PORT}`));
