const mongoose = require('mongoose');

const possiblePurchaseSchema = new mongoose.Schema({
  name: { type: String, required: true },
  contact: { type: String, required: true },
  format: { type: String, required: true },
  course: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, required: true }
}, { collection: 'possiblepurchases' }); // Явно вказуємо назву колекції

module.exports = mongoose.model('PossiblePurchase', possiblePurchaseSchema);