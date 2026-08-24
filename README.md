# MAXIMUSPRO

MAXIMUSPRO is a multi-school management system foundation based on the supplied DIGI-SCHOOL ANALYTICS specification.

## Run on Replit

```bash
npm install
npm start
```

Open the web preview.

## Demo accounts

Super Admin:
- username: `superadmin`
- password: `Maximus123!`

School 1 Admin:
- username: `admin1`
- password: `School123!`

School 2 Admin:
- username: `admin2`
- password: `School123!`

## Critical multi-school security rule

Every school-owned record has a `schoolId`. The server NEVER accepts a schoolId from the browser as authority.

For school users, the server derives the schoolId from the authenticated session and applies it to every read/write. Super Admin is the only role allowed to intentionally select another school.

This is the core tenant-isolation rule and must remain in all future modules.

## Included MVP modules

- Super Admin / School Admin authentication
- School isolation
- Dashboard
- Schools
- Teachers/users
- Classes and streams
- Learners
- Exams
- Marks entry
- Basic analysis
- Reports/export-ready JSON endpoints
- Notifications

The remaining modules from the supplied specification can be added on this same architecture:
Fees, SMS, Timetable, Library, Laboratory, ICT Room and Games.

## Academic engine v2
- Exam lock/unlock.
- BE2..EE1 grading levels with 1..8 points.
- Non-overlapping grading-range validation.
- Percentage normalization from any maximum score.
- Merit-list and grade-distribution endpoints.
- Marks store performance level and points.

## V3 reporting engine

- Exam report endpoint with merit list, school mean, class means, gender analysis and learning-area analysis.
- Previous-exam learner comparison.
- Learning-area summary and performance-level distribution.
- All report endpoints enforce school tenancy.


## V4 administration modules
- Fees, payments, balances and receipt references
- Finance summary
- Attendance and attendance summary
- Timetable
- Library books and loans foundation
- Laboratory inventory
- ICT assets
- Games
- All added records are tenant-scoped by authenticated school ID.


## V5 people, communication and security
- Guardian/parent records
- Staff records
- School messaging foundation
- School settings foundation
- Role-based permission map
- Tenant-aware audit log
- Tenant security diagnostic endpoint
- School profile endpoint
- Message read tracking


## V6 production foundation
- User account lifecycle: create, activate/deactivate, reset password
- School provisioning for Super Admin
- School status controls: ACTIVE/SUSPENDED/ARCHIVED
- Password hashing for new/changed passwords
- School-scoped JSON backup export
- System health endpoint
- Expanded security/permissions UI


## V7 UI/reporting
- Responsive dashboard navigation
- Improved cards, forms, tables and mobile layout
- Table search on generic modules
- Merit-list CSV export
- Finance CSV export
- Quick dashboard actions
- Improved report toolbar
