require('dotenv').config();

// Configuration file for FaxSign Application
module.exports = {
    // Server Configuration
    PORT: process.env.PORT || 3000,
    
    // JWT Configuration
    JWT_SECRET: process.env.JWT_SECRET,
    JWT_EXPIRES_IN: '6h',
    
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
        password: 'admin2025',
        full_name: 'System Administrator',
        role: 'admin'
    },
    
    // Default fax upload user
    DEFAULT_FAX_USER: {
        username: 'faxuser',
        email: 'fax@gmail.com',
        password: 'fax2025',
        full_name: 'Fax User',
        role: 'فاكسات'
    },
    
    // Departments
    DEFAULT_DEPARTMENTS: [
        'فاكسات',
        'افراد',
        'عمليات',
    ],
    FAX_UPLOAD_DEPARTMENT: 'فاكسات',
    
    // Application Settings
    APP_NAME: 'FaxSign',
    APP_DESCRIPTION: 'Fax Signature Management System',
    
    // Security Settings
    PASSWORD_SALT_ROUNDS: 10,
    
    // CORS Settings
    CORS_ORIGIN: ['*'],
    
    // Session Settings
    SESSION_TIMEOUT: 6 * 60 * 60 * 1000 // 6 hours in milliseconds
};

