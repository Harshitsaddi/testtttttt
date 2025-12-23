// src/jobs/priceUpdater.js - IMPROVED VERSION
require('dotenv').config();
const cron = require('node-cron');
const StockPriceService = require('../services/stockPriceService');
const Alert = require('../models/Alert');
const MarketPrice = require('../models/MarketPrice');

async function checkAlerts() {
  try {
    const alerts = await Alert.find({ triggered: false });
    let triggeredCount = 0;
    
    for (const alert of alerts) {
      const mp = await MarketPrice.findOne({ symbol: alert.symbol });
      if (!mp) continue;
      
      let shouldTrigger = false;
      
      if (alert.condition === 'GT' && mp.price > alert.price) {
        shouldTrigger = true;
      } else if (alert.condition === 'LT' && mp.price < alert.price) {
        shouldTrigger = true;
      }
      
      if (shouldTrigger) {
        alert.triggered = true;
        await alert.save();
        triggeredCount++;
        console.log(`🔔 Alert triggered: ${alert.symbol} ${alert.condition} $${alert.price} (Current: $${mp.price})`);
      }
    }
    
    if (triggeredCount > 0) {
      console.log(`✅ Triggered ${triggeredCount} alert(s)`);
    }
  } catch (error) {
    console.error('❌ Error checking alerts:', error);
  }
}

async function runOnce() {
  const startTime = Date.now();
  console.log('⏰ Starting price update cycle...');
  
  try {
    await StockPriceService.updateStockPrices();
    await checkAlerts();
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Price update complete (${duration}s)\n`);
  } catch (error) {
    console.error('❌ Price update cycle failed:', error);
  }
}

async function start() {
  console.log('🚀 Starting Finsight Price Updater Service');
  console.log('==========================================');
  
  // Run every 30 seconds for realistic updates
  const cronExp = process.env.PRICE_UPDATE_CRON || '*/30 * * * * *';
  console.log(`⏱️  Update interval: ${cronExp}`);
  console.log(`📊 Updating stock prices and checking alerts...`);
  console.log('==========================================\n');
  
  // Run once immediately
  await runOnce();
  
  // Schedule recurring updates
  cron.schedule(cronExp, async () => {
    try {
      await runOnce();
    } catch (err) {
      console.error('❌ Scheduled update error:', err);
    }
  });
  
  // Reset daily stats at midnight (optional)
  cron.schedule('0 0 * * *', async () => {
    console.log('🌅 Resetting daily statistics...');
    try {
      await StockPriceService.resetDailyStats();
      console.log('✅ Daily stats reset complete\n');
    } catch (err) {
      console.error('❌ Daily stats reset failed:', err);
    }
  });
  
  console.log('✅ Price updater service running');
  console.log('Press Ctrl+C to stop\n');
}

// Run directly if executed as main module
if (require.main === module) {
  const mongoose = require('mongoose');
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/finsight';
  
  console.log('🔗 Connecting to MongoDB...');
  
  mongoose.connect(uri)
    .then(async () => {
      console.log('✅ Connected to MongoDB\n');
      
      // Seed stock data if needed
      console.log('🌱 Checking for stock data...');
      await StockPriceService.seedStockData();
      console.log('');
      
      // Start the updater service
      await start();
    })
    .catch(err => {
      console.error('❌ MongoDB connection failed:', err);
      process.exit(1);
    });
  
  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\n⏹️  Shutting down price updater service...');
    try {
      await mongoose.connection.close();
      console.log('✅ MongoDB connection closed');
      console.log('👋 Goodbye!\n');
      process.exit(0);
    } catch (err) {
      console.error('❌ Error during shutdown:', err);
      process.exit(1);
    }
  });
}

module.exports = { start, runOnce };