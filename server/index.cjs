const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3001;
const DATA_DIR = path.join(__dirname, '..', 'data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Middleware
app.disable('x-powered-by');
// This is a local data utility, not an authenticated production API.
app.use((req, res, next) => {
    const hosts = new Set(['localhost', '127.0.0.1', '[::1]']);
    if (!hosts.has(req.hostname)) return res.status(403).json({ error: 'Local access only' });
    const origin = req.get('origin');
    if (origin) {
        try {
            const url = new URL(origin);
            if (!hosts.has(url.hostname) || !['http:', 'https:'].includes(url.protocol)
                || !['5173', '4173', '3001'].includes(url.port)) {
                return res.status(403).json({ error: 'Untrusted origin' });
            }
        } catch {
            return res.status(403).json({ error: 'Untrusted origin' });
        }
    } else if (req.get('sec-fetch-site') === 'cross-site') {
        return res.status(403).json({ error: 'Untrusted origin' });
    }
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    next();
});
app.use(express.json());

// Helper to get data file path
const getFilePath = (table) => path.join(DATA_DIR, `${table}.json`);

// Helper to read data
const readData = (table) => {
    const filePath = getFilePath(table);
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, '[]');
        return [];
    }
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
        return [];
    }
};

// Helper to write data
const writeData = (table, data) => {
    fs.writeFileSync(getFilePath(table), JSON.stringify(data, null, 2));
};

// Helper to get next ID
const getNextId = (data) => {
    if (data.length === 0) return 1;
    return Math.max(...data.map(item => item.id || 0)) + 1;
};

// Valid tables
const TABLES = ['groups', 'students', 'student_groups', 'subscriptions', 'lessons', 'schedules', 'attendance', 'tariffs', 'passes', 'pass_groups', 'external_calendars'];

// GET all items from a table
app.get('/api/:table', (req, res) => {
    const { table } = req.params;
    if (!TABLES.includes(table)) {
        return res.status(400).json({ error: 'Invalid table' });
    }
    const data = readData(table);
    res.json(data);
});

// GET single item by ID
app.get('/api/:table/:id', (req, res) => {
    const { table, id } = req.params;
    if (!TABLES.includes(table)) {
        return res.status(400).json({ error: 'Invalid table' });
    }
    const data = readData(table);
    const item = data.find(d => String(d.id) === String(id));
    if (!item) {
        return res.status(404).json({ error: 'Not found' });
    }
    res.json(item);
});

// POST - create new item
app.post('/api/:table', (req, res) => {
    const { table } = req.params;
    if (!TABLES.includes(table)) {
        return res.status(400).json({ error: 'Invalid table' });
    }
    const data = readData(table);
    const newItem = { ...req.body, id: getNextId(data) };
    data.push(newItem);
    writeData(table, data);
    res.status(201).json(newItem);
});

// PUT - update item
app.put('/api/:table/:id', (req, res) => {
    const { table, id } = req.params;
    if (!TABLES.includes(table)) {
        return res.status(400).json({ error: 'Invalid table' });
    }
    const data = readData(table);
    const index = data.findIndex(d => String(d.id) === String(id));
    if (index === -1) {
        return res.status(404).json({ error: 'Not found' });
    }
    data[index] = { ...data[index], ...req.body, id: data[index].id };
    writeData(table, data);
    res.json(data[index]);
});

// DELETE - remove item
app.delete('/api/:table/:id', (req, res) => {
    const { table, id } = req.params;
    if (!TABLES.includes(table)) {
        return res.status(400).json({ error: 'Invalid table' });
    }
    const data = readData(table);
    const index = data.findIndex(d => String(d.id) === String(id));
    if (index === -1) {
        return res.status(404).json({ error: 'Not found' });
    }
    data.splice(index, 1);
    writeData(table, data);
    res.status(204).send();
});

// POST - bulk add items
app.post('/api/:table/bulk', (req, res) => {
    const { table } = req.params;
    if (!TABLES.includes(table)) {
        return res.status(400).json({ error: 'Invalid table' });
    }
    const data = readData(table);
    const items = req.body;
    let nextId = getNextId(data);

    const newItems = items.map(item => ({
        ...item,
        id: item.id || nextId++
    }));

    data.push(...newItems);
    writeData(table, data);
    res.status(201).json(newItems);
});

// DELETE - clear table
app.delete('/api/:table', (req, res) => {
    const { table } = req.params;
    if (!TABLES.includes(table)) {
        return res.status(400).json({ error: 'Invalid table' });
    }
    writeData(table, []);
    res.status(204).send();
});

// Query by field value
app.get('/api/:table/query/:field/:value', (req, res) => {
    const { table, field, value } = req.params;
    if (!TABLES.includes(table)) {
        return res.status(400).json({ error: 'Invalid table' });
    }
    const data = readData(table);
    const results = data.filter(d => String(d[field]) === String(value));
    res.json(results);
});

if (require.main === module) {
    app.listen(PORT, '127.0.0.1', () => {
        console.log(`Suica local API running at http://127.0.0.1:${PORT}`);
    });
}

module.exports = app;
