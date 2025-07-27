const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const sanitizeHtml = require('sanitize-html');
const path = require('path');
require('dotenv').config();

const app = express();

// Налаштування CORS
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5500',
  'https://skillbridge-school-1.onrender.com',
  process.env.FRONTEND_URL
].filter(Boolean); // Видаляємо undefined/null значення
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

// Перевірка існування папки public
app.use(express.static(path.join(__dirname, 'public')));

// Маршрут для кореня, щоб віддавати index.html для SPA
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'home.html'), (err) => {
    if (err) {
      console.error('Помилка відправки index.html:', err.message);
      res.status(404).json({ message: 'Сторінку не знайдено' });
    }
  });
});

// Перевірка змінних середовища
const { MONGO_URI, JWT_SECRET } = process.env;
if (!MONGO_URI) {
  console.error('MONGO_URI не визначено у змінних середовища');
}
if (!JWT_SECRET) {
  console.error('JWT_SECRET не визначено у змінних середовища');
}
if (MONGO_URI) {
  console.log('MONGO_URI:', MONGO_URI);
}

// Змінна для відстеження стану підключення до MongoDB
let isMongoConnected = false;

const connectWithRetry = async () => {
  try {
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 10
    });
    console.log('Підключено до MongoDB');
    isMongoConnected = true;
  } catch (err) {
    console.error('Помилка підключення до MongoDB:', err.message);
    console.log('Повторна спроба через 5 секунд...');
    isMongoConnected = false;
    setTimeout(connectWithRetry, 5000);
  }
};

// Додаткове логування стану підключення
mongoose.connection.on('disconnected', () => {
  console.error('Відключено від MongoDB');
  isMongoConnected = false;
  connectWithRetry();
});
mongoose.connection.on('error', (err) => {
  console.error('Помилка MongoDB:', err.message);
});

if (MONGO_URI) {
  connectWithRetry();
}

// Схема користувача
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

// Схема викладача
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

// Схема трекера
const trackerSchema = new mongoose.Schema({
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true },
  date: { type: Date, default: Date.now },
  activity: { type: String, required: true },
  details: { type: String, required: true }
});
const Tracker = mongoose.model('Tracker', trackerSchema);

// Схема курсу
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

// Схема відгуку
const reviewSchema = new mongoose.Schema({
  text: String,
  author: String
});
const Review = mongoose.model('Review', reviewSchema);

// Схема посту блогу
const blogPostSchema = new mongoose.Schema({
  title: String,
  description: String,
  content: String,
  publishedAt: { type: Date, default: Date.now }
});
const BlogPost = mongoose.model('BlogPost', blogPostSchema);

// Схема заявки
const applicationSchema = new mongoose.Schema({
  name: String,
  contact: String,
  format: String,
  course: String,
  date: Date
});
const Application = mongoose.model('Application', applicationSchema);

// Схема токена оновлення
const refreshTokenSchema = new mongoose.Schema({
  token: String,
  userId: { type: mongoose.Schema.Types.ObjectId, refPath: 'userType' },
  userType: { type: String, enum: ['User', 'Teacher'] },
  expiresAt: Date
});
const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema);

// Мідлвер для перевірки JWT
const authenticateToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  console.log('Отримано токен:', token);
  if (!token) {
    console.error('Токен не надано в заголовках запиту');
    return res.status(401).json({ message: 'Токен не надано' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.error('Помилка перевірки токена:', err.message);
      return res.status(403).json({ message: 'Недійсний токен' });
    }
    req.user = user;
    next();
  });
};

// Перевірка стану підключення для API
app.use((req, res, next) => {
  if (!isMongoConnected && req.path !== '/healthz') {
    return res.status(503).json({ message: 'Сервер тимчасово недоступний: проблема з підключенням до бази даних' });
  }
  next();
});

// Ендпоінт для перевірки здоров’я
app.get('/healthz', (req, res) => res.sendStatus(200));

// Реєстрація користувача
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
    
    const token = jwt.sign({ email: user.email }, JWT_SECRET);
    const refreshToken = jwt.sign({ email: user.email }, JWT_SECRET);
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
    console.error('Помилка під час реєстрації:', error.message, error.stack);
    res.status(500).json({ message: `Помилка сервера: ${error.message}` });
  }
});

// Реєстрація викладача
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
    
    const token = jwt.sign({ teacherId: teacher._id, name: teacher.name, email: teacher.email }, JWT_SECRET);
    const refreshToken = jwt.sign({ teacherId: teacher._id, name: teacher.name, email: teacher.email }, JWT_SECRET);
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
    console.error('Помилка під час реєстрації викладача:', error.message, error.stack);
    res.status(500).json({ message: `Помилка сервера: ${error.message}` });
  }
});

// Вхід користувача
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
    console.error('Помилка під час входу:', error.message, error.stack);
    res.status(500).json({ message: `Помилка сервера: ${error.message}` });
  }
});

// Вхід викладача
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
    console.error('Помилка під час входу викладача:', error.message, error.stack);
    res.status(500).json({ message: `Помилка сервера: ${error.message}` });
  }
});

// Вхід викладача без терміну дії
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

    const token = jwt.sign({ teacherId: teacher._id, name: teacher.name, email: teacher.email }, JWT_SECRET);
    const refreshToken = jwt.sign({ teacherId: teacher._id, name: teacher.name, email: teacher.email }, JWT_SECRET);
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
    console.error('Помилка під час входу викладача (без терміну дії):', error.message, error.stack);
    res.status(500).json({ message: `Помилка сервера: ${error.message}` });
  }
});

// Оновлення токена
app.post('/api/refresh-token', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    console.log('Отримано refresh token:', refreshToken);
    if (!refreshToken) {
      console.error('Refresh token не надано');
      return res.status(400).json({ message: 'Refresh token не надано' });
    }

    const tokenDoc = await RefreshToken.findOne({ token: refreshToken });
    if (!tokenDoc) {
      console.error('Refresh token не знайдено в базі даних');
      return res.status(403).json({ message: 'Недійсний refresh token' });
    }
    if (tokenDoc.expiresAt && tokenDoc.expiresAt < new Date()) {
      console.error('Refresh token прострочений:', tokenDoc.expiresAt);
      await RefreshToken.deleteOne({ _id: tokenDoc._id });
      return res.status(403).json({ message: 'Прострочений refresh token' });
    }

    const Model = tokenDoc.userType === 'User' ? User : Teacher;
    const user = await Model.findById(tokenDoc.userId);
    if (!user) {
      console.error('Користувача не знайдено за ID:', tokenDoc.userId);
      return res.status(404).json({ message: 'Користувача не знайдено' });
    }

    const payload = tokenDoc.userType === 'User' 
      ? { email: user.email }
      : { teacherId: user._id, name: user.name, email: user.email };
    const newToken = jwt.sign(payload, JWT_SECRET);
    console.log('Новий токен згенеровано для користувача:', user.email);

    res.json({ token: newToken });
  } catch (error) {
    console.error('Помилка оновлення токена:', error.message, error.stack);
    res.status(500).json({ message: `Помилка сервера: ${error.message}` });
  }
});

// Профіль користувача
app.get('/api/profile', authenticateToken, async (req, res) => {
  try {
    let user;
    if (req.query.studentId) {
      user = await User.findById(req.query.studentId, 'name courses schedule').lean();
      if (!user) {
        console.error('Студента не знайдено за ID:', req.query.studentId);
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
        console.error('Користувача не знайдено за email:', req.user.email);
        return res.status(404).json({ message: 'Користувача не знайдено' });
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
    console.error('Помилка отримання профілю:', error.message, error.stack);
    res.status(500).json({ message: `Помилка сервера: ${error.message}` });
  }
});

// Профіль викладача
app.get('/api/teacher-profile', authenticateToken, async (req, res) => {
  try {
    console.log('Отримання профілю викладача за ID:', req.user.teacherId);
    const teacher = await Teacher.findById(req.user.teacherId).lean();
    if (!teacher) {
      console.error('Викладача не знайдено за ID:', req.user.teacherId);
      return res.status(404).json({ message: 'Викладача не знайдено' });
    }
    console.log('Дані викладача з БД:', teacher);

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
      tracker: teacher.tracker || '#'
    };

    console.log('Відповідь профілю викладача:', response);
    res.json(response);
  } catch (error) {
    console.error('Помилка отримання профілю викладача за ID:', req.user.teacherId, error.message, error.stack);
    res.status(500).json({ message: `Помилка сервера: ${error.message}` });
  }
});

// Трекер викладача (GET)
app.get('/api/teacher-tracker', authenticateToken, async (req, res) => {
  try {
    console.log('Отримання даних трекера для викладача ID:', req.user.teacherId);
    const trackerEntries = await Tracker.find({ teacherId: req.user.teacherId }).sort({ date: -1 }).lean();
    console.log('Записи трекера:', trackerEntries);
    if (!trackerEntries || trackerEntries.length === 0) {
      console.warn('Записи трекера не знайдено для викладача ID:', req.user.teacherId);
      return res.json([]);
    }
    console.log('Знайдено записів трекера:', trackerEntries.length);
    const response = trackerEntries.map(entry => ({
      id: entry._id.toString(),
      date: entry.date,
      activity: sanitizeHtml(entry.activity) || 'Невідомо',
      details: sanitizeHtml(entry.details) || 'Немає деталей'
    }));
    res.json(response);
  } catch (error) {
    console.error('Помилка отримання даних трекера для викладача ID:', req.user.teacherId, error.message, error.stack);
    res.status(500).json({ message: `Помилка сервера: ${error.message}` });
  }
});

// Трекер викладача (POST)
app.post('/api/teacher-tracker', authenticateToken, async (req, res) => {
  try {
    const { activity, details } = req.body;
    if (!activity || !details) {
      return res.status(400).json({ message: 'Поля activity та details є обов’язковими' });
    }

    const sanitizedActivity = sanitizeHtml(activity, { allowedTags: [], allowedAttributes: {} });
    const sanitizedDetails = sanitizeHtml(details, { allowedTags: [], allowedAttributes: {} });
    if (!sanitizedActivity || !sanitizedDetails) {
      return res.status(400).json({ message: 'Недійсні дані для activity або details' });
    }

    const teacher = await Teacher.findById(req.user.teacherId);
    if (!teacher) {
      console.error('Викладача не знайдено за ID:', req.user.teacherId);
      return res.status(404).json({ message: 'Викладача не знайдено' });
    }

    const trackerEntry = new Tracker({
      teacherId: req.user.teacherId,
      date: new Date(),
      activity: sanitizedActivity,
      details: sanitizedDetails
    });

    await trackerEntry.save();
    console.log('Запис трекера додано:', trackerEntry);
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
    console.error('Помилка додавання запису трекера:', error.message, error.stack);
    res.status(500).json({ message: `Помилка сервера: ${error.message}` });
  }
});

// Домашня сторінка
app.get('/api/home', async (req, res) => {
  try {
    const courses = await Course.find().lean();
    console.log('Курси відправлено клієнту:', courses);
    const reviews = await Review.find().lean();
    res.json({ 
      courses: courses.map(course => ({
        ...course,
        materialsLink: course.materialsLink || '#'
      })),
      reviews 
    });
  } catch (error) {
    console.error('Помилка отримання даних домашньої сторінки:', error.message, error.stack);
    res.status(500).json({ message: `Помилка сервера: ${error.message}` });
  }
});

// Блог (усі пости)
app.get('/api/blog', async (req, res) => {
  try {
    console.log('Отримання всіх постів блогу...');
    const posts = await BlogPost.find().sort({ publishedAt: -1 }).lean();
    if (!posts) {
      console.warn('Пости не знайдено в базі даних');
      return res.json([]);
    }
    console.log(`Знайдено ${posts.length} постів блогу`);
    res.json(posts);
  } catch (error) {
    console.error('Помилка отримання постів блогу:', error.message, error.stack);
    res.status(500).json({ message: `Помилка сервера: ${error.message}` });
  }
});

// Блог (окремий пост)
app.get('/api/blog/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log('Отримання поста блогу з ID:', id);
    const post = await BlogPost.findById(id).lean();
    if (!post) {
      return res.status(404).json({ message: 'Статтю не знайдено' });
    }
    res.json(post);
  } catch (error) {
    console.error('Помилка отримання поста блогу:', error.message, error.stack);
    res.status(500).json({ message: `Помилка сервера: ${error.message}` });
  }
});

// Заявка на курс
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
    console.log('Заявку на курс збережено:', application);
    res.status(201).json({ message: 'Заявку успішно відправлено' });
  } catch (error) {
    console.error('Помилка відправлення заявки:', error.message, error.stack);
    res.status(500).json({ message: `Помилка сервера: ${error.message}` });
  }
});

// Додавання викладача
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

    const token = jwt.sign({ teacherId: teacher._id, name: teacher.name, email: teacher.email }, JWT_SECRET);
    const refreshToken = jwt.sign({ teacherId: teacher._id, name: teacher.name, email: teacher.email }, JWT_SECRET);
    await new RefreshToken({
      token: refreshToken,
      userId: teacher._id,
      userType: 'Teacher',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    }).save();

    console.log('Викладача додано з ID:', teacher._id);
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
    console.error('Помилка додавання викладача:', error.message, error.stack);
    res.status(500).json({ message: `Помилка сервера: ${error.message}` });
  }
});

// Глобальна обробка помилок
process.on('uncaughtException', (err) => {
  console.error('Неперехоплений виняток:', err.message, err.stack);
  process.exit(1);
});
process.on('unhandledRejection', (err) => {
  console.error('Неперехоплене відхилення промісу:', err.message, err.stack);
  process.exit(1);
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Сервер запущено на порту ${PORT}`));
