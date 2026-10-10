// Learnova LMS — mock data (hardcode, tanpa backend)
// Data mentah ini dirakit menjadi "database" oleh store.js (buildDatabase) lalu disimpan di localStorage.
// Naikkan `version` bila struktur data berubah agar database di browser di-seed ulang.

const SEED = {
  version: 4, // v4: ID string opaque + datetime ISO UTC (Sprint 1, DL-01)

  categories: ["Technology", "Science", "Design", "Humanities", "Mathematics"],

  /* ---------------------------------------------------------------------
     USERS — role: admin (operator) | lecturer (dosen) | student (mahasiswa)
     --------------------------------------------------------------------- */
  users: [
    { id: 1, role: "admin", name: "Admin User", email: "admin@learnova.ac.id", password: "admin123", idNumber: "ADM-001", department: "Academic Operations", status: "Active" },

    // Dosen (password semua: dosen123)
    { id: 2, role: "lecturer", name: "Dr. Budi Santoso", email: "budi@learnova.ac.id", password: "dosen123", idNumber: "0412078801", department: "Informatics", status: "Active" },
    { id: 3, role: "lecturer", name: "Dr. Adam Miller", email: "adam@learnova.ac.id", password: "dosen123", idNumber: "0415037902", department: "Informatics", status: "Active" },
    { id: 4, role: "lecturer", name: "Prof. Emily Chen", email: "emily@learnova.ac.id", password: "dosen123", idNumber: "0420117503", department: "Design", status: "Active" },
    { id: 5, role: "lecturer", name: "Dr. Karen Vance", email: "karen@learnova.ac.id", password: "dosen123", idNumber: "0402088204", department: "Mathematics", status: "Active" },
    { id: 6, role: "lecturer", name: "Prof. Rina Sharma", email: "rina@learnova.ac.id", password: "dosen123", idNumber: "0411097405", department: "Physics", status: "Active" },
    { id: 7, role: "lecturer", name: "Dr. Marcus Vale", email: "marcus@learnova.ac.id", password: "dosen123", idNumber: "0428018106", department: "Humanities", status: "Active" },
    { id: 8, role: "lecturer", name: "Dr. Sarah Kim", email: "sarah.kim@learnova.ac.id", password: "dosen123", idNumber: "0417058307", department: "Biology", status: "Active" },
    { id: 9, role: "lecturer", name: "Prof. Elena Ruiz", email: "elena@learnova.ac.id", password: "dosen123", idNumber: "0409127708", department: "Design", status: "Active" },
    { id: 10, role: "lecturer", name: "Dr. Nathan Cole", email: "nathan@learnova.ac.id", password: "dosen123", idNumber: "0423068509", department: "Physics", status: "Active" },
    { id: 11, role: "lecturer", name: "Dr. Sarah Thorne", email: "thorne@learnova.ac.id", password: "dosen123", idNumber: "0405028610", department: "Data Science", status: "Active" },
    { id: 12, role: "lecturer", name: "Prof. David Lee", email: "david@learnova.ac.id", password: "dosen123", idNumber: "0414107311", department: "Mathematics", status: "Inactive" },

    // Mahasiswa (password semua: student123) — daftar lengkap dibuat dari studentNames di bawah
  ],

  // Mahasiswa: [nama, NIM, program studi]. Email dibuat otomatis dari nama depan.
  studentNames: [
    ["Alex Mercer", "40992", "Informatics"],
    ["Alex Rivera", "40871", "Informatics"],
    ["Marcus Chen", "40655", "Information Systems"],
    ["Sarah Jenkins", "40512", "Biology"],
    ["David Ross", "40433", "Mathematics"],
    ["Nadia Putri", "40390", "Informatics"],
    ["Rizky Pratama", "40377", "Informatics"],
    ["Emma Collins", "40301", "Design"],
    ["Kevin Hartono", "40288", "Physics"],
    ["Laila Sari", "40215", "Data Science"],
    ["Dimas Saputra", "40198", "Informatics"],
    ["Putri Ayu", "40176", "Design"],
    ["Farhan Akbar", "40154", "Information Systems"],
    ["Siti Rahma", "40139", "Mathematics"],
    ["Bima Sakti", "40121", "Physics"],
    ["Maya Lestari", "40107", "Design"],
    ["Yusuf Hidayat", "40093", "Informatics"],
    ["Citra Dewi", "40081", "Biology"],
    ["Raka Wijaya", "40066", "Data Science"],
    ["Intan Permata", "40052", "Humanities"],
    ["Galih Pratama", "40047", "Informatics"],
    ["Nabila Zahra", "40033", "Information Systems"],
    ["Arif Rahman", "40021", "Mathematics"],
    ["Tania Kusuma", "40010", "Humanities"],
  ],

  /* ---------------------------------------------------------------------
     COURSES — status: Active | Draft | Pending (menunggu admin) | Rejected | Archived
     --------------------------------------------------------------------- */
  courses: [
    { id: 1, code: "CS101", title: "Introduction to Computer Science", lecturerId: 3, category: "Technology", status: "Active", semester: "Fall 2026", duration: 14, startDate: "2026-09-01", maxStudents: 60, color: "#c7d2fe", description: "Core concepts of computing, algorithms, and programming fundamentals.", enrollmentOpen: true, certificate: true },
    { id: 2, code: "BIO210", title: "Cellular Biology", lecturerId: 8, category: "Science", status: "Active", semester: "Fall 2026", duration: 14, startDate: "2026-09-01", maxStudents: 50, color: "#bbf7d0", description: "Structure and function of cells, organelles, and cellular processes.", enrollmentOpen: true, certificate: false },
    { id: 3, code: "DES305", title: "Interaction Design Systems", lecturerId: 9, category: "Design", status: "Draft", semester: "Fall 2026", duration: 12, startDate: "2026-10-05", maxStudents: 40, color: "#fbcfe8", description: "Designing consistent, reusable interaction patterns for digital products.", enrollmentOpen: false, certificate: true },
    { id: 4, code: "HIS101", title: "World History I", lecturerId: 7, category: "Humanities", status: "Archived", semester: "Spring 2026", duration: 14, startDate: "2026-02-02", maxStudents: 60, color: "#fee2e2", description: "A survey of world civilizations from antiquity to 1500.", enrollmentOpen: false, certificate: false },
    { id: 5, code: "MATH201", title: "Linear Algebra & Vector Spaces", lecturerId: 5, category: "Mathematics", status: "Active", semester: "Fall 2026", duration: 14, startDate: "2026-09-01", maxStudents: 50, color: "#dbeafe", description: "Vectors, matrices, linear transformations, and eigenvalues.", enrollmentOpen: true, certificate: false },
    { id: 6, code: "PHY310", title: "Quantum Mechanics Foundations", lecturerId: 10, category: "Science", status: "Active", semester: "Fall 2026", duration: 16, startDate: "2026-09-08", maxStudents: 40, color: "#ddd6fe", description: "Wave functions, operators, and the Schrödinger equation.", enrollmentOpen: true, certificate: true },
    { id: 7, code: "ENG104", title: "Academic Writing & Critical Analysis", lecturerId: 7, category: "Humanities", status: "Active", semester: "Fall 2026", duration: 12, startDate: "2026-09-01", maxStudents: 60, color: "#fef3c7", description: "Building clear arguments and analysing academic texts critically.", enrollmentOpen: false, certificate: true },
    { id: 8, code: "CS205", title: "Web Programming", lecturerId: 2, category: "Technology", status: "Active", semester: "Fall 2026", duration: 14, startDate: "2026-09-01", maxStudents: 60, color: "#bae6fd", description: "Client-side development with HTML5, CSS3, and JavaScript.", enrollmentOpen: true, certificate: true },
    { id: 9, code: "DATA200", title: "Foundations of Data Science", lecturerId: 11, category: "Technology", status: "Active", semester: "Spring 2026", duration: 12, startDate: "2026-02-02", maxStudents: 50, color: "#e0e7ff", description: "Data wrangling, visualisation, and introductory statistics.", enrollmentOpen: false, certificate: true },
    { id: 10, code: "DES302", title: "UI/UX Systems Design", lecturerId: 4, category: "Design", status: "Active", semester: "Fall 2026", duration: 12, startDate: "2026-09-01", maxStudents: 40, color: "#fce7f3", description: "User research, wireframing, and building design systems.", enrollmentOpen: true, certificate: true },
    { id: 11, code: "PHY110", title: "Classical Mechanics I", lecturerId: 6, category: "Science", status: "Active", semester: "Spring 2026", duration: 14, startDate: "2026-02-02", maxStudents: 50, color: "#d1fae5", description: "Newtonian mechanics, energy, momentum, and rotational motion.", enrollmentOpen: false, certificate: false },
    { id: 12, code: "MATH150", title: "Business Statistics", lecturerId: 5, category: "Mathematics", status: "Draft", semester: "Fall 2026", duration: 10, startDate: "2026-11-02", maxStudents: 40, color: "#fed7aa", description: "Descriptive and inferential statistics for business decisions.", enrollmentOpen: false, certificate: false },
    { id: 13, code: "MOB301", title: "Mobile Programming", lecturerId: 2, category: "Technology", status: "Pending", semester: "Fall 2026", duration: 12, startDate: "2026-10-12", maxStudents: 40, color: "#cffafe", description: "Building cross-platform mobile apps with modern frameworks and tooling.", enrollmentOpen: true, certificate: true },
  ],

  // Topik materi per course — setiap topik menjadi 2 modul (Lecture + Practice)
  courseTopics: {
    CS101: ["Computing Foundations", "Algorithms & Flowcharts", "Variables & Data Types", "Control Flow", "Functions", "Arrays & Lists", "Recursion & Stacks", "Searching & Sorting", "Object-Oriented Basics", "Final Project"],
    BIO210: ["Cell Theory", "Cell Membrane", "Organelles", "Nucleus & DNA", "Protein Synthesis", "Cell Energy", "Photosynthesis", "Cell Division", "Cell Signalling", "Lab Review"],
    DES305: ["Interaction Principles", "Patterns & Components", "States & Feedback", "Navigation Patterns", "Forms & Input", "Motion & Transitions", "Accessibility", "Documentation", "Design Critique", "Final Presentation"],
    HIS101: ["Early Civilisations", "Ancient Egypt", "Classical Greece", "The Roman Empire", "Ancient China", "The Silk Road", "Rise of Islam", "Medieval Europe", "The Mongol Empire"],
    MATH201: ["Vectors", "Linear Combinations", "Matrices", "Matrix Operations", "Determinants", "Inverse Matrices", "Vector Spaces", "Linear Transformations", "Eigenvalues", "Applications"],
    PHY310: ["Wave-Particle Duality", "The Wave Function", "Schrödinger Equation", "Particle in a Box", "Quantum Tunnelling", "Harmonic Oscillator", "Angular Momentum", "Hydrogen Atom", "Spin", "Measurement"],
    ENG104: ["Academic Voice", "Reading Critically", "Building Arguments", "Thesis Statements", "Paragraph Structure", "Using Evidence", "Citations & Referencing", "Counterarguments", "Editing & Revising", "Final Essay"],
    CS205: ["HTML5 Semantics", "CSS Fundamentals", "Flexbox & Grid", "Responsive Design", "JavaScript Basics", "DOM Manipulation", "Events & Forms", "Local Storage", "Charts & Libraries", "Final Project"],
    DATA200: ["Intro to Data Science", "Data Collection", "Data Cleaning", "Exploratory Analysis", "Visualisation", "Probability", "Statistical Inference", "Regression", "Classification", "Capstone"],
    DES302: ["Design Thinking", "User Research", "Personas & Journeys", "Information Architecture", "Wireframing", "Visual Hierarchy", "Design Tokens", "Component Libraries", "Usability Testing", "Portfolio Case Study"],
    PHY110: ["Kinematics", "Newton's Laws", "Friction & Forces", "Work & Energy", "Momentum", "Collisions", "Rotational Motion", "Torque", "Gravitation", "Oscillations"],
    MATH150: ["Descriptive Statistics", "Probability", "Distributions", "Sampling", "Confidence Intervals", "Hypothesis Testing", "Correlation", "Regression", "Time Series", "Business Case"],
    MOB301: ["Mobile Platforms", "UI Components", "Layouts", "Navigation", "State Management", "Networking", "Local Storage", "Device Features", "Testing", "Publishing"],
  },

  /* ---------------------------------------------------------------------
     QUIZ — 1 quiz (5 soal pilihan ganda) per course aktif. answer = index opsi benar.
     --------------------------------------------------------------------- */
  quizBank: {
    CS101: [
      { text: "What is an algorithm?", options: ["A step-by-step procedure to solve a problem", "A type of computer hardware", "A programming language", "A storage device"], answer: 0 },
      { text: "Which data type stores true/false values?", options: ["Integer", "String", "Boolean", "Float"], answer: 2 },
      { text: "What does a loop do?", options: ["Stores data permanently", "Repeats a block of code", "Defines a new variable type", "Stops the program"], answer: 1 },
      { text: "Which structure follows Last-In, First-Out (LIFO)?", options: ["Queue", "Stack", "Array", "Tree"], answer: 1 },
      { text: "What is the time complexity of binary search?", options: ["O(n)", "O(n²)", "O(log n)", "O(1)"], answer: 2 },
    ],
    BIO210: [
      { text: "Which organelle produces most of the cell's energy (ATP)?", options: ["Nucleus", "Mitochondria", "Ribosome", "Golgi apparatus"], answer: 1 },
      { text: "Where is genetic material stored in eukaryotic cells?", options: ["Cytoplasm", "Cell membrane", "Nucleus", "Lysosome"], answer: 2 },
      { text: "What is the main function of ribosomes?", options: ["Protein synthesis", "Lipid storage", "Cell division", "Photosynthesis"], answer: 0 },
      { text: "Which structure controls what enters and leaves the cell?", options: ["Cell wall", "Cell membrane", "Vacuole", "Nucleolus"], answer: 1 },
      { text: "Photosynthesis takes place in the…", options: ["Mitochondria", "Chloroplast", "Endoplasmic reticulum", "Centrosome"], answer: 1 },
    ],
    MATH201: [
      { text: "Multiplying a 2×3 matrix by a 3×4 matrix gives a…", options: ["2×4 matrix", "3×3 matrix", "4×2 matrix", "Undefined result"], answer: 0 },
      { text: "A square matrix has an inverse only if its determinant is…", options: ["Zero", "Non-zero", "Negative", "Equal to one"], answer: 1 },
      { text: "Linearly independent vectors…", options: ["Can be written as combinations of each other", "Cannot be written as combinations of each other", "Always have length 1", "Are always orthogonal"], answer: 1 },
      { text: "If Av = λv, then λ is called an…", options: ["Eigenvector", "Eigenvalue", "Determinant", "Identity"], answer: 1 },
      { text: "The identity matrix multiplied by matrix A gives…", options: ["The zero matrix", "A", "A transposed", "The inverse of A"], answer: 1 },
    ],
    PHY310: [
      { text: "The Schrödinger equation describes the evolution of the…", options: ["Electric field", "Wave function", "Gravitational constant", "Magnetic moment"], answer: 1 },
      { text: "Heisenberg's uncertainty principle relates position and…", options: ["Mass", "Momentum", "Charge", "Temperature"], answer: 1 },
      { text: "Energy levels of a bound quantum system are…", options: ["Continuous", "Quantised", "Always zero", "Infinite"], answer: 1 },
      { text: "Which particle has a negative electric charge?", options: ["Proton", "Neutron", "Electron", "Photon"], answer: 2 },
      { text: "The squared magnitude of the wave function gives the…", options: ["Velocity", "Probability density", "Energy", "Frequency"], answer: 1 },
    ],
    ENG104: [
      { text: "What should you identify first before writing an academic text?", options: ["The font", "The audience and purpose", "The conclusion", "The images"], answer: 1 },
      { text: "A good thesis statement is…", options: ["Vague and broad", "Clear and arguable", "Always a question", "A long quotation"], answer: 1 },
      { text: "Why do writers cite sources?", options: ["To make the text longer", "To credit ideas and support claims", "To avoid writing conclusions", "To replace their own argument"], answer: 1 },
      { text: "Critical analysis focuses on…", options: ["Summarising only", "Evaluating evidence and arguments", "Correcting spelling", "Counting words"], answer: 1 },
      { text: "Addressing a counterargument makes an essay…", options: ["Weaker", "More persuasive", "Off-topic", "Informal"], answer: 1 },
    ],
    CS205: [
      { text: "Which HTML5 element represents the main navigation?", options: ["<nav>", "<section>", "<div>", "<aside>"], answer: 0 },
      { text: "Which CSS layout is best for a single row or column?", options: ["Grid", "Flexbox", "Float", "Table"], answer: 1 },
      { text: "Which method returns the first element matching a CSS selector?", options: ["getElementById", "querySelector", "getElementsByClassName", "querySelectorAll"], answer: 1 },
      { text: "What does event.preventDefault() do in a submit handler?", options: ["Deletes the form", "Stops the browser's default submit", "Validates every field", "Reloads the page"], answer: 1 },
      { text: "Where does localStorage keep its data?", options: ["On the web server", "In the user's browser", "In a SQL database", "In the CSS file"], answer: 1 },
    ],
    DATA200: [
      { text: "What is the first step of a data science project?", options: ["Training a model", "Defining the question", "Deploying a dashboard", "Tuning hyperparameters"], answer: 1 },
      { text: "Removing duplicates and fixing missing values is called…", options: ["Data cleaning", "Data mining", "Data visualisation", "Data encryption"], answer: 0 },
      { text: "Which chart best shows a trend over time?", options: ["Pie chart", "Line chart", "Scatter plot", "Histogram"], answer: 1 },
      { text: "The mean of 2, 4, 6, and 8 is…", options: ["4", "5", "6", "20"], answer: 1 },
      { text: "Predicting a continuous value is a… problem", options: ["Classification", "Clustering", "Regression", "Association"], answer: 2 },
    ],
    DES302: [
      { text: "What is the first stage of design thinking?", options: ["Prototype", "Empathize", "Test", "Ideate"], answer: 1 },
      { text: "A persona represents…", options: ["A real customer's password", "A fictional archetype of a target user", "The design team", "A colour palette"], answer: 1 },
      { text: "Design tokens store…", options: ["User passwords", "Reusable design decisions like colours and spacing", "Server logs", "Database tables"], answer: 1 },
      { text: "A low-fidelity wireframe focuses on…", options: ["Final colours", "Layout and structure", "Animations", "Brand fonts"], answer: 1 },
      { text: "Usability testing is done to…", options: ["See how real users interact with the design", "Increase server speed", "Write documentation", "Choose a logo"], answer: 0 },
    ],
    PHY110: [
      { text: "Newton's second law states that F equals…", options: ["m / a", "m · a", "m + a", "a / m"], answer: 1 },
      { text: "The SI unit of force is the…", options: ["Joule", "Watt", "Newton", "Pascal"], answer: 2 },
      { text: "Kinetic energy depends on mass and…", options: ["Height", "Velocity", "Temperature", "Volume"], answer: 1 },
      { text: "Momentum is conserved when…", options: ["No external force acts", "Friction is maximal", "Velocity is zero", "Mass changes"], answer: 0 },
      { text: "Acceleration due to gravity on Earth is about…", options: ["1.6 m/s²", "9.8 m/s²", "15 m/s²", "3.0 m/s²"], answer: 1 },
    ],
  },

  // Progress mahasiswa demo (Alex Mercer). done = modul selesai (null = semua), quiz = skor quiz, finalScore = nilai akhir dari dosen
  demoEnrollments: [
    { code: "CS101", done: 13, quiz: 80 },
    { code: "MATH201", done: 16, quiz: 100 },
    { code: "DES302", done: 9 },
    { code: "ENG104", done: 18, quiz: 60 },
    { code: "CS205", done: 5 },
    { code: "PHY110", done: null, quiz: 100, finalScore: 93 },
    { code: "DATA200", done: null, quiz: 80, finalScore: 82 },
    { code: "HIS101", done: null, finalScore: 78 },
  ],

  // Grafik dashboard admin (histori Jan–Jun 2026)
  enrollmentChart: {
    labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
    enrollments: [320, 410, 520, 610, 660, 705],
    completions: [140, 200, 255, 300, 345, 385],
  },

  systemStatus: [
    { name: "Main database", state: "Normal" },
    { name: "Storage partition", state: "Normal" },
    { name: "LMS sync service", state: "Normal" },
    { name: "Auth gateway", state: "Normal" },
  ],

  notifications: {
    admin: [
      { text: "MOB301 Mobile Programming is waiting for approval", time: "5 min ago" },
      { text: "3 new student accounts this week", time: "2 hours ago" },
      { text: "Weekly report is ready", time: "Yesterday" },
    ],
    lecturer: [
      { text: "4 students submitted the CS205 quiz", time: "15 min ago" },
      { text: "MOB301 is waiting for admin approval", time: "1 hour ago" },
      { text: "Final grades for Fall 2026 are due in 6 weeks", time: "2 days ago" },
    ],
    student: [
      { text: "New module published in MATH201", time: "10 min ago" },
      { text: "Quiz for CS101 is open", time: "2 hours ago" },
      { text: "Final grade for PHY110 is available", time: "3 days ago" },
    ],
  },

  // time = ISO 8601 UTC (WIB − 7 jam); ditampilkan dalam waktu lokal oleh Domain.formatDateTime
  activities: [
    { time: "2026-09-25T07:32:00.000Z", actor: "Admin User", action: "Approved course DES302 UI/UX Systems Design" },
    { time: "2026-09-25T04:05:00.000Z", actor: "Alex Rivera", action: "Enrolled in CS101 Introduction to Computer Science" },
    { time: "2026-09-24T09:48:00.000Z", actor: "Dr. Budi Santoso", action: "Uploaded module 5 to CS205 Web Programming" },
    { time: "2026-09-24T02:20:00.000Z", actor: "Nadia Putri", action: "Completed the CS205 quiz with 100" },
    { time: "2026-09-23T06:15:00.000Z", actor: "Admin User", action: "Archived course HIS101 World History I" },
  ],
};
