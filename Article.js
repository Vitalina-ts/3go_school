const mongoose = require('mongoose');

const articleSchema = new mongoose.Schema({
  title: { type: String, required: true },
  image: { type: String, required: true },
  content: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, required: true }
}, { collection: 'articles' }); // Явно вказуємо назву колекції

module.exports = mongoose.model('Article', articleSchema);