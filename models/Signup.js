const mongoose = require('mongoose');

const signupSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    contact: { type: String, required: true, trim: true },
    course: { type: String, required: true, trim: true },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Signup', signupSchema);