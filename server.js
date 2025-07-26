<<<<<<< HEAD
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const sanitizeHtml = require('sanitize-html');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors({ origin: ['http://localhost:3000', 'http://localhost:5500'] }));
app.use(express.json());
app.use(express.static('public'));

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.log(err));

// User Schema
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

// Teacher Schema
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
    tracker: String // Додано поле tracker
});

const Teacher = mongoose.model('Teacher', teacherSchema);

// Tracker Schema
const trackerSchema = new mongoose.Schema({
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true },
    date: { type: Date, default: Date.now },
    activity: { type: String, required: true },
    details: { type: String, required: true }
});

const Tracker = mongoose.model('Tracker', trackerSchema);

// Course Schema
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

// Review Schema
const reviewSchema = new mongoose.Schema({
    text: String,
    author: String
});

const Review = mongoose.model('Review', reviewSchema);

// Blog Post Schema
const blogPostSchema = new mongoose.Schema({
    title: String,
    description: String,
    content: String,
    publishedAt: { type: Date, default: Date.now }
});

const BlogPost = mongoose.model('BlogPost', blogPostSchema);

// Application Schema
const applicationSchema = new mongoose.Schema({
    name: String,
    contact: String,
    format: String,
    course: String,
    date: Date
});

const Application = mongoose.model('Application', applicationSchema);

// Refresh Token Schema
const refreshTokenSchema = new mongoose.Schema({
    token: String,
    userId: { type: mongoose.Schema.Types.ObjectId, refPath: 'userType' },
    userType: { type: String, enum: ['User', 'Teacher'] },
    expiresAt: Date
});

const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema);

// Middleware to verify JWT
const authenticateToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    console.log('Received token:', token);
    if (!token) {
        console.error('No token provided in request headers');
        return res.status(401).json({ message: 'Токен не надано' });
    }

    jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
        if (err) {
            console.error('Token verification error:', err.message);
            return res.status(403).json({ message: 'Недійсний токен' });
        }
        req.user = user;
        next();
    });
};

// Registration API endpoint
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ message: 'Усі поля є обов’язковими' });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: 'Користувач з такою поштою вже існує' });
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
        
        const token = jwt.sign({ email: user.email }, process.env.JWT_SECRET || 'your-secret-key');
        const refreshToken = jwt.sign({ email: user.email }, process.env.JWT_SECRET || 'your-secret-key');
        await new RefreshToken({
            token: refreshToken,
            userId: user._id,
            userType: 'User',
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        }).save();

        res.status(201).json({ 
            message: 'Реєстрація успішна',
            token,
            refreshToken,
            user: {
                name: user.name,
                email: user.email,
                registered: user.registered
            }
        });
    } catch (error) {
        console.error('Error during registration:', error.message, error.stack);
        res.status(500).json({ message: `Помилка сервера: ${error.message}` });
    }
});

// Teacher Registration API endpoint
app.post('/api/teacher-register', async (req, res) => {
    try {
        const { name, email, password, teachesCourses, individualLessons } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ message: 'ПІБ, електронна пошта та пароль є обов’язковими' });
        }

        const existingTeacher = await Teacher.findOne({ email });
        if (existingTeacher) {
            return res.status(400).json({ message: 'Викладач з такою електронною поштою вже існує' });
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
        
        const token = jwt.sign({ teacherId: teacher._id, name: teacher.name, email: teacher.email }, process.env.JWT_SECRET || 'your-secret-key');
        const refreshToken = jwt.sign({ teacherId: teacher._id, name: teacher.name, email: teacher.email }, process.env.JWT_SECRET || 'your-secret-key');
        await new RefreshToken({
            token: refreshToken,
            userId: teacher._id,
            userType: 'Teacher',
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        }).save();

        res.status(201).json({ 
            message: 'Реєстрація викладача успішна',
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
        console.error('Error during teacher registration:', error.message, error.stack);
        res.status(500).json({ message: `Помилка сервера: ${error.message}` });
    }
});

// Login API endpoint
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: 'Електронна пошта та пароль є обов’язковими' });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ message: 'Неправильна пошта або пароль' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Неправильна пошта або пароль' });
        }

        const token = jwt.sign({ email: user.email }, process.env.JWT_SECRET || 'your-secret-key');
        const refreshToken = jwt.sign({ email: user.email }, process.env.JWT_SECRET || 'your-secret-key');
        await RefreshToken.deleteMany({ userId: user._id, userType: 'User' });
        await new RefreshToken({
            token: refreshToken,
            userId: user._id,
            userType: 'User',
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        }).save();

        res.status(200).json({
            message: 'Вхід успішний',
            token,
            refreshToken,
            user: {
                name: user.name,
                email: user.email,
                registered: user.registered
            }
        });
    } catch (error) {
        console.error('Error during login:', error.message, error.stack);
        res.status(500).json({ message: `Помилка сервера: ${error.message}` });
    }
});

// Teacher Login API endpoint
app.post('/api/teacher-login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: 'Електронна пошта та пароль є обов’язковими' });
        }

        const teacher = await Teacher.findOne({ email });
        if (!teacher) {
            return res.status(401).json({ message: 'Неправильна електронна пошта або пароль' });
        }

        const isMatch = await bcrypt.compare(password, teacher.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Неправильна електронна пошта або пароль' });
        }

        const token = jwt.sign({ teacherId: teacher._id, name: teacher.name, email: teacher.email }, process.env.JWT_SECRET || 'your-secret-key');
        const refreshToken = jwt.sign({ teacherId: teacher._id, name: teacher.name, email: teacher.email }, process.env.JWT_SECRET || 'your-secret-key');
        await RefreshToken.deleteMany({ userId: teacher._id, userType: 'Teacher' });
        await new RefreshToken({
            token: refreshToken,
            userId: teacher._id,
            userType: 'Teacher',
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        }).save();

        res.status(200).json({
            message: 'Вхід як викладач успішний',
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
        console.error('Error during teacher login:', error.message, error.stack);
        res.status(500).json({ message: `Помилка сервера: ${error.message}` });
    }
});

// Teacher Login API endpoint (No Expiry)
app.post('/api/teacher-login-no-expiry', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: 'Електронна пошта та пароль є обов’язковими' });
        }

        const teacher = await Teacher.findOne({ email });
        if (!teacher) {
            return res.status(401).json({ message: 'Неправильна електронна пошта або пароль' });
        }

        const isMatch = await bcrypt.compare(password, teacher.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Неправильна електронна пошта або пароль' });
        }

        const token = jwt.sign({ teacherId: teacher._id, name: teacher.name, email: teacher.email }, process.env.JWT_SECRET || 'your-secret-key');
        const refreshToken = jwt.sign({ teacherId: teacher._id, name: teacher.name, email: teacher.email }, process.env.JWT_SECRET || 'your-secret-key');
        await RefreshToken.deleteMany({ userId: teacher._id, userType: 'Teacher' });
        await new RefreshToken({
            token: refreshToken,
            userId: teacher._id,
            userType: 'Teacher'
        }).save();

        res.status(200).json({
            message: 'Вхід як викладач без терміну дії успішний',
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
        console.error('Error during teacher login (no expiry):', error.message, error.stack);
        res.status(500).json({ message: `Помилка сервера: ${error.message}` });
    }
});

// Refresh Token API endpoint
app.post('/api/refresh-token', async (req, res) => {
    try {
        const { refreshToken } = req.body;
        console.log('Received refresh token:', refreshToken);
        if (!refreshToken) {
            console.error('No refresh token provided');
            return res.status(400).json({ message: 'Refresh token не надано' });
        }

        const tokenDoc = await RefreshToken.findOne({ token: refreshToken });
        if (!tokenDoc) {
            console.error('Refresh token not found in database');
            return res.status(403).json({ message: 'Недійсний refresh token' });
        }
        if (tokenDoc.expiresAt && tokenDoc.expiresAt < new Date()) {
            console.error('Refresh token expired:', tokenDoc.expiresAt);
            await RefreshToken.deleteOne({ _id: tokenDoc._id });
            return res.status(403).json({ message: 'Прострочений refresh token' });
        }

        const Model = tokenDoc.userType === 'User' ? User : Teacher;
        const user = await Model.findById(tokenDoc.userId);
        if (!user) {
            console.error('User not found for ID:', tokenDoc.userId);
            return res.status(404).json({ message: 'Користувача не знайдено' });
        }

        const payload = tokenDoc.userType === 'User' 
            ? { email: user.email }
            : { teacherId: user._id, name: user.name, email: user.email };
        const newToken = jwt.sign(payload, process.env.JWT_SECRET || 'your-secret-key');
        console.log('New token generated for user:', user.email);

        res.json({ token: newToken });
    } catch (error) {
        console.error('Error refreshing token:', error.message, error.stack);
        res.status(500).json({ message: `Помилка сервера: ${error.message}` });
    }
});

// Profile API endpoint
app.get('/api/profile', authenticateToken, async (req, res) => {
    try {
        let user;
        if (req.query.studentId) {
            user = await User.findById(req.query.studentId, 'name courses schedule').lean();
            if (!user) {
                console.error('Student not found for ID:', req.query.studentId);
                return res.status(404).json({ message: 'Студента не знайдено' });
            }
            res.json({
                name: user.name || 'Невідомо',
                courses: user.courses || [],
                schedule: user.schedule || []
            });
        } else {
            user = await User.findOne({ email: req.user.email }, 'name email registered language courses schedule').lean();
            if (!user) {
                console.error('User not found for email:', req.user.email);
                return res.status(404).json({ message: 'Користувача не знайдено' });
            }
            const reviews = await Review.find({ author: user.name }, 'text').sort({ _id: -1 }).lean();
            res.json({
                name: user.name,
                email: user.email,
                registered: user.registered,
                language: user.language,
                courses:  user.courses,
                schedule: user.schedule,
                reviews: reviews.map(review => review.text)
            });
        }
    } catch (error) {
        console.error('Error fetching profile:', error.message, error.stack);
        res.status(500).json({ message: `Помилка сервера: ${error.message}` });
    }
});

// Teacher Profile API endpoint
app.get('/api/teacher-profile', authenticateToken, async (req, res) => {
    try {
        console.log('Fetching teacher profile for ID:', req.user.teacherId);
        const teacher = await Teacher.findById(req.user.teacherId).lean();
        if (!teacher) {
            console.error('Teacher not found for ID:', req.user.teacherId);
            return res.status(404).json({ message: 'Викладача не знайдено' });
        }
        console.log('Raw teacher data from DB:', teacher);

        // Отримання materialsLink для курсів із колекції Course
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
                courseId: course.id || 'Невідомо',
                name: course.name || 'Невідомо',
                groupNumber: course.groupNumber || 'Невідомо',
                materialsLink: course.materialsLink || courseMap[course.name] || '#'
            })) : [],
            individualLessons: Array.isArray(teacher.individualLessons) ? teacher.individualLessons.map(lesson => ({
                individualId: lesson._id ? lesson._id.toString() : 'Невідомо',
                studentId: lesson.studentId?.toString() || lesson.studentId || 'Невідомо',
                lesson: lesson.lesson || 'Невідомо',
                courseName: lesson.courseName || 'Невідомо',
                meetLink: lesson.meetLink || '#',
                materialsLink: lesson.materialsLink || '#'
            })) : [],
            tracker: teacher.tracker || '#' // Додано поле tracker
        };

        console.log('Teacher profile response:', response);
        res.json(response);
    } catch (error) {
        console.error('Error fetching teacher profile for ID:', req.user.teacherId, error.message, error.stack);
        res.status(500).json({ message: `Помилка сервера: ${error.message}` });
    }
});

// Teacher Tracker API endpoint (GET)
app.get('/api/teacher-tracker', authenticateToken, async (req, res) => {
    try {
        console.log('Fetching tracker data for teacher ID:', req.user.teacherId);
        const trackerEntries = await Tracker.find({ teacherId: req.user.teacherId }).sort({ date: -1 }).lean();
        console.log('Raw tracker entries:', trackerEntries);
        if (!trackerEntries || trackerEntries.length === 0) {
            console.warn('No tracker entries found for teacher ID:', req.user.teacherId);
            return res.json([]);
        }
        console.log('Tracker entries found:', trackerEntries.length);
        const response = trackerEntries.map(entry => ({
            id: entry._id.toString(),
            date: entry.date,
            activity: sanitizeHtml(entry.activity) || 'Невідомо',
            details: sanitizeHtml(entry.details) || 'Немає деталей'
        }));
        res.json(response);
    } catch (error) {
        console.error('Error fetching tracker data for teacher ID:', req.user.teacherId, error.message, error.stack);
        res.status(500).json({ message: `Помилка сервера: ${error.message}` });
    }
});

// Teacher Tracker API endpoint (POST)
app.post('/api/teacher-tracker', authenticateToken, async (req, res) => {
    try {
        const { activity, details } = req.body;
        if (!activity || !details) {
            return res.status(400).json({ message: 'Поля activity та details є обов’язковими' });
        }

        // Validate and sanitize inputs
        const sanitizedActivity = sanitizeHtml(activity, { allowedTags: [], allowedAttributes: {} });
        const sanitizedDetails = sanitizeHtml(details, { allowedTags: [], allowedAttributes: {} });
        if (!sanitizedActivity || !sanitizedDetails) {
            return res.status(400).json({ message: 'Недійсні дані для activity або details' });
        }

        // Verify teacher exists
        const teacher = await Teacher.findById(req.user.teacherId);
        if (!teacher) {
            console.error('Teacher not found for ID:', req.user.teacherId);
            return res.status(404).json({ message: 'Викладача не знайдено' });
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
            message: 'Запис у трекер успішно додано',
            trackerEntry: {
                id: trackerEntry._id.toString(),
                date: trackerEntry.date,
                activity: trackerEntry.activity,
                details: trackerEntry.details
            }
        });
    } catch (error) {
        console.error('Error adding tracker entry:', error.message, error.stack);
        res.status(500).json({ message: `Помилка сервера: ${error.message}` });
    }
});

// Home API endpoint
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
        console.error('Error fetching home data:', error.message, error.stack);
        res.status(500).json({ message: `Помилка сервера: ${error.message}` });
    }
});

// Blog API endpoint (Get all posts)
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
        console.error('Error fetching blog posts:', error.message, error.stack);
        res.status(500).json({ message: `Помилка сервера: ${error.message}` });
    }
});

// Blog API endpoint (Get single post)
app.get('/api/blog/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log('Fetching blog post with ID:', id);
        const post = await BlogPost.findById(id).lean();
        if (!post) {
            return res.status(404).json({ message: 'Статтю не знайдено' });
        }
        res.json(post);
    } catch (error) {
        console.error('Error fetching blog post:', error.message, error.stack);
        res.status(500).json({ message: `Помилка сервера: ${error.message}` });
    }
});

// Course Application API endpoint
app.post('/api/purchase', async (req, res) => {
    try {
        const { name, contact, format, course, date } = req.body;
        if (!name || !contact || !format || !course || !date) {
            return res.status(400).json({ message: 'Усі поля є обов’язковими' });
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
        res.status(201).json({ message: 'Заявку успішно відправлено' });
    } catch (error) {
        console.error('Error submitting application:', error.message, error.stack);
        res.status(500).json({ message: `Помилка сервера: ${error.message}` });
    }
});

// Endpoint to add data to teachers collection
app.post('/api/teachers', authenticateToken, async (req, res) => {
    try {
        const { name, email, teachesCourses, individualLessons, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ message: 'ПІБ, електронна пошта та пароль є обов’язковими' });
        }

        const existingTeacher = await Teacher.findOne({ email });
        if (existingTeacher) {
            return res.status(400).json({ message: 'Викладач з такою електронною поштою вже існує' });
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

        const token = jwt.sign({ teacherId: teacher._id, name: teacher.name, email: teacher.email }, process.env.JWT_SECRET || 'your-secret-key');
        const refreshToken = jwt.sign({ teacherId: teacher._id, name: teacher.name, email: teacher.email }, process.env.JWT_SECRET || 'your-secret-key');
        await new RefreshToken({
            token: refreshToken,
            userId: teacher._id,
            userType: 'Teacher',
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        }).save();

        console.log('Teacher added with ID:', teacher._id);
        res.status(201).json({
            message: 'Викладач успішно доданий',
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
        console.error('Error adding teacher:', error.message, error.stack);
        res.status(500).json({ message: `Помилка сервера: ${error.message}` });
    }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
=======
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const sanitizeHtml = require('sanitize-html');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors({ origin: ['http://localhost:3000', 'http://localhost:5500'] }));
app.use(express.json());
app.use(express.static('public'));

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.log(err));

// User Schema
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

// Teacher Schema
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
    tracker: String // Додано поле tracker
});

const Teacher = mongoose.model('Teacher', teacherSchema);

// Tracker Schema
const trackerSchema = new mongoose.Schema({
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true },
    date: { type: Date, default: Date.now },
    activity: { type: String, required: true },
    details: { type: String, required: true }
});

const Tracker = mongoose.model('Tracker', trackerSchema);

// Course Schema
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

// Review Schema
const reviewSchema = new mongoose.Schema({
    text: String,
    author: String
});

const Review = mongoose.model('Review', reviewSchema);

// Blog Post Schema
const blogPostSchema = new mongoose.Schema({
    title: String,
    description: String,
    content: String,
    publishedAt: { type: Date, default: Date.now }
});

const BlogPost = mongoose.model('BlogPost', blogPostSchema);

// Application Schema
const applicationSchema = new mongoose.Schema({
    name: String,
    contact: String,
    format: String,
    course: String,
    date: Date
});

const Application = mongoose.model('Application', applicationSchema);

// Refresh Token Schema
const refreshTokenSchema = new mongoose.Schema({
    token: String,
    userId: { type: mongoose.Schema.Types.ObjectId, refPath: 'userType' },
    userType: { type: String, enum: ['User', 'Teacher'] },
    expiresAt: Date
});

const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema);

// Middleware to verify JWT
const authenticateToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    console.log('Received token:', token);
    if (!token) {
        console.error('No token provided in request headers');
        return res.status(401).json({ message: 'Токен не надано' });
    }

    jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
        if (err) {
            console.error('Token verification error:', err.message);
            return res.status(403).json({ message: 'Недійсний токен' });
        }
        req.user = user;
        next();
    });
};

// Registration API endpoint
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ message: 'Усі поля є обов’язковими' });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: 'Користувач з такою поштою вже існує' });
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
        
        const token = jwt.sign({ email: user.email }, process.env.JWT_SECRET || 'your-secret-key');
        const refreshToken = jwt.sign({ email: user.email }, process.env.JWT_SECRET || 'your-secret-key');
        await new RefreshToken({
            token: refreshToken,
            userId: user._id,
            userType: 'User',
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        }).save();

        res.status(201).json({ 
            message: 'Реєстрація успішна',
            token,
            refreshToken,
            user: {
                name: user.name,
                email: user.email,
                registered: user.registered
            }
        });
    } catch (error) {
        console.error('Error during registration:', error.message, error.stack);
        res.status(500).json({ message: `Помилка сервера: ${error.message}` });
    }
});

// Teacher Registration API endpoint
app.post('/api/teacher-register', async (req, res) => {
    try {
        const { name, email, password, teachesCourses, individualLessons } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ message: 'ПІБ, електронна пошта та пароль є обов’язковими' });
        }

        const existingTeacher = await Teacher.findOne({ email });
        if (existingTeacher) {
            return res.status(400).json({ message: 'Викладач з такою електронною поштою вже існує' });
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
        
        const token = jwt.sign({ teacherId: teacher._id, name: teacher.name, email: teacher.email }, process.env.JWT_SECRET || 'your-secret-key');
        const refreshToken = jwt.sign({ teacherId: teacher._id, name: teacher.name, email: teacher.email }, process.env.JWT_SECRET || 'your-secret-key');
        await new RefreshToken({
            token: refreshToken,
            userId: teacher._id,
            userType: 'Teacher',
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        }).save();

        res.status(201).json({ 
            message: 'Реєстрація викладача успішна',
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
        console.error('Error during teacher registration:', error.message, error.stack);
        res.status(500).json({ message: `Помилка сервера: ${error.message}` });
    }
});

// Login API endpoint
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: 'Електронна пошта та пароль є обов’язковими' });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ message: 'Неправильна пошта або пароль' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Неправильна пошта або пароль' });
        }

        const token = jwt.sign({ email: user.email }, process.env.JWT_SECRET || 'your-secret-key');
        const refreshToken = jwt.sign({ email: user.email }, process.env.JWT_SECRET || 'your-secret-key');
        await RefreshToken.deleteMany({ userId: user._id, userType: 'User' });
        await new RefreshToken({
            token: refreshToken,
            userId: user._id,
            userType: 'User',
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        }).save();

        res.status(200).json({
            message: 'Вхід успішний',
            token,
            refreshToken,
            user: {
                name: user.name,
                email: user.email,
                registered: user.registered
            }
        });
    } catch (error) {
        console.error('Error during login:', error.message, error.stack);
        res.status(500).json({ message: `Помилка сервера: ${error.message}` });
    }
});

// Teacher Login API endpoint
app.post('/api/teacher-login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: 'Електронна пошта та пароль є обов’язковими' });
        }

        const teacher = await Teacher.findOne({ email });
        if (!teacher) {
            return res.status(401).json({ message: 'Неправильна електронна пошта або пароль' });
        }

        const isMatch = await bcrypt.compare(password, teacher.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Неправильна електронна пошта або пароль' });
        }

        const token = jwt.sign({ teacherId: teacher._id, name: teacher.name, email: teacher.email }, process.env.JWT_SECRET || 'your-secret-key');
        const refreshToken = jwt.sign({ teacherId: teacher._id, name: teacher.name, email: teacher.email }, process.env.JWT_SECRET || 'your-secret-key');
        await RefreshToken.deleteMany({ userId: teacher._id, userType: 'Teacher' });
        await new RefreshToken({
            token: refreshToken,
            userId: teacher._id,
            userType: 'Teacher',
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        }).save();

        res.status(200).json({
            message: 'Вхід як викладач успішний',
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
        console.error('Error during teacher login:', error.message, error.stack);
        res.status(500).json({ message: `Помилка сервера: ${error.message}` });
    }
});

// Teacher Login API endpoint (No Expiry)
app.post('/api/teacher-login-no-expiry', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: 'Електронна пошта та пароль є обов’язковими' });
        }

        const teacher = await Teacher.findOne({ email });
        if (!teacher) {
            return res.status(401).json({ message: 'Неправильна електронна пошта або пароль' });
        }

        const isMatch = await bcrypt.compare(password, teacher.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Неправильна електронна пошта або пароль' });
        }

        const token = jwt.sign({ teacherId: teacher._id, name: teacher.name, email: teacher.email }, process.env.JWT_SECRET || 'your-secret-key');
        const refreshToken = jwt.sign({ teacherId: teacher._id, name: teacher.name, email: teacher.email }, process.env.JWT_SECRET || 'your-secret-key');
        await RefreshToken.deleteMany({ userId: teacher._id, userType: 'Teacher' });
        await new RefreshToken({
            token: refreshToken,
            userId: teacher._id,
            userType: 'Teacher'
        }).save();

        res.status(200).json({
            message: 'Вхід як викладач без терміну дії успішний',
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
        console.error('Error during teacher login (no expiry):', error.message, error.stack);
        res.status(500).json({ message: `Помилка сервера: ${error.message}` });
    }
});

// Refresh Token API endpoint
app.post('/api/refresh-token', async (req, res) => {
    try {
        const { refreshToken } = req.body;
        console.log('Received refresh token:', refreshToken);
        if (!refreshToken) {
            console.error('No refresh token provided');
            return res.status(400).json({ message: 'Refresh token не надано' });
        }

        const tokenDoc = await RefreshToken.findOne({ token: refreshToken });
        if (!tokenDoc) {
            console.error('Refresh token not found in database');
            return res.status(403).json({ message: 'Недійсний refresh token' });
        }
        if (tokenDoc.expiresAt && tokenDoc.expiresAt < new Date()) {
            console.error('Refresh token expired:', tokenDoc.expiresAt);
            await RefreshToken.deleteOne({ _id: tokenDoc._id });
            return res.status(403).json({ message: 'Прострочений refresh token' });
        }

        const Model = tokenDoc.userType === 'User' ? User : Teacher;
        const user = await Model.findById(tokenDoc.userId);
        if (!user) {
            console.error('User not found for ID:', tokenDoc.userId);
            return res.status(404).json({ message: 'Користувача не знайдено' });
        }

        const payload = tokenDoc.userType === 'User' 
            ? { email: user.email }
            : { teacherId: user._id, name: user.name, email: user.email };
        const newToken = jwt.sign(payload, process.env.JWT_SECRET || 'your-secret-key');
        console.log('New token generated for user:', user.email);

        res.json({ token: newToken });
    } catch (error) {
        console.error('Error refreshing token:', error.message, error.stack);
        res.status(500).json({ message: `Помилка сервера: ${error.message}` });
    }
});

// Profile API endpoint
app.get('/api/profile', authenticateToken, async (req, res) => {
    try {
        let user;
        if (req.query.studentId) {
            user = await User.findById(req.query.studentId, 'name courses schedule').lean();
            if (!user) {
                console.error('Student not found for ID:', req.query.studentId);
                return res.status(404).json({ message: 'Студента не знайдено' });
            }
            res.json({
                name: user.name || 'Невідомо',
                courses: user.courses || [],
                schedule: user.schedule || []
            });
        } else {
            user = await User.findOne({ email: req.user.email }, 'name email registered language courses schedule').lean();
            if (!user) {
                console.error('User not found for email:', req.user.email);
                return res.status(404).json({ message: 'Користувача не знайдено' });
            }
            const reviews = await Review.find({ author: user.name }, 'text').sort({ _id: -1 }).lean();
            res.json({
                name: user.name,
                email: user.email,
                registered: user.registered,
                language: user.language,
                courses:  user.courses,
                schedule: user.schedule,
                reviews: reviews.map(review => review.text)
            });
        }
    } catch (error) {
        console.error('Error fetching profile:', error.message, error.stack);
        res.status(500).json({ message: `Помилка сервера: ${error.message}` });
    }
});

// Teacher Profile API endpoint
app.get('/api/teacher-profile', authenticateToken, async (req, res) => {
    try {
        console.log('Fetching teacher profile for ID:', req.user.teacherId);
        const teacher = await Teacher.findById(req.user.teacherId).lean();
        if (!teacher) {
            console.error('Teacher not found for ID:', req.user.teacherId);
            return res.status(404).json({ message: 'Викладача не знайдено' });
        }
        console.log('Raw teacher data from DB:', teacher);

        // Отримання materialsLink для курсів із колекції Course
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
                courseId: course.id || 'Невідомо',
                name: course.name || 'Невідомо',
                groupNumber: course.groupNumber || 'Невідомо',
                materialsLink: course.materialsLink || courseMap[course.name] || '#'
            })) : [],
            individualLessons: Array.isArray(teacher.individualLessons) ? teacher.individualLessons.map(lesson => ({
                individualId: lesson._id ? lesson._id.toString() : 'Невідомо',
                studentId: lesson.studentId?.toString() || lesson.studentId || 'Невідомо',
                lesson: lesson.lesson || 'Невідомо',
                courseName: lesson.courseName || 'Невідомо',
                meetLink: lesson.meetLink || '#',
                materialsLink: lesson.materialsLink || '#'
            })) : [],
            tracker: teacher.tracker || '#' // Додано поле tracker
        };

        console.log('Teacher profile response:', response);
        res.json(response);
    } catch (error) {
        console.error('Error fetching teacher profile for ID:', req.user.teacherId, error.message, error.stack);
        res.status(500).json({ message: `Помилка сервера: ${error.message}` });
    }
});

// Teacher Tracker API endpoint (GET)
app.get('/api/teacher-tracker', authenticateToken, async (req, res) => {
    try {
        console.log('Fetching tracker data for teacher ID:', req.user.teacherId);
        const trackerEntries = await Tracker.find({ teacherId: req.user.teacherId }).sort({ date: -1 }).lean();
        console.log('Raw tracker entries:', trackerEntries);
        if (!trackerEntries || trackerEntries.length === 0) {
            console.warn('No tracker entries found for teacher ID:', req.user.teacherId);
            return res.json([]);
        }
        console.log('Tracker entries found:', trackerEntries.length);
        const response = trackerEntries.map(entry => ({
            id: entry._id.toString(),
            date: entry.date,
            activity: sanitizeHtml(entry.activity) || 'Невідомо',
            details: sanitizeHtml(entry.details) || 'Немає деталей'
        }));
        res.json(response);
    } catch (error) {
        console.error('Error fetching tracker data for teacher ID:', req.user.teacherId, error.message, error.stack);
        res.status(500).json({ message: `Помилка сервера: ${error.message}` });
    }
});

// Teacher Tracker API endpoint (POST)
app.post('/api/teacher-tracker', authenticateToken, async (req, res) => {
    try {
        const { activity, details } = req.body;
        if (!activity || !details) {
            return res.status(400).json({ message: 'Поля activity та details є обов’язковими' });
        }

        // Validate and sanitize inputs
        const sanitizedActivity = sanitizeHtml(activity, { allowedTags: [], allowedAttributes: {} });
        const sanitizedDetails = sanitizeHtml(details, { allowedTags: [], allowedAttributes: {} });
        if (!sanitizedActivity || !sanitizedDetails) {
            return res.status(400).json({ message: 'Недійсні дані для activity або details' });
        }

        // Verify teacher exists
        const teacher = await Teacher.findById(req.user.teacherId);
        if (!teacher) {
            console.error('Teacher not found for ID:', req.user.teacherId);
            return res.status(404).json({ message: 'Викладача не знайдено' });
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
            message: 'Запис у трекер успішно додано',
            trackerEntry: {
                id: trackerEntry._id.toString(),
                date: trackerEntry.date,
                activity: trackerEntry.activity,
                details: trackerEntry.details
            }
        });
    } catch (error) {
        console.error('Error adding tracker entry:', error.message, error.stack);
        res.status(500).json({ message: `Помилка сервера: ${error.message}` });
    }
});

// Home API endpoint
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
        console.error('Error fetching home data:', error.message, error.stack);
        res.status(500).json({ message: `Помилка сервера: ${error.message}` });
    }
});

// Blog API endpoint (Get all posts)
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
        console.error('Error fetching blog posts:', error.message, error.stack);
        res.status(500).json({ message: `Помилка сервера: ${error.message}` });
    }
});

// Blog API endpoint (Get single post)
app.get('/api/blog/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log('Fetching blog post with ID:', id);
        const post = await BlogPost.findById(id).lean();
        if (!post) {
            return res.status(404).json({ message: 'Статтю не знайдено' });
        }
        res.json(post);
    } catch (error) {
        console.error('Error fetching blog post:', error.message, error.stack);
        res.status(500).json({ message: `Помилка сервера: ${error.message}` });
    }
});

// Course Application API endpoint
app.post('/api/purchase', async (req, res) => {
    try {
        const { name, contact, format, course, date } = req.body;
        if (!name || !contact || !format || !course || !date) {
            return res.status(400).json({ message: 'Усі поля є обов’язковими' });
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
        res.status(201).json({ message: 'Заявку успішно відправлено' });
    } catch (error) {
        console.error('Error submitting application:', error.message, error.stack);
        res.status(500).json({ message: `Помилка сервера: ${error.message}` });
    }
});

// Endpoint to add data to teachers collection
app.post('/api/teachers', authenticateToken, async (req, res) => {
    try {
        const { name, email, teachesCourses, individualLessons, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ message: 'ПІБ, електронна пошта та пароль є обов’язковими' });
        }

        const existingTeacher = await Teacher.findOne({ email });
        if (existingTeacher) {
            return res.status(400).json({ message: 'Викладач з такою електронною поштою вже існує' });
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

        const token = jwt.sign({ teacherId: teacher._id, name: teacher.name, email: teacher.email }, process.env.JWT_SECRET || 'your-secret-key');
        const refreshToken = jwt.sign({ teacherId: teacher._id, name: teacher.name, email: teacher.email }, process.env.JWT_SECRET || 'your-secret-key');
        await new RefreshToken({
            token: refreshToken,
            userId: teacher._id,
            userType: 'Teacher',
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        }).save();

        console.log('Teacher added with ID:', teacher._id);
        res.status(201).json({
            message: 'Викладач успішно доданий',
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
        console.error('Error adding teacher:', error.message, error.stack);
        res.status(500).json({ message: `Помилка сервера: ${error.message}` });
    }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
>>>>>>> 80f0ef3ac22c6cdd502c0ac2c500f792fd868571
