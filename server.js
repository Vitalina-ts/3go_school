const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = express();

// Middleware
app.use(express.json());
app.use(express.static('public')); // Serve static files (e.g., HTML, CSS)

// MongoDB connection
mongoose.connect('mongodb://localhost:27017/skillbridge', {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// User Schema
const userSchema = new mongoose.Schema({
    name: String,
    email: String,
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

    jwt.verify(token, 'your-secret-key', (err, user) => {
        if (err) return res.status(403).json({ message: 'Недійсний токен' });
        req.user = user;
        next();
    });
};

// Profile API endpoint
app.get('/api/profile', authenticateToken, async (req, res) => {
    try {
        const user = await User.findOne({ email: req.user.email });
        if (!user) return res.status(404).json({ message: 'Користувача не знайдено' });
        res.json(user);
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
