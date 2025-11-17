const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  userId: String,
  username: String,
  exp: { type: Number, default: 10 },
  level: { type: Number, default: 0 },
  points: { type: Number, default: 10 },
  justHitLevel0: { type: Boolean, default: false }
});

module.exports = mongoose.model('User', userSchema);
