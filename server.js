const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors()); // Enable CORS for cross-origin requests
app.use(express.json());
app.use(express.static('public')); // Serve static files (e.g., HTML, CSS, JS)

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/skillbridge';
mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

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
        meetLink: String
    }]
});

const User = mongoose.model('User', userSchema);

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
    }
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

// Application Schema (for course applications)
const applicationSchema = new mongoose.Schema({
    name: String,
    contact: String,
    format: String,
    course: String,
    date: Date
});

const Application = mongoose.model('Application', applicationSchema);

// Middleware to verify JWT
const authenticateToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Токен не надано' });

    jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
        if (err) return res.status(403).json({ message: 'Недійсний токен' });
        req.user = user;
        next();
    });
};

// Registration API endpoint
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        
        // Validate input
        if (!name || !email || !password) {
            return res.status(400).json({ message: 'Усі поля є обов’язковими' });
        }

        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: 'Користувач з такою поштою вже існує' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create new user
        const user = new User({
            name,
            email,
            password: hashedPassword,
            registered: new Date(),
            language: 'uk',
            courses: [],
            schedule: []
        });

        await user.save();
        
        // Generate JWT token
        const token = jwt.sign({ email: user.email }, process.env.JWT_SECRET || 'your-secret-key', { expiresIn: '1h' });
        
        res.status(201).json({ 
            message: 'Реєстрація успішна',
            token,
            user: {
                name: user.name,
                email: user.email,
                registered: user.registered
            }
        });
    } catch (error) {
        console.error('Error during registration:', error);
        res.status(500).json({ message: 'Помилка сервера' });
    }
});

// Login API endpoint
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validate input
        if (!email || !password) {
            return res.status(400).json({ message: 'Електронна пошта та пароль є обов’язковими' });
        }

        // Check if user exists
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ message: 'Неправильна пошта або пароль' });
        }

        // Compare password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Неправильна пошта або пароль' });
        }

        // Generate JWT token
        const token = jwt.sign({ email: user.email }, process.env.JWT_SECRET || 'your-secret-key', { expiresIn: '1h' });

        res.status(200).json({
            message: 'Вхід успішний',
            token,
            user: {
                name: user.name,
                email: user.email,
                registered: user.registered
            }
        });
    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).json({ message: 'Помилка сервера' });
    }
});

// Profile API endpoint
app.get('/api/profile', authenticateToken, async (req, res) => {
    try {
        const user = await User.findOne({ email: req.user.email }, 'name email registered language courses schedule');
        if (!user) return res.status(404).json({ message: 'Користувача не знайдено' });

        // Fetch reviews authored by the user
        const reviews = await Review.find({ author: user.name }, 'text');

        res.json({
            name: user.name,
            email: user.email,
            registered: user.registered,
            language: user.language,
            courses: user.courses,
            schedule: user.schedule,
            reviews: reviews.map(review => review.text)
        });
    } catch (error) {
        console.error('Error fetching profile:', error);
        res.status(500).json({ message: 'Помилка сервера' });
    }
});

// Home API endpoint (Courses and Reviews)
app.get('/api/home', async (req, res) => {
    try {
        const courses = await Course.find();
        const reviews = await Review.find();
        res.json({ courses, reviews });
    } catch (error) {
        console.error('Error fetching home data:', error);
        res.status(500).json({ message: 'Помилка сервера' });
    }
});

// Blog API endpoint (Get all posts)
app.get('/api/blog', async (req, res) => {
    try {
        const posts = await BlogPost.find().sort({ publishedAt: -1 });
        res.json(posts);
    } catch (error) {
        console.error('Error fetching blog posts:', error);
        res.status(500).json({ message: 'Помилка сервера' });
    }
});

// Blog API endpoint (Create new post)
app.post('/api/blog', authenticateToken, async (req, res) => {
    try {
        const { title, description, content } = req.body;
        if (!title || !description || !content) {
            return res.status(400).json({ message: 'Усі поля є обов’язковими' });
        }

        const post = new BlogPost({ title, description, content });
        await post.save();
        res.status(201).json({ message: 'Статтю успішно опубліковано', post });
    } catch (error) {
        console.error('Error creating blog post:', error);
        res.status(500).json({ message: 'Помилка сервера' });
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
            name,
            contact,
            format,
            course,
            date: new Date(date)
        });
        await application.save();
        res.status(201).json({ message: 'Заявку успішно відправлено' });
    } catch (error) {
        console.error('Error submitting application:', error);
        res.status(500).json({ message: 'Помилка сервера' });
    }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
