const express = require('express');
const mongoose = require('mongoose');
const { body, validationResult } = require('express-validator');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Налаштування CORS для конкретного джерела
app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Віддавати home.html при заході на /
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'home.html'));
});

// Підключення до MongoDB
mongoose.connect('mongodb://localhost:27017/skillbridge', {
  serverSelectionTimeoutMS: 5000,
  maxPoolSize: 10,
})
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Підключення моделі PossiblePurchase
const PossiblePurchase = require('./PossiblePurchase');

// Ендпоінт для прийому заявок на покупку
app.post('/api/purchase', [
  body('name').trim().notEmpty().withMessage('Ім’я є обов’язковим'),
  body('contact').trim().notEmpty().withMessage('Телефон/Telegram є обов’язковим'),
  body('format').trim().notEmpty().withMessage('Оберіть формат занять'),
  body('course').trim().notEmpty().withMessage('Курс не вказано')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { name, contact, format, course, date } = req.body;
  console.log('Received data:', { name, contact, format, course, date });

  try {
    const createdAt = date ? new Date(date) : new Date();

    const newPurchase = new PossiblePurchase({
      name,
      contact,
      format,
      course,
      createdAt
    });

    const savedPurchase = await newPurchase.save();
    console.log('Saved purchase:', savedPurchase);
    res.status(201).json({ message: 'Заявка успішно збережена!', data: savedPurchase });
  } catch (error) {
    console.error('Error saving purchase:', error);
    res.status(500).json({ message: 'Помилка сервера', error: error.message });
  }
});

// Обробка помилок для невідомих маршрутів
app.use((req, res) => {
  res.status(404).json({ message: 'Маршрут не знайдено' });
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} at ${new Date().toLocaleString('uk-UA')}`);
});