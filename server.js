const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const sanitizeHtml = require('sanitize-html');
const path = require('path');
require('dotenv').config();

const app = express();

// Middleware to manage X-Robots-Tag header for SEO
app.use((req, res, next) => {
  // Remove X-Robots-Tag header to prevent noindex
  res.removeHeader('X-Robots-Tag');
  // Optionally, set explicitly to allow indexing
  // res.setHeader('X-Robots-Tag', 'index, follow');
  next();
});

// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// CORS configuration
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5500',
  'https://threego-school.onrender.com',
  process.env.FRONTEND_URL
].filter(Boolean); // Remove undefined/null values
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

// Validate environment variables
const { MONGO_URI, JWT_SECRET } = process.env;
if (!MONGO_URI) {
  console.error('MONGO_URI is not defined in environment variables');
}
if (!JWT_SECRET) {
  console.error('JWT_SECRET is not defined in environment variables');
}

// MongoDB connection with retry logic
let isMongoConnected = false;

const connectWithRetry = async () => {
  try {
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 10
    });
    console.log('Connected to MongoDB');
    isMongoConnected = true;
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    console.log('Retrying in 5 seconds...');
    isMongoConnected = false;
    setTimeout(connectWithRetry, 5000);
  }
};

// MongoDB connection event handlers
mongoose.connection.on('disconnected', () => {
  console.error('Disconnected from MongoDB');
  isMongoConnected = false;
  connectWithRetry();
});
mongoose.connection.on('error', (err) => {
  console.error('MongoDB error:', err.message);
});

if (MONGO_URI) {
  connectWithRetry();
}

// User schema
const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: String,
  registered: Date,
  language: String,
  courses: [{
    name: String,
    meetLink: String,
    materialsLink: String
  }],
  schedule: [{
    courseName: String,
    title: String,
    date: Date,
    meetLink: String,
    materialsLink: String
  }]
});
const User = mongoose.model('User', userSchema);

// Teacher schema
const teacherSchema = new mongoose.Schema({
  name: String,
  email: String,
  teachesCourses: [{
    id: String,
    name: String,
    groupNumber: String,
    materialsLink: String
  }],
  individualLessons: [{
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    lesson: String,
    courseName: String,
    meetLink: String,
    materialsLink: String
  }],
  password: String,
  tracker: String
});
const Teacher = mongoose.model('Teacher', teacherSchema);

// Tracker schema
const trackerSchema = new mongoose.Schema({
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true },
  date: { type: Date, default: Date.now },
  activity: { type: String, required: true },
  details: { type: String, required: true }
});
const Tracker = mongoose.model('Tracker', trackerSchema);

// Course schema
const courseSchema = new mongoose.Schema({
  category: String,
  name: String,
  description: String,
  details: [String],
  schedule: {
    group: String,
    individual: String
  },
  prices: {
    group: String,
    individual: String
  },
  meetLink: String,
  materialsLink: String
});
const Course = mongoose.model('Course', courseSchema);

// Review schema
const reviewSchema = new mongoose.Schema({
  text: String,
  author: String
});
const Review = mongoose.model('Review', reviewSchema);

// Blog post schema
const blogPostSchema = new mongoose.Schema({
  title: String,
  description: String,
  content: String,
  publishedAt: { type: Date, default: Date.now }
});
const BlogPost = mongoose.model('BlogPost', blogPostSchema);

// Application schema
const applicationSchema = new mongoose.Schema({
  name: String,
  contact: String,
  format: String,
  course: String,
  date: Date
});
const Application = mongoose.model('Application', applicationSchema);

// Refresh token schema
const refreshTokenSchema = new mongoose.Schema({
  token: String,
  userId: { type: mongoose.Schema.Types.ObjectId, refPath: 'userType' },
  userType: { type: String, enum: ['User', 'Teacher'] },
  expiresAt: Date
});
const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema);

// JWT authentication middleware
const authenticateToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  console.log('Received token:', token);
  if (!token) {
    console.error('No token provided in request headers');
    return res.status(401).json({ message: 'Token not provided' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.error('Token verification error:', err.message);
      return res.status(403).json({ message: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

// Check MongoDB connection for API routes
app.use((req, res, next) => {
  if (!isMongoConnected && req.path !== '/healthz') {
    return res.status(503).json({ message: 'Server temporarily unavailable: database connection issue' });
  }
  next();
});

// Health check endpoint
app.get('/healthz', (req, res) => res.sendStatus(200));

// Serve SPA index.html for root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'home.html'), (err) => {
    if (err) {
      console.error('Error sending index.html:', err.message);
      res.status(404).json({ message: 'Page not found' });
    }
  });
});

// User registration
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({
      name: sanitizeHtml(name),
      email: sanitizeHtml(email),
      password: hashedPassword,
      registered: new Date(),
      language: 'uk',
      courses: [],
      schedule: []
    });

    await user.save();
    
    const token = jwt.sign({ email: user.email }, JWT_SECRET);
    const refreshToken = jwt.sign({ email: user.email }, JWT_SECRET);
    await new RefreshToken({
      token: refreshToken,
      userId: user._id,
      userType: 'User',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    }).save();

    res.status(201).json({ 
      message: 'Registration successful',
      token,
      refreshToken,
      user: {
        name: user.name,
        email: user.email,
        registered: user.registered
      }
    });
  } catch (error) {
    console.error('Registration error:', error.message, error.stack);
    res.status(500).json({ message: `Server error: ${error.message}` });
  }
});

// Teacher registration
app.post('/api/teacher-register', async (req, res) => {
  try {
    const { name, email, password, teachesCourses, individualLessons } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required' });
    }

    const existingTeacher = await Teacher.findOne({ email });
    if (existingTeacher) {
      return res.status(400).json({ message: 'Teacher with this email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const teacher = new Teacher({
      name: sanitizeHtml(name),
      email: sanitizeHtml(email),
      teachesCourses: teachesCourses || [],
      individualLessons: individualLessons || [],
      password: hashedPassword
    });

    await teacher.save();
    
    const token = jwt.sign({ teacherId: teacher._id, name: teacher.name, email: teacher.email }, JWT_SECRET);
    const refreshToken = jwt.sign({ teacherId: teacher._id, name: teacher.name, email: teacher.email }, JWT_SECRET);
    await new RefreshToken({
      token: refreshToken,
      userId: teacher._id,
      userType: 'Teacher',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    }).save();

    res.status(201).json({ 
      message: 'Teacher registration successful',
      token,
      refreshToken,
      teacher: {
        name: teacher.name,
        email: teacher.email,
        _id: teacher._id,
        teachesCourses: teacher.teachesCourses,
        individualLessons: teacher.individualLessons
      }
    });
  } catch (error) {
    console.error('Teacher registration error:', error.message, error.stack);
    res.status(500).json({ message: `Server error: ${error.message}` });
  }
});

// User login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const token = jwt.sign({ email: user.email }, JWT_SECRET);
    const refreshToken = jwt.sign({ email: user.email }, JWT_SECRET);
    await RefreshToken.deleteMany({ userId: user._id, userType: 'User' });
    await new RefreshToken({
      token: refreshToken,
      userId: user._id,
      userType: 'User',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    }).save();

    res.status(200).json({
      message: 'Login successful',
      token,
      refreshToken,
      user: {
        name: user.name,
        email: user.email,
        registered: user.registered
      }
    });
  } catch (error) {
    console.error('Login error:', error.message, error.stack);
    res.status(500).json({ message: `Server error: ${error.message}` });
  }
});

// Teacher login
app.post('/api/teacher-login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const teacher = await Teacher.findOne({ email });
    if (!teacher) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, teacher.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const token = jwt.sign({ teacherId: teacher._id, name: teacher.name, email: teacher.email }, JWT_SECRET);
    const refreshToken = jwt.sign({ teacherId: teacher._id, name: teacher.name, email: teacher.email }, JWT_SECRET);
    await RefreshToken.deleteMany({ userId: teacher._id, userType: 'Teacher' });
    await new RefreshToken({
      token: refreshToken,
      userId: teacher._id,
      userType: 'Teacher',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    }).save();

    res.status(200).json({
      message: 'Teacher login successful',
      token,
      refreshToken,
      teacher: {
        name: teacher.name,
        email: teacher.email,
        _id: teacher._id,
        teachesCourses: teacher.teachesCourses,
        individualLessons: teacher.individualLessons
      }
    });
  } catch (error) {
    console.error('Teacher login error:', error.message, error.stack);
    res.status(500).json({ message: `Server error: ${error.message}` });
  }
});

// Teacher login without expiry
app.post('/api/teacher-login-no-expiry', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const teacher = await Teacher.findOne({ email });
    if (!teacher) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, teacher.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const token = jwt.sign({ teacherId: teacher._id, name: teacher.name, email: teacher.email }, JWT_SECRET);
    const refreshToken = jwt.sign({ teacherId: teacher._id, name: teacher.name, email: teacher.email }, JWT_SECRET);
    await RefreshToken.deleteMany({ userId: teacher._id, userType: 'Teacher' });
    await new RefreshToken({
      token: refreshToken,
      userId: teacher._id,
      userType: 'Teacher'
    }).save();

    res.status(200).json({
      message: 'Teacher login without expiry successful',
      token,
      refreshToken,
      teacher: {
        name: teacher.name,
        email: teacher.email,
        _id: teacher._id,
        teachesCourses: teacher.teachesCourses,
        individualLessons: teacher.individualLessons
      }
    });
  } catch (error) {
    console.error('Teacher login (no expiry) error:', error.message, error.stack);
    res.status(500).json({ message: `Server error: ${error.message}` });
  }
});

// Refresh token
app.post('/api/refresh-token', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    console.log('Received refresh token:', refreshToken);
    if (!refreshToken) {
      console.error('Refresh token not provided');
      return res.status(400).json({ message: 'Refresh token not provided' });
    }

    const tokenDoc = await RefreshToken.findOne({ token: refreshToken });
    if (!tokenDoc) {
      console.error('Refresh token not found in database');
      return res.status(403).json({ message: 'Invalid refresh token' });
    }
    if (tokenDoc.expiresAt && tokenDoc.expiresAt < new Date()) {
      console.error('Refresh token expired:', tokenDoc.expiresAt);
      await RefreshToken.deleteOne({ _id: tokenDoc._id });
      return res.status(403).json({ message: 'Expired refresh token' });
    }

    const Model = tokenDoc.userType === 'User' ? User : Teacher;
    const user = await Model.findById(tokenDoc.userId);
    if (!user) {
      console.error('User not found for ID:', tokenDoc.userId);
      return res.status(404).json({ message: 'User not found' });
    }

    const payload = tokenDoc.userType === 'User' 
      ? { email: user.email }
      : { teacherId: user._id, name: user.name, email: user.email };
    const newToken = jwt.sign(payload, JWT_SECRET);
    console.log('New token generated for user:', user.email);

    res.json({ token: newToken });
  } catch (error) {
    console.error('Refresh token error:', error.message, error.stack);
    res.status(500).json({ message: `Server error: ${error.message}` });
  }
});

// User profile
app.get('/api/profile', authenticateToken, async (req, res) => {
  try {
    let user;
    if (req.query.studentId) {
      user = await User.findById(req.query.studentId, 'name courses schedule').lean();
      if (!user) {
        console.error('Student not found for ID:', req.query.studentId);
        return res.status(404).json({ message: 'Student not found' });
      }
      res.json({
        name: user.name || 'Unknown',
        courses: user.courses || [],
        schedule: user.schedule || []
      });
    } else {
      user = await User.findOne({ email: req.user.email }, 'name email registered language courses schedule').lean();
      if (!user) {
        console.error('User not found for email:', req.user.email);
        return res.status(404).json({ message: 'User not found' });
      }
      const reviews = await Review.find({ author: user.name }, 'text').sort({ _id: -1 }).lean();
      res.json({
        name: user.name,
        email: user.email,
        registered: user.registered,
        language: user.language,
        courses: user.courses,
        schedule: user.schedule,
        reviews: reviews.map(review => review.text)
      });
    }
  } catch (error) {
    console.error('Profile retrieval error:', error.message, error.stack);
    res.status(500).json({ message: `Server error: ${error.message}` });
  }
});

// Teacher profile
app.get('/api/teacher-profile', authenticateToken, async (req, res) => {
  try {
    console.log('Fetching teacher profile for ID:', req.user.teacherId);
    const teacher = await Teacher.findById(req.user.teacherId).lean();
    if (!teacher) {
      console.error('Teacher not found for ID:', req.user.teacherId);
      return res.status(404).json({ message: 'Teacher not found' });
    }
    console.log('Teacher data from DB:', teacher);

    const courseNames = teacher.teachesCourses?.map(course => course.name) || [];
    const courses = courseNames.length
      ? await Course.find({ name: { $in: courseNames } }, 'name materialsLink').lean()
      : [];
    const courseMap = courses.reduce((map, course) => {
      map[course.name] = course.materialsLink || '#';
      return map;
    }, {});

    const response = {
      _id: teacher._id.toString(),
      name: teacher.name,
      email: teacher.email,
      teachesCourses: Array.isArray(teacher.teachesCourses) ? teacher.teachesCourses.map(course => ({
        courseId: course.id || 'Unknown',
        name: course.name || 'Unknown',
        groupNumber: course.groupNumber || 'Unknown',
        materialsLink: course.materialsLink || courseMap[course.name] || '#'
      })) : [],
      individualLessons: Array.isArray(teacher.individualLessons) ? teacher.individualLessons.map(lesson => ({
        individualId: lesson._id ? lesson._id.toString() : 'Unknown',
        studentId: lesson.studentId?.toString() || lesson.studentId || 'Unknown',
        lesson: lesson.lesson || 'Unknown',
        courseName: lesson.courseName || 'Unknown',
        meetLink: lesson.meetLink || '#',
        materialsLink: lesson.materialsLink || '#'
      })) : [],
      tracker: teacher.tracker || '#'
    };

    console.log('Teacher profile response:', response);
    res.json(response);
  } catch (error) {
    console.error('Teacher profile retrieval error for ID:', req.user.teacherId, error.message, error.stack);
    res.status(500).json({ message: `Server error: ${error.message}` });
  }
});

// Teacher tracker (GET)
app.get('/api/teacher-tracker', authenticateToken, async (req, res) => {
  try {
    console.log('Fetching tracker data for teacher ID:', req.user.teacherId);
    const trackerEntries = await Tracker.find({ teacherId: req.user.teacherId }).sort({ date: -1 }).lean();
    console.log('Tracker entries:', trackerEntries);
    if (!trackerEntries || trackerEntries.length === 0) {
      console.warn('No tracker entries found for teacher ID:', req.user.teacherId);
      return res.json([]);
    }
    console.log('Found tracker entries:', trackerEntries.length);
    const response = trackerEntries.map(entry => ({
      id: entry._id.toString(),
      date: entry.date,
      activity: sanitizeHtml(entry.activity) || 'Unknown',
      details: sanitizeHtml(entry.details) || 'No details'
    }));
    res.json(response);
  } catch (error) {
    console.error('Tracker retrieval error for teacher ID:', req.user.teacherId, error.message, error.stack);
    res.status(500).json({ message: `Server error: ${error.message}` });
  }
});

// Teacher tracker (POST)
app.post('/api/teacher-tracker', authenticateToken, async (req, res) => {
  try {
    const { activity, details } = req.body;
    if (!activity || !details) {
      return res.status(400).json({ message: 'Activity and details are required' });
    }

    const sanitizedActivity = sanitizeHtml(activity, { allowedTags: [], allowedAttributes: {} });
    const sanitizedDetails = sanitizeHtml(details, { allowedTags: [], allowedAttributes: {} });
    if (!sanitizedActivity || !sanitizedDetails) {
      return res.status(400).json({ message: 'Invalid data for activity or details' });
    }

    const teacher = await Teacher.findById(req.user.teacherId);
    if (!teacher) {
      console.error('Teacher not found for ID:', req.user.teacherId);
      return res.status(404).json({ message: 'Teacher not found' });
    }

    const trackerEntry = new Tracker({
      teacherId: req.user.teacherId,
      date: new Date(),
      activity: sanitizedActivity,
      details: sanitizedDetails
    });

    await trackerEntry.save();
    console.log('Tracker entry added:', trackerEntry);
    res.status(201).json({ 
      message: 'Tracker entry added successfully',
      trackerEntry: {
        id: trackerEntry._id.toString(),
        date: trackerEntry.date,
        activity: trackerEntry.activity,
        details: trackerEntry.details
      }
    });
  } catch (error) {
    console.error('Tracker entry addition error:', error.message, error.stack);
    res.status(500).json({ message: `Server error: ${error.message}` });
  }
});

// Home page data
app.get('/api/home', async (req, res) => {
  try {
    const courses = await Course.find().lean();
    console.log('Courses sent to client:', courses);
    const reviews = await Review.find().lean();
    res.json({ 
      courses: courses.map(course => ({
        ...course,
        materialsLink: course.materialsLink || '#'
      })),
      reviews 
    });
  } catch (error) {
    console.error('Home page data retrieval error:', error.message, error.stack);
    res.status(500).json({ message: `Server error: ${error.message}` });
  }
});

// Blog posts (all)
app.get('/api/blog', async (req, res) => {
  try {
    console.log('Fetching all blog posts...');
    const posts = await BlogPost.find().sort({ publishedAt: -1 }).lean();
    if (!posts) {
      console.warn('No posts found in database');
      return res.json([]);
    }
    console.log(`Found ${posts.length} blog posts`);
    res.json(posts);
  } catch (error) {
    console.error('Blog posts retrieval error:', error.message, error.stack);
    res.status(500).json({ message: `Server error: ${error.message}` });
  }
});

// Blog post (single)
app.get('/api/blog/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log('Fetching blog post with ID:', id);
    const post = await BlogPost.findById(id).lean();
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }
    res.json(post);
  } catch (error) {
    console.error('Blog post retrieval error:', error.message, error.stack);
    res.status(500).json({ message: `Server error: ${error.message}` });
  }
});

// Course purchase application
app.post('/api/purchase', async (req, res) => {
  try {
    const { name, contact, format, course, date } = req.body;
    if (!name || !contact || !format || !course || !date) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const application = new Application({
      name: sanitizeHtml(name),
      contact: sanitizeHtml(contact),
      format,
      course: sanitizeHtml(course),
      date: new Date(date)
    });
    await application.save();
    console.log('Course application saved:', application);
    res.status(201).json({ message: 'Application submitted successfully' });
  } catch (error) {
    console.error('Application submission error:', error.message, error.stack);
    res.status(500).json({ message: `Server error: ${error.message}` });
  }
});

// Add teacher
app.post('/api/teachers', authenticateToken, async (req, res) => {
  try {
    const { name, email, teachesCourses, individualLessons, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required' });
    }

    const existingTeacher = await Teacher.findOne({ email });
    if (existingTeacher) {
      return res.status(400).json({ message: 'Teacher with this email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const teacher = new Teacher({
      name: sanitizeHtml(name),
      email: sanitizeHtml(email),
      teachesCourses: teachesCourses || [],
      individualLessons: individualLessons || [],
      password: hashedPassword
    });

    await teacher.save();

    const token = jwt.sign({ teacherId: teacher._id, name: teacher.name, email: teacher.email }, JWT_SECRET);
    const refreshToken = jwt.sign({ teacherId: teacher._id, name: teacher.name, email: teacher.email }, JWT_SECRET);
    await new RefreshToken({
      token: refreshToken,
      userId: teacher._id,
      userType: 'Teacher',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    }).save();

    console.log('Teacher added with ID:', teacher._id);
    res.status(201).json({
      message: 'Teacher added successfully',
      token,
      refreshToken,
      teacher: {
        name: teacher.name,
        email: teacher.email,
        _id: teacher._id,
        teachesCourses: teacher.teachesCourses,
        individualLessons: teacher.individualLessons
      }
    });
  } catch (error) {
    console.error('Teacher addition error:', error.message, error.stack);
    res.status(500).json({ message: `Server error: ${error.message}` });
  }
});

// Global error handlers
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err.message, err.stack);
  process.exit(1);
});
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Promise Rejection:', err.message, err.stack);
  process.exit(1);
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
