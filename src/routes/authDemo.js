// src/routes/authDemo.js - ENHANCED VERSION
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Portfolio = require('../models/Portfolio');
const Transaction = require('../models/Transaction');
const Alert = require('../models/Alert');
const { computePortfolioSummary } = require('../controllers/valuation');

// Middleware to check login
function redirectIfLoggedIn(req, res, next) {
    if (req.session.userId) return res.redirect('/demo/dashboard');
    next();
}

function requireLogin(req, res, next) {
    if (!req.session.userId) return res.redirect('/demo/login');
    next();
}

// Home page - redirect to login if not authenticated, dashboard if authenticated
router.get('/', (req, res) => {
    if (req.session.userId) {
        return res.redirect('/demo/dashboard');
    } else {
        return res.redirect('/demo/login');
    }
});

// Signup page
router.get('/signup', redirectIfLoggedIn, (req, res) => {
    res.render('auth/signup', { error: null });
});

// Signup POST
router.post('/signup', async (req, res) => {
    try {
        const { email, password, name } = req.body;

        // Validate input
        if (!email || !password) {
            return res.render('auth/signup', { error: 'Email and password are required' });
        }

        if (password.length < 6) {
            return res.render('auth/signup', { error: 'Password must be at least 6 characters long' });
        }

        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.render('auth/signup', { error: 'Email already exists' });
        }

        const hashed = await bcrypt.hash(password, 10);
        const user = await User.create({
            email: email.toLowerCase(),
            name: name || 'User',
            passwordHash: hashed
        });

        req.session.userId = user._id;
        req.session.save((err) => {
            if (err) {
                console.error('Session save error:', err);
            }
            res.redirect('/demo/dashboard');
        });
    } catch (err) {
        console.error('Signup error:', err);
        res.render('auth/signup', { error: 'Something went wrong. Please try again.' });
    }
});

// Login page
router.get('/login', redirectIfLoggedIn, (req, res) => {
    res.render('auth/login', { error: null });
});

// Login POST
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.render('auth/login', { error: 'Email and password are required' });
        }

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.render('auth/login', { error: 'Invalid email or password' });
        }

        const match = await bcrypt.compare(password, user.passwordHash);
        if (!match) {
            return res.render('auth/login', { error: 'Invalid email or password' });
        }

        req.session.userId = user._id;
        req.session.save((err) => {
            if (err) {
                console.error('Session save error:', err);
            }
            res.redirect('/demo/dashboard');
        });
    } catch (err) {
        console.error('Login error:', err);
        res.render('auth/login', { error: 'Something went wrong. Please try again.' });
    }
});

// Logout
router.get('/logout', requireLogin, (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Session destroy error:', err);
        }
        res.redirect('/demo/login');
    });
});

// Dashboard (after login) - ENHANCED
router.get('/dashboard', requireLogin, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);
        if (!user) {
            req.session.destroy();
            return res.redirect('/demo/login');
        }
        
        const portfolios = await Portfolio.find({ ownerId: req.session.userId }).sort({ createdAt: -1 });
        
        // Get portfolio summaries for dashboard
        const portfolioSummaries = [];
        for (const portfolio of portfolios) {
            try {
                const summary = await computePortfolioSummary(portfolio._id);
                portfolioSummaries.push({
                    portfolio,
                    summary
                });
            } catch (err) {
                console.error(`Error computing summary for portfolio ${portfolio._id}:`, err);
            }
        }
        
        res.render('auth/dashboard', {
            portfolios,
            portfolioSummaries,
            user,
            error: null
        });
    } catch (err) {
        console.error('Dashboard error:', err);
        res.render('auth/dashboard', {
            portfolios: [],
            portfolioSummaries: [],
            user: null,
            error: 'Error loading dashboard'
        });
    }
});

// Create portfolio page
router.get('/portfolio/create', requireLogin, (req, res) => {
    res.render('portfolio/create', { error: null });
});

// Create portfolio POST
router.post('/portfolio/create', requireLogin, async (req, res) => {
    try {
        const { name, currency } = req.body;

        if (!name) {
            return res.render('portfolio/create', { error: 'Portfolio name is required' });
        }

        if (name.length < 3) {
            return res.render('portfolio/create', { error: 'Portfolio name must be at least 3 characters long' });
        }

        const portfolio = new Portfolio({
            ownerId: req.session.userId,
            name: name.trim(),
            currency: currency || 'USD'
        });

        await portfolio.save();
        res.redirect('/demo/dashboard');
    } catch (err) {
        console.error('Portfolio creation error:', err);
        res.render('portfolio/create', { error: 'Failed to create portfolio' });
    }
});

// Portfolio summary
router.get('/portfolio/:id', requireLogin, async (req, res) => {
    try {
        const portfolio = await Portfolio.findById(req.params.id);

        if (!portfolio || String(portfolio.ownerId) !== String(req.session.userId)) {
            return res.status(404).render('error', { message: 'Portfolio not found' });
        }

        const summary = await computePortfolioSummary(req.params.id);

        res.render('portfolio/summary', {
            portfolio,
            holdings: summary.holdings,
            totalValue: summary.totalValue,
            totalCost: summary.totalCost,
            unrealizedPL: summary.unrealizedPL
        });
    } catch (err) {
        console.error('Portfolio summary error:', err);
        res.status(500).render('error', { message: 'Error loading portfolio' });
    }
});

// Portfolio transactions
router.get('/portfolio/:id/transactions', requireLogin, async (req, res) => {
    try {
        const portfolio = await Portfolio.findById(req.params.id);

        if (!portfolio || String(portfolio.ownerId) !== String(req.session.userId)) {
            return res.status(404).render('error', { message: 'Portfolio not found' });
        }

        const transactions = await Transaction.find({ portfolioId: req.params.id }).sort({ date: -1 });

        res.render('portfolio/transactions', {
            portfolio,
            transactions
        });
    } catch (err) {
        console.error('Transactions error:', err);
        res.status(500).render('error', { message: 'Error loading transactions' });
    }
});

// Portfolio alerts
router.get('/portfolio/:id/alerts', requireLogin, async (req, res) => {
    try {
        const portfolio = await Portfolio.findById(req.params.id);

        if (!portfolio || String(portfolio.ownerId) !== String(req.session.userId)) {
            return res.status(404).render('error', { message: 'Portfolio not found' });
        }

        const alerts = await Alert.find({ userId: req.session.userId }).sort({ createdAt: -1 });

        res.render('portfolio/alerts', {
            portfolio,
            alerts
        });
    } catch (err) {
        console.error('Alerts error:', err);
        res.status(500).render('error', { message: 'Error loading alerts' });
    }
});

// Add transaction page
router.get('/portfolio/:id/transaction/add', requireLogin, async (req, res) => {
    try {
        const portfolio = await Portfolio.findById(req.params.id);

        if (!portfolio || String(portfolio.ownerId) !== String(req.session.userId)) {
            return res.status(404).render('error', { message: 'Portfolio not found' });
        }

        res.render('portfolio/add_transaction', { portfolio, error: null });
    } catch (err) {
        console.error('Add transaction page error:', err);
        res.status(500).render('error', { message: 'Error loading page' });
    }
});

// Add transaction POST
router.post('/portfolio/:id/transaction/add', requireLogin, async (req, res) => {
    try {
        const portfolio = await Portfolio.findById(req.params.id);

        if (!portfolio || String(portfolio.ownerId) !== String(req.session.userId)) {
            return res.status(404).render('error', { message: 'Portfolio not found' });
        }

        const { symbol, qty, price, type } = req.body;

        if (!symbol || !qty || !price || !type) {
            return res.render('portfolio/add_transaction', {
                portfolio,
                error: 'All fields are required'
            });
        }

        if (!['BUY', 'SELL'].includes(type.toUpperCase())) {
            return res.render('portfolio/add_transaction', {
                portfolio,
                error: 'Invalid transaction type'
            });
        }

        const quantity = parseFloat(qty);
        const priceValue = parseFloat(price);

        if (isNaN(quantity) || quantity <= 0) {
            return res.render('portfolio/add_transaction', {
                portfolio,
                error: 'Invalid quantity'
            });
        }

        if (isNaN(priceValue) || priceValue <= 0) {
            return res.render('portfolio/add_transaction', {
                portfolio,
                error: 'Invalid price'
            });
        }

        const transaction = new Transaction({
            portfolioId: req.params.id,
            symbol: symbol.toUpperCase().trim(),
            qty: quantity,
            price: priceValue,
            type: type.toUpperCase()
        });

        await transaction.save();
        res.redirect(`/demo/portfolio/${req.params.id}`);
    } catch (err) {
        console.error('Add transaction error:', err);
        const portfolio = await Portfolio.findById(req.params.id);
        res.render('portfolio/add_transaction', {
            portfolio,
            error: 'Failed to add transaction'
        });
    }
});

// Delete portfolio
router.post('/portfolio/:id/delete', requireLogin, async (req, res) => {
    try {
        const portfolio = await Portfolio.findById(req.params.id);

        if (!portfolio || String(portfolio.ownerId) !== String(req.session.userId)) {
            return res.status(404).json({ error: 'Portfolio not found' });
        }

        // Delete all associated transactions
        await Transaction.deleteMany({ portfolioId: req.params.id });

        // Delete the portfolio
        await Portfolio.findByIdAndDelete(req.params.id);

        res.redirect('/demo/dashboard');
    } catch (err) {
        console.error('Delete portfolio error:', err);
        res.status(500).json({ error: 'Failed to delete portfolio' });
    }
});

module.exports = router;