require('dotenv').config();

// Configuration file for FaxSign Application
module.exports = {
    // Server Configuration
    PORT: process.env.PORT || 3000,
    
    // JWT Configuration
    JWT_SECRET: process.env.JWT_SECRET,
    JWT_EXPIRES_IN: '24h',
    
    // Database Configuration
    DATABASE_PATH: './faxsign.db',
    
    // File Upload Configuration
    UPLOAD_DIR: 'uploads/',
    MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
    ALLOWED_FILE_TYPES: [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/tiff'
    ],
    
    // Default Admin User
    DEFAULT_ADMIN: {
        username: 'admin',
        email: 'admin@company.com',
        password: 'admin123',
        full_name: 'System Administrator',
        role: 'admin'
    },
    // Users with full fax visibility and assignment permissions
    DEFAULT_PRIVILEGED_USERS: [
        { username: 'manager1', email: 'manager1@company.com', password: 'manager123', full_name: 'Fax Manager One', role: 'manager' },
        { username: 'manager2', email: 'manager2@company.com', password: 'manager123', full_name: 'Fax Manager Two', role: 'manager' },
        { username: 'manager3', email: 'manager3@company.com', password: 'manager123', full_name: 'Fax Manager Three', role: 'manager' }
    ],
    
    // Default fax upload user
    DEFAULT_FAX_USER: {
        username: 'faxuser',
        email: 'fax@company.com',
        password: 'fax123',
        full_name: 'Fax Upload User',
        role: 'faxes'
    },
    
    // Departments
    DEFAULT_DEPARTMENTS: [
        'Faxes',
        'HR',
        'Finance'
    ],
    FAX_UPLOAD_DEPARTMENT: 'Faxes',
    
    // Application Settings
    APP_NAME: 'FaxSign',
    APP_DESCRIPTION: 'Fax Signature Management System',
    
    // Security Settings
    PASSWORD_SALT_ROUNDS: 10,
    
    // CORS Settings
    CORS_ORIGIN: '*', // Change this in production
    
    // Session Settings
    SESSION_TIMEOUT: 24 * 60 * 60 * 1000 // 24 hours in milliseconds
};

