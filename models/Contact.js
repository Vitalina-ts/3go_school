const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
  name: { type: String, required: true },
  contact: { type: String, required: true },
  course: { type: String, required: true },
  format: { type: String, required: true }, // Перевірка, що поле format обов’язкове
  createdAt: { type: Date, default: Date.now, required: true } // Дата створення
});

module.exports = mongoose.model('Contact', contactSchema);