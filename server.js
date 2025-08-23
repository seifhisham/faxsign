const express = require('express');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const config = require('./config');

const app = express();
const PORT = config.PORT;
const JWT_SECRET = config.JWT_SECRET;

// Middleware
app.use(cors({ origin: config.CORS_ORIGIN }));
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Database setup
const db = new sqlite3.Database(config.DATABASE_PATH);

// Initialize database tables
db.serialize(() => {
    // Users table
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        full_name TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Faxes table
    db.run(`CREATE TABLE IF NOT EXISTS faxes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fax_number TEXT NOT NULL,
        sender_name TEXT NOT NULL,
        received_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        file_path TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        uploaded_by INTEGER,
        FOREIGN KEY (uploaded_by) REFERENCES users (id)
    )`);

    // Signature workflows table
    db.run(`CREATE TABLE IF NOT EXISTS signature_workflows (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fax_id INTEGER NOT NULL,
        workflow_name TEXT NOT NULL,
        created_by INTEGER NOT NULL,
        status TEXT DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (fax_id) REFERENCES faxes (id),
        FOREIGN KEY (created_by) REFERENCES users (id)
    )`);

    // Signers table
    db.run(`CREATE TABLE IF NOT EXISTS signers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workflow_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        email TEXT NOT NULL,
        name TEXT NOT NULL,
        signature_order INTEGER NOT NULL,
        status TEXT DEFAULT 'pending',
        signed_at DATETIME,
        signature_data TEXT,
        FOREIGN KEY (workflow_id) REFERENCES signature_workflows (id),
        FOREIGN KEY (user_id) REFERENCES users (id)
    )`);

    // Create default admin user
    const adminPassword = bcrypt.hashSync(config.DEFAULT_ADMIN.password, config.PASSWORD_SALT_ROUNDS);
    db.run(`INSERT OR IGNORE INTO users (username, email, password, full_name, role) 
            VALUES (?, ?, ?, ?, ?)`, [
                config.DEFAULT_ADMIN.username, 
                config.DEFAULT_ADMIN.email, 
                adminPassword, 
                config.DEFAULT_ADMIN.full_name, 
                config.DEFAULT_ADMIN.role
            ]);

    // Departments table
    db.run(`CREATE TABLE IF NOT EXISTS departments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL
    )`);

    // Attempt to add department columns if they don't exist
    db.run(`ALTER TABLE users ADD COLUMN department_id INTEGER`, () => {});
    db.run(`ALTER TABLE faxes ADD COLUMN assigned_department_id INTEGER`, () => {});

    // Seed default departments
    if (Array.isArray(config.DEFAULT_DEPARTMENTS)) {
        config.DEFAULT_DEPARTMENTS.forEach((deptName) => {
            db.run('INSERT OR IGNORE INTO departments (name) VALUES (?)', [deptName]);
        });
    }

    // Create default privileged users (managers)
    if (Array.isArray(config.DEFAULT_PRIVILEGED_USERS)) {
        config.DEFAULT_PRIVILEGED_USERS.forEach((mgr) => {
            const hashed = bcrypt.hashSync(mgr.password, config.PASSWORD_SALT_ROUNDS);
            db.run(`INSERT OR IGNORE INTO users (username, email, password, full_name, role)
                    VALUES (?, ?, ?, ?, ?)`, [
                mgr.username,
                mgr.email,
                hashed,
                mgr.full_name,
                mgr.role
            ]);
        });
    }
    
    // Create default fax upload user
    if (config.DEFAULT_FAX_USER) {
        const faxUserPassword = bcrypt.hashSync(config.DEFAULT_FAX_USER.password, config.PASSWORD_SALT_ROUNDS);
        db.run(`INSERT OR IGNORE INTO users (username, email, password, full_name, role)
                VALUES (?, ?, ?, ?, ?)`, [
            config.DEFAULT_FAX_USER.username,
            config.DEFAULT_FAX_USER.email,
            faxUserPassword,
            config.DEFAULT_FAX_USER.full_name,
            config.DEFAULT_FAX_USER.role
        ]);
    }
});

// File upload configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, config.UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${uuidv4()}-${file.originalname}`;
        cb(null, uniqueName);
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: config.MAX_FILE_SIZE
    },
    fileFilter: (req, file, cb) => {
        if (config.ALLOWED_FILE_TYPES.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only PDF, JPEG, PNG, and TIFF files are allowed.'), false);
        }
    }
});

// Authentication middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid token' });
        }
        req.user = user;
        next();
    });
};

// Privilege helpers
const isPrivileged = (user) => user && (user.role === 'admin' || user.role === 'manager');
const canUploadFaxes = (user) => user && user.role === 'faxes';

// Routes

// Authentication routes
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;

    db.get(`SELECT u.*, d.name as department_name, d.id as department_id
            FROM users u
            LEFT JOIN departments d ON u.department_id = d.id
            WHERE u.username = ?`, [username], (err, user) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const validPassword = bcrypt.compareSync(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role, department_id: user.department_id || null, department_name: user.department_name || null },
            JWT_SECRET,
            { expiresIn: config.JWT_EXPIRES_IN }
        );

        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                full_name: user.full_name,
                role: user.role,
                department_id: user.department_id || null,
                department_name: user.department_name || null
            }
        });
    });
});

app.post('/api/auth/register', (req, res) => {
    const { username, email, password, full_name } = req.body;
    const hashedPassword = bcrypt.hashSync(password, config.PASSWORD_SALT_ROUNDS);

    db.run(
        'INSERT INTO users (username, email, password, full_name) VALUES (?, ?, ?, ?)',
        [username, email, hashedPassword, full_name],
        function(err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                    return res.status(400).json({ error: 'Username or email already exists' });
                }
                return res.status(500).json({ error: 'Database error' });
            }

            res.json({ message: 'User created successfully', userId: this.lastID });
        }
    );
});

// Fax routes
app.post('/api/faxes/upload', authenticateToken, upload.single('fax'), (req, res) => {
    // Allow both 'faxes' and privileged users to upload
    if (!(req.user.role === 'faxes' || req.user.role === 'admin' || req.user.role === 'manager')) {
        return res.status(403).json({ error: 'Only users with faxes, admin, or manager role can upload faxes' });
    }
    const { fax_number, sender_name } = req.body;
    const file_path = req.file.path;

    db.run(
        'INSERT INTO faxes (fax_number, sender_name, file_path, uploaded_by, assigned_department_id) VALUES (?, ?, ?, ?, ?)',
        [fax_number, sender_name, file_path, req.user.id, req.user.department_id || null],
        function(err) {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            res.json({ message: 'Fax uploaded successfully', faxId: this.lastID });
        }
    );
});

app.get('/api/faxes', authenticateToken, (req, res) => {
    const params = [];
    let whereClause = '';
    if (!(req.user.role === 'faxes' || req.user.role === 'admin' || req.user.role === 'manager')) {
        whereClause = 'WHERE f.assigned_department_id = ?';
        params.push(req.user.department_id || -1);
    }
    const sql = `SELECT f.*, u.full_name as uploaded_by_name, d.name as assigned_department_name
                 FROM faxes f
                 LEFT JOIN users u ON f.uploaded_by = u.id
                 LEFT JOIN departments d ON f.assigned_department_id = d.id
                 ${whereClause}
                 ORDER BY f.received_date DESC`;
    db.all(sql, params, (err, faxes) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(faxes);
    });
});

app.get('/api/faxes/:id', authenticateToken, (req, res) => {
    db.get(
        `SELECT f.*, u.full_name as uploaded_by_name, d.name as assigned_department_name
         FROM faxes f 
         LEFT JOIN users u ON f.uploaded_by = u.id 
         LEFT JOIN departments d ON f.assigned_department_id = d.id
         WHERE f.id = ?`,
        [req.params.id],
        (err, fax) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            if (!fax) {
                return res.status(404).json({ error: 'Fax not found' });
            }
            if (!isPrivileged(req.user) && (fax.assigned_department_id !== req.user.department_id)) {
                return res.status(403).json({ error: 'Access denied' });
            }
            res.json(fax);
        }
    );
});

// Departments
app.get('/api/departments', authenticateToken, (req, res) => {
    db.all('SELECT id, name FROM departments ORDER BY name', (err, rows) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(rows);
    });
});

// Create new department (admin only)
app.post('/api/departments', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Only administrators can create departments' });
    }
    
    const { name } = req.body;
    if (!name || name.trim().length === 0) {
        return res.status(400).json({ error: 'Department name is required' });
    }
    
    db.run('INSERT INTO departments (name) VALUES (?)', [name.trim()], function(err) {
        if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
                return res.status(400).json({ error: 'Department name already exists' });
            }
            return res.status(500).json({ error: 'Database error' });
        }
        res.json({ message: 'Department created successfully', departmentId: this.lastID });
    });
});

// Update department (admin only)
app.put('/api/departments/:id', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Only administrators can modify departments' });
    }
    
    const departmentId = parseInt(req.params.id, 10);
    const { name } = req.body;
    
    if (!name || name.trim().length === 0) {
        return res.status(400).json({ error: 'Department name is required' });
    }
    
    db.run('UPDATE departments SET name = ? WHERE id = ?', [name.trim(), departmentId], function(err) {
        if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
                return res.status(400).json({ error: 'Department name already exists' });
            }
            return res.status(500).json({ error: 'Database error' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Department not found' });
        }
        res.json({ message: 'Department updated successfully' });
    });
});

// Delete department (admin only)
app.delete('/api/departments/:id', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Only administrators can delete departments' });
    }
    
    const departmentId = parseInt(req.params.id, 10);
    
    // Check if department is in use
    db.get('SELECT COUNT(*) as count FROM users WHERE department_id = ?', [departmentId], (err, result) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        
        if (result.count > 0) {
            return res.status(400).json({ error: 'Cannot delete department: users are still assigned to it' });
        }
        
        db.run('DELETE FROM departments WHERE id = ?', [departmentId], function(err) {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            if (this.changes === 0) {
                return res.status(404).json({ error: 'Department not found' });
            }
            res.json({ message: 'Department deleted successfully' });
        });
    });
});

// Assign fax to a department (privileged only)
app.post('/api/faxes/:id/assign-department', authenticateToken, (req, res) => {
    if (!isPrivileged(req.user)) {
        return res.status(403).json({ error: 'Only managers or admins can assign faxes' });
    }
    const faxId = parseInt(req.params.id, 10);
    const { department_id } = req.body;
    if (!department_id) {
        return res.status(400).json({ error: 'department_id is required' });
    }
    db.get('SELECT id FROM departments WHERE id = ?', [department_id], (err, dept) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        if (!dept) {
            return res.status(400).json({ error: 'Invalid department_id' });
        }
        db.run('UPDATE faxes SET assigned_department_id = ? WHERE id = ?', [department_id, faxId], function(updateErr) {
            if (updateErr) {
                return res.status(500).json({ error: 'Database error' });
            }
            return res.json({ message: 'Fax assigned successfully' });
        });
    });
});

// Assign user to a department (privileged only)
app.patch('/api/users/:id/department', authenticateToken, (req, res) => {
    if (!isPrivileged(req.user)) {
        return res.status(403).json({ error: 'Only managers or admins can assign users to departments' });
    }
    const userId = parseInt(req.params.id, 10);
    const { department_id } = req.body;
    
    // Allow null/undefined to unassign from department
    if (department_id === null || department_id === undefined) {
        db.run('UPDATE users SET department_id = NULL WHERE id = ?', [userId], function(updateErr) {
            if (updateErr) {
                return res.status(500).json({ error: 'Database error' });
            }
            return res.json({ message: 'User department unassigned successfully' });
        });
        return;
    }
    
    // Validate department_id if provided
    if (!department_id) {
        return res.status(400).json({ error: 'department_id is required' });
    }
    
    db.get('SELECT id FROM departments WHERE id = ?', [department_id], (err, dept) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        if (!dept) {
            return res.status(400).json({ error: 'Invalid department_id' });
        }
        db.run('UPDATE users SET department_id = ? WHERE id = ?', [department_id, userId], function(updateErr) {
            if (updateErr) {
                return res.status(500).json({ error: 'Database error' });
            }
            return res.json({ message: 'User department updated successfully' });
        });
    });
});

// Update user role (admin only)
app.patch('/api/users/:id/role', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Only administrators can modify user roles' });
    }
    const userId = parseInt(req.params.id, 10);
    const { role } = req.body;
    
    if (!role || !['admin', 'manager', 'user', 'faxes'].includes(role)) {
        return res.status(400).json({ error: 'Valid role (admin, manager, user, or faxes) is required' });
    }
    
    // Prevent admin from changing their own role
    if (userId === req.user.id) {
        return res.status(400).json({ error: 'Cannot modify your own role' });
    }
    
    db.run('UPDATE users SET role = ? WHERE id = ?', [role, userId], function(updateErr) {
        if (updateErr) {
            return res.status(500).json({ error: 'Database error' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        return res.json({ message: 'User role updated successfully' });
    });
});

// Signature workflow routes
app.post('/api/workflows', authenticateToken, (req, res) => {
    const { fax_id, workflow_name, signers } = req.body;

    // Ensure requester has access to the fax
    db.get('SELECT assigned_department_id FROM faxes WHERE id = ?', [fax_id], (err, fax) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        if (!fax) {
            return res.status(404).json({ error: 'Fax not found' });
        }
        if (!isPrivileged(req.user) && (fax.assigned_department_id !== req.user.department_id)) {
            return res.status(403).json({ error: 'Access denied to create workflow for this fax' });
        }

        db.run(
            'INSERT INTO signature_workflows (fax_id, workflow_name, created_by) VALUES (?, ?, ?)',
            [fax_id, workflow_name, req.user.id],
            function(err2) {
                if (err2) {
                    return res.status(500).json({ error: 'Database error' });
                }

                const workflowId = this.lastID;
                let completed = 0;
                const total = signers.length;

                signers.forEach((signer, index) => {
                    db.run(
                        'INSERT INTO signers (workflow_id, user_id, email, name, signature_order) VALUES (?, ?, ?, ?, ?)',
                        [workflowId, signer.user_id, signer.email, signer.name, index + 1],
                        (err3) => {
                            if (err3) {
                                console.error('Error adding signer:', err3);
                            }
                            completed++;
                            if (completed === total) {
                                res.json({ message: 'Workflow created successfully', workflowId });
                            }
                        }
                    );
                });
            }
        );
    });
});

app.get('/api/workflows', authenticateToken, (req, res) => {
    const params = [];
    let whereClause = '';
    if (!isPrivileged(req.user)) {
        whereClause = 'WHERE f.assigned_department_id = ?';
        params.push(req.user.department_id || -1);
    }
    const sql = `SELECT w.*, f.fax_number, f.sender_name, u.full_name as created_by_name
                 FROM signature_workflows w
                 LEFT JOIN faxes f ON w.fax_id = f.id
                 LEFT JOIN users u ON w.created_by = u.id
                 ${whereClause}
                 ORDER BY w.created_at DESC`;
    db.all(sql, params, (err, workflows) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(workflows);
    });
});

app.get('/api/workflows/:id', authenticateToken, (req, res) => {
    const workflowId = req.params.id;

    db.get(
        `SELECT w.*, f.fax_number, f.sender_name, f.file_path, f.assigned_department_id, u.full_name as created_by_name
         FROM signature_workflows w
         LEFT JOIN faxes f ON w.fax_id = f.id
         LEFT JOIN users u ON w.created_by = u.id
         WHERE w.id = ?`,
        [workflowId],
        (err, workflow) => {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            if (!workflow) {
                return res.status(404).json({ error: 'Workflow not found' });
            }
            if (!isPrivileged(req.user) && (workflow.assigned_department_id !== req.user.department_id)) {
                return res.status(403).json({ error: 'Access denied' });
            }

            // Get signers for this workflow
            db.all(
                `SELECT s.*, u.full_name as user_full_name
                 FROM signers s
                 LEFT JOIN users u ON s.user_id = u.id
                 WHERE s.workflow_id = ?
                 ORDER BY s.signature_order`,
                [workflowId],
                (err, signers) => {
                    if (err) {
                        return res.status(500).json({ error: 'Database error' });
                    }
                    workflow.signers = signers;
                    res.json(workflow);
                }
            );
        }
    );
});

// Signature routes
app.post('/api/sign/:workflowId', authenticateToken, (req, res) => {
    const { signature_data } = req.body;
    const workflowId = req.params.workflowId;

    db.run(
        `UPDATE signers 
         SET status = 'signed', signed_at = CURRENT_TIMESTAMP, signature_data = ?
         WHERE workflow_id = ? AND user_id = ? AND status = 'pending'`,
        [signature_data, workflowId, req.user.id],
        function(err) {
            if (err) {
                return res.status(500).json({ error: 'Database error' });
            }
            if (this.changes === 0) {
                return res.status(400).json({ error: 'No pending signature found for this user' });
            }
            res.json({ message: 'Document signed successfully' });
        }
    );
});

app.get('/api/users', authenticateToken, (req, res) => {
    db.all(`SELECT u.id, u.username, u.email, u.full_name, u.role, u.department_id, d.name as department_name
            FROM users u
            LEFT JOIN departments d ON u.department_id = d.id
            ORDER BY u.full_name`, (err, users) => {
        if (err) {
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(users);
    });
});

// Serve the main application
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve registration page
app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// Create uploads directory if it doesn't exist
const fs = require('fs');
if (!fs.existsSync(config.UPLOAD_DIR)) {
    fs.mkdirSync(config.UPLOAD_DIR);
}

app.listen(PORT, () => {
    console.log(`🚀 ${config.APP_NAME} application running on http://localhost:${PORT}`);
    console.log(`📝 ${config.APP_DESCRIPTION}`);
    console.log('🔑 Default admin credentials:');
    console.log(`   Username: ${config.DEFAULT_ADMIN.username}`);
    console.log(`   Password: ${config.DEFAULT_ADMIN.password}`);
    console.log('📁 Database:', config.DATABASE_PATH);
    console.log('📂 Upload directory:', config.UPLOAD_DIR);
});
