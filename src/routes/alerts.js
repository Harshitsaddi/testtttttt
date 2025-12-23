// src/routes/alerts.js - IMPROVED VERSION
const express = require('express');
const Alert = require('../models/Alert');
const auth = require('../middlewares/auth');
const router = express.Router();

router.use(auth);

// Create new alert
router.post('/', async (req, res, next) => {
  try {
    const { symbol, condition, price } = req.body;
    
    // Validation
    if (!symbol || !condition || !price) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    if (!['GT', 'LT'].includes(condition)) {
      return res.status(400).json({ error: 'Invalid condition. Must be GT or LT' });
    }
    
    if (isNaN(price) || price <= 0) {
      return res.status(400).json({ error: 'Invalid price' });
    }
    
    const a = new Alert({ 
      userId: req.user.id, 
      symbol: symbol.toUpperCase(), 
      condition, 
      price: parseFloat(price)
    });
    
    await a.save();
    res.status(201).json(a);
  } catch (err) { 
    console.error('Create alert error:', err);
    next(err); 
  }
});

// Get all alerts for user
router.get('/', async (req, res, next) => {
  try {
    const list = await Alert.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(list);
  } catch (err) { 
    console.error('Get alerts error:', err);
    next(err); 
  }
});

// Get alert by ID
router.get('/:id', async (req, res, next) => {
  try {
    const alert = await Alert.findById(req.params.id);
    
    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }
    
    // Check ownership
    if (String(alert.userId) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    
    res.json(alert);
  } catch (err) { 
    console.error('Get alert error:', err);
    next(err); 
  }
});

// Delete alert
router.delete('/:id', async (req, res, next) => {
  try {
    const alert = await Alert.findById(req.params.id);
    
    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }
    
    // Check ownership
    if (String(alert.userId) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    
    await Alert.findByIdAndDelete(req.params.id);
    res.json({ message: 'Alert deleted successfully' });
  } catch (err) { 
    console.error('Delete alert error:', err);
    next(err); 
  }
});

// Update alert (mark as triggered or update target)
router.put('/:id', async (req, res, next) => {
  try {
    const alert = await Alert.findById(req.params.id);
    
    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }
    
    // Check ownership
    if (String(alert.userId) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    
    const { price, condition, triggered } = req.body;
    
    if (price !== undefined) alert.price = parseFloat(price);
    if (condition !== undefined && ['GT', 'LT'].includes(condition)) alert.condition = condition;
    if (triggered !== undefined) alert.triggered = Boolean(triggered);
    
    await alert.save();
    res.json(alert);
  } catch (err) { 
    console.error('Update alert error:', err);
    next(err); 
  }
});

module.exports = router;